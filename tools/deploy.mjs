import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  paginateListObjectsV2,
} from '@aws-sdk/client-s3';
import {
  CloudFrontClient,
  CreateInvalidationCommand,
  waitUntilInvalidationCompleted,
} from '@aws-sdk/client-cloudfront';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  isMediaKey,
  mediaPrefixes,
  publicationOrder,
  prepareObject,
} from './delivery-plan.mjs';
const REPOSITORY = 'jthingelstad/poap.thingelstad.xyz';
const config = JSON.parse(await fs.readFile('infra/deployment.json', 'utf8'));
if (
  process.env.GITHUB_REPOSITORY !== REPOSITORY ||
  process.env.GITHUB_REF !== 'refs/heads/main' ||
  !/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA || '')
)
  throw new Error('Only this repository main branch can publish');
if (!config.distributionId || !config.deploymentRoleArn)
  throw new Error(
    'infra/deployment.json is not complete; run the infrastructure bootstrap first',
  );
const settings = { region: config.region, maxAttempts: 5 };
const identity = await new STSClient(settings).send(
  new GetCallerIdentityCommand({}),
);
const expectedRole = config.deploymentRoleArn.split('/').at(-1);
if (
  identity.Account !== config.account ||
  !identity.Arn.includes(`:assumed-role/${expectedRole}/`)
)
  throw new Error('Unexpected deployment identity');
async function assertCurrentHead() {
  const response = await fetch(
    `https://api.github.com/repos/${REPOSITORY}/git/ref/heads/main`,
    {
      headers: {
        authorization: `Bearer ${process.env.GH_TOKEN}`,
        accept: 'application/vnd.github+json',
      },
      signal: AbortSignal.timeout(15000),
    },
  );
  if (
    !response.ok ||
    (await response.json()).object.sha !== process.env.GITHUB_SHA
  )
    throw new Error('Refusing to publish a superseded main revision');
}
await assertCurrentHead();
const revision = JSON.parse(await fs.readFile('dist/revision.json', 'utf8'));
if (revision.commit !== process.env.GITHUB_SHA)
  throw new Error('Build artifact does not match this commit');
const s3 = new S3Client(settings),
  cdn = new CloudFrontClient(settings);
const existing = new Set();
for await (const page of paginateListObjectsV2(
  { client: s3 },
  { Bucket: config.siteBucket },
))
  for (const item of page.Contents || [])
    if (!isMediaKey(item.Key)) existing.add(item.Key);
async function files(folder) {
  let result = [];
  for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
    const name = path.join(folder, entry.name);
    if (entry.isSymbolicLink())
      throw new Error('Symlink in publication output');
    if (entry.isDirectory()) result.push(...(await files(name)));
    else result.push(path.relative('dist', name).split(path.sep).join('/'));
  }
  return result;
}
const ordered = publicationOrder(await files('dist'));
// Media is published once by tools/media.mjs; deploys only publish pages.
const media = ordered.filter(isMediaKey);
if (media.length)
  throw new Error(`Media in the site build: ${media.slice(0, 5).join(', ')}`);
let uploaded = 0,
  unchanged = 0;
const replaced = [];
async function upload(key) {
  const object = prepareObject(key, await fs.readFile(path.join('dist', key)));
  if (existing.has(key)) {
    const head = await s3.send(
      new HeadObjectCommand({ Bucket: config.siteBucket, Key: key }),
    );
    if (
      head.Metadata?.sha256 === object.Metadata.sha256 &&
      head.ContentEncoding === object.ContentEncoding &&
      head.ContentType === object.ContentType &&
      head.CacheControl === object.CacheControl
    ) {
      unchanged++;
      return;
    }
  }
  await s3.send(
    new PutObjectCommand({ Bucket: config.siteBucket, Key: key, ...object }),
  );
  if (existing.has(key)) replaced.push(key);
  uploaded++;
}
// Complete assets and scripts before replacing pages. Retain old assets.
for (const group of [
  ordered.filter((k) => !k.endsWith('.html') && k !== 'revision.json'),
  ordered.filter((k) => k.endsWith('.html')),
]) {
  await assertCurrentHead();
  let next = 0;
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (next < group.length) await upload(group[next++]);
    }),
  );
}
await upload('revision.json');
// Refresh pages, never media: wildcards for folders that hold only pages.
const mediaFolders = new Set(
  mediaPrefixes.map((prefix) => prefix.split('/')[0]),
);
const paths = [
  ...new Set([
    ...ordered
      .filter((key) => !key.startsWith('_astro/'))
      .flatMap((key) => {
        const [folder] = key.split('/');
        if (folder === key)
          return key === 'index.html' ? ['/', `/${key}`] : [`/${key}`];
        if (!mediaFolders.has(folder)) return [`/${folder}/*`];
        return key.endsWith('/index.html')
          ? [`/${key.slice(0, -'index.html'.length)}`, `/${key}`]
          : [`/${key}`];
      }),
    // Hashed bundles keep their bytes; one replaced in place had its headers
    // change (as when objects stopped being stored gzip-encoded), so its
    // cached copies go too.
    ...replaced
      .filter((key) => key.startsWith('_astro/'))
      .map((key) => `/${key}`),
  ]),
];
const invalidation = await cdn.send(
  new CreateInvalidationCommand({
    DistributionId: config.distributionId,
    InvalidationBatch: {
      CallerReference: `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`,
      Paths: { Quantity: paths.length, Items: paths },
    },
  }),
);
await waitUntilInvalidationCompleted(
  { client: cdn, maxWaitTime: 600, minDelay: 10 },
  { DistributionId: config.distributionId, Id: invalidation.Invalidation.Id },
);
for (const route of ['/', '/about/', '/revision.json']) {
  const response = await fetch(new URL(route, config.deliveryUrl), {
    signal: AbortSignal.timeout(30000),
  });
  const delivered = Buffer.from(await response.arrayBuffer());
  const source = await fs.readFile(
    path.join('dist', route.endsWith('/') ? route + 'index.html' : route),
  );
  if (
    !response.ok ||
    createHash('sha256').update(delivered).digest('hex') !==
      createHash('sha256').update(source).digest('hex')
  )
    throw new Error(`Published bytes differ: ${route}`);
}
console.log(
  JSON.stringify({
    commit: process.env.GITHUB_SHA,
    uploaded,
    unchanged,
    url: config.deliveryUrl,
    invalidation: invalidation.Invalidation.Id,
  }),
);
