// Published media: the drop artwork and its WebP renderings. Generated once
// into media/ (npm run media:build), uploaded once to the site bucket and
// afterwards only referenced by URL. Site builds and deploys never read or
// write them.
//
//   node tools/media.mjs publish   upload new files from media/ (write-once),
//                                  fix headers, then rewrite data/media.json
//   node tools/media.mjs snapshot  rewrite data/media.json from the bucket
//   node tools/media.mjs verify    read-only: bucket matches data/media.json
//
// Run locally with the cloud-engineer identity. An existing key is never
// replaced; a new rendering needs new key names.
import {
  S3Client,
  HeadObjectCommand,
  PutObjectCommand,
  CopyObjectCommand,
  paginateListObjectsV2,
} from '@aws-sdk/client-s3';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import fs from 'node:fs/promises';
import { immutable, isMediaKey, prepareObject } from './delivery-plan.mjs';

const command = process.argv[2];
if (!['publish', 'snapshot', 'verify'].includes(command))
  throw new Error('Usage: node tools/media.mjs publish|snapshot|verify');
const config = JSON.parse(await fs.readFile('infra/deployment.json', 'utf8'));
if (!config.siteBucket)
  throw new Error('infra/deployment.json has no siteBucket yet');
const settings = { region: config.region, maxAttempts: 5 };
const identity = await new STSClient(settings).send(
  new GetCallerIdentityCommand({}),
);
if (identity.Account !== config.account)
  throw new Error(`Unexpected AWS account ${identity.Account}`);
const s3 = new S3Client(settings);
const Bucket = config.siteBucket;
const manifestPath = 'data/media.json';
const current = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const artwork = JSON.parse(await fs.readFile('data/artwork.json', 'utf8'));
// Every key the site references.
const expected = artwork
  .flatMap((item) => [
    item.key,
    ...current.rasterWidths.map((width) => `raster/${item.drop}-${width}.webp`),
  ])
  .sort();
const originalHash = new Map(artwork.map((item) => [item.key, item.sha256]));

async function inBatches(items, work) {
  let next = 0;
  await Promise.all(
    Array.from({ length: 16 }, async () => {
      while (next < items.length) await work(items[next++]);
    }),
  );
}
async function listMedia() {
  const keys = new Set();
  for await (const page of paginateListObjectsV2({ client: s3 }, { Bucket }))
    for (const item of page.Contents || [])
      if (isMediaKey(item.Key)) keys.add(item.Key);
  return keys;
}
async function head(key) {
  try {
    return await s3.send(new HeadObjectCommand({ Bucket, Key: key }));
  } catch (error) {
    if (error.name === 'NotFound') return undefined;
    throw error;
  }
}

if (command === 'publish') {
  const existing = await listMedia();
  let uploaded = 0;
  await inBatches(expected, async (key) => {
    if (existing.has(key)) return;
    let bytes;
    try {
      bytes = await fs.readFile(`media/${key}`);
    } catch (error) {
      if (error.code === 'ENOENT')
        throw new Error(`Missing from the bucket and media/: ${key}`, {
          cause: error,
        });
      throw error;
    }
    // IfNoneMatch makes S3 refuse the write if the key appeared meanwhile.
    await s3.send(
      new PutObjectCommand({
        Bucket,
        Key: key,
        IfNoneMatch: '*',
        ...prepareObject(key, bytes),
      }),
    );
    uploaded++;
  });
  console.log(`Uploaded ${uploaded} new media objects`);
}

if (command === 'verify') {
  const problems = [];
  await inBatches(Object.keys(current.objects), async (key) => {
    const object = await head(key);
    if (!object) problems.push(`missing ${key}`);
    else if (object.Metadata?.sha256 !== current.objects[key])
      problems.push(`changed ${key}`);
    else if (object.CacheControl !== immutable)
      problems.push(`not immutable ${key}`);
  });
  for (const key of expected.filter((key) => !(key in current.objects)))
    problems.push(`not in ${manifestPath}: ${key}`);
  if (problems.length) throw new Error(problems.sort().slice(0, 20).join('\n'));
  console.log(
    `Verified ${Object.keys(current.objects).length} media objects against ${manifestPath}`,
  );
} else {
  // publish and snapshot: record what the bucket holds, fixing cache headers
  // in place (a server-side copy; no bytes leave S3).
  const objects = {};
  let fixed = 0;
  await inBatches(expected, async (key) => {
    const object = await head(key);
    if (!object) throw new Error(`Missing from the bucket: ${key}`);
    const sha256 = object.Metadata?.sha256;
    if (!/^[a-f0-9]{64}$/.test(sha256 || ''))
      throw new Error(`No sha256 metadata: ${key}`);
    if (current.objects[key] && current.objects[key] !== sha256)
      throw new Error(`Published media changed: ${key}`);
    if (originalHash.has(key) && originalHash.get(key) !== sha256)
      throw new Error(`Published original differs from the archive: ${key}`);
    objects[key] = sha256;
    if (object.CacheControl === immutable) return;
    await s3.send(
      new CopyObjectCommand({
        Bucket,
        Key: key,
        CopySource: `${Bucket}/${key}`,
        MetadataDirective: 'REPLACE',
        ContentType: object.ContentType,
        ...(object.ContentEncoding
          ? { ContentEncoding: object.ContentEncoding }
          : {}),
        CacheControl: immutable,
        Metadata: { sha256 },
      }),
    );
    fixed++;
  });
  const unreferenced = [...(await listMedia())].filter(
    (key) => !(key in objects),
  );
  await fs.writeFile(
    manifestPath,
    JSON.stringify(
      {
        ...current,
        objects: Object.fromEntries(
          Object.keys(objects)
            .sort()
            .map((key) => [key, objects[key]]),
        ),
      },
      null,
      1,
    ) + '\n',
  );
  console.log(
    `Recorded ${Object.keys(objects).length} media objects in ${manifestPath}; fixed headers on ${fixed}; ${unreferenced.length} unreferenced media keys in the bucket`,
  );
}
