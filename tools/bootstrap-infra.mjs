// Create the site's CloudFormation stacks and print the DNS records.
//
//   node tools/bootstrap-infra.mjs plan    create change sets, print them, execute nothing
//   node tools/bootstrap-infra.mjs apply   execute the change sets, in order
//   node tools/bootstrap-infra.mjs attach  once the certificate is ISSUED: give the
//                                          distribution its alias and certificate
//
// Run with the cloud-engineer identity in us-east-1. Order: certificate, storage,
// site, storage again (the bucket policy needs the distribution id), delivery.
// Each run rewrites infra/deployment.json from the live stacks and prints the DNS
// records Jamie adds at Namecheap. Infrastructure changes after bootstrap go
// through reviewed change sets, never through the GitHub delivery role.
import {
  CloudFormationClient,
  CreateChangeSetCommand,
  DescribeChangeSetCommand,
  DescribeStacksCommand,
  ExecuteChangeSetCommand,
  waitUntilChangeSetCreateComplete,
  waitUntilStackCreateComplete,
  waitUntilStackUpdateComplete,
} from '@aws-sdk/client-cloudformation';
import { ACMClient, DescribeCertificateCommand } from '@aws-sdk/client-acm';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import fs from 'node:fs/promises';

const mode = process.argv[2];
if (!['plan', 'apply', 'attach'].includes(mode))
  throw new Error('Usage: node tools/bootstrap-infra.mjs plan|apply|attach');
const config = JSON.parse(await fs.readFile('infra/deployment.json', 'utf8'));
const settings = { region: config.region, maxAttempts: 5 };
const identity = await new STSClient(settings).send(
  new GetCallerIdentityCommand({}),
);
if (identity.Account !== config.account)
  throw new Error(`Unexpected AWS account ${identity.Account}`);
console.log(`Identity ${identity.Arn}`);
const cfn = new CloudFormationClient(settings);
const Tags = Object.entries(config.stackTags).map(([Key, Value]) => ({
  Key,
  Value,
}));
const template = (name) => fs.readFile(`infra/${name}.json`, 'utf8');

async function stack(name) {
  try {
    const { Stacks } = await cfn.send(
      new DescribeStacksCommand({ StackName: name }),
    );
    // A CREATE change set left by `plan` parks a new stack in REVIEW_IN_PROGRESS
    // with no resources; it still takes a CREATE change set, never an UPDATE.
    if (Stacks[0].StackStatus === 'REVIEW_IN_PROGRESS') return undefined;
    return Stacks[0];
  } catch (error) {
    if (/does not exist/.test(error.message)) return undefined;
    throw error;
  }
}
const outputs = (s) =>
  Object.fromEntries(
    (s?.Outputs || []).map((o) => [o.OutputKey, o.OutputValue]),
  );

// Create or update one stack through a change set, so the plan is visible
// before anything runs.
async function converge(name, file, parameters = {}, capabilities = []) {
  const existing = await stack(name);
  const type = existing ? 'UPDATE' : 'CREATE';
  const ChangeSetName = `bootstrap-${Date.now()}`;
  await cfn.send(
    new CreateChangeSetCommand({
      StackName: name,
      ChangeSetName,
      ChangeSetType: type,
      TemplateBody: await template(file),
      Parameters: Object.entries(parameters).map(
        ([ParameterKey, ParameterValue]) => ({
          ParameterKey,
          ParameterValue,
        }),
      ),
      Capabilities: capabilities,
      Tags,
    }),
  );
  try {
    await waitUntilChangeSetCreateComplete(
      { client: cfn, maxWaitTime: 300 },
      { StackName: name, ChangeSetName },
    );
  } catch (error) {
    const { StatusReason } = await cfn.send(
      new DescribeChangeSetCommand({ StackName: name, ChangeSetName }),
    );
    if (
      /didn't contain changes|No updates are to be performed/.test(
        StatusReason || '',
      )
    ) {
      console.log(`${name}: no changes`);
      return existing;
    }
    throw new Error(`${name}: ${StatusReason || error.message}`, {
      cause: error,
    });
  }
  const { Changes } = await cfn.send(
    new DescribeChangeSetCommand({ StackName: name, ChangeSetName }),
  );
  console.log(`${name} (${type}):`);
  for (const c of Changes)
    console.log(
      `  ${c.ResourceChange.Action} ${c.ResourceChange.LogicalResourceId} ${c.ResourceChange.ResourceType}`,
    );
  if (mode === 'plan') return existing;
  await cfn.send(
    new ExecuteChangeSetCommand({ StackName: name, ChangeSetName }),
  );
  const wait =
    type === 'CREATE'
      ? waitUntilStackCreateComplete
      : waitUntilStackUpdateComplete;
  await wait({ client: cfn, maxWaitTime: 1800 }, { StackName: name });
  return stack(name);
}

const { stacks } = config;
const cert = outputs(await converge(stacks.certificate, 'certificate'));
let storage = outputs(
  await converge(stacks.storage, 'storage', { DistributionId: '' }),
);
const siteBucket = storage.SiteBucket || config.siteBucket;
const siteExisting = outputs(await stack(stacks.site));
const certificateArn =
  mode === 'attach' ? cert.CertificateArn : siteExisting.CertificateArn || '';
let site = outputs(
  await converge(stacks.site, 'site', {
    SiteBucket: siteBucket,
    CertificateArn: certificateArn,
  }),
);
if (site.DistributionId)
  storage = outputs(
    await converge(stacks.storage, 'storage', {
      DistributionId: site.DistributionId,
    }),
  );
const delivery = outputs(
  await converge(
    stacks.delivery,
    'delivery',
    {
      ArchiveBucket: storage.ArchiveBucket || config.archiveBucket,
      SiteBucket: siteBucket,
      DistributionId: site.DistributionId || 'PENDING',
    },
    ['CAPABILITY_IAM'],
  ),
);

if (mode !== 'plan') {
  const next = {
    ...config,
    archiveBucket: storage.ArchiveBucket || config.archiveBucket,
    siteBucket,
    distributionId: site.DistributionId || null,
    cloudfrontDomain: site.DistributionDomain || null,
    deliveryUrl: site.DistributionDomain
      ? `https://${site.DistributionDomain}/`
      : null,
    certificateArn: cert.CertificateArn || null,
    buildRoleArn: delivery.BuildRoleArn || null,
    deploymentRoleArn: delivery.DeploymentRoleArn || null,
  };
  await fs.writeFile(
    'infra/deployment.json',
    JSON.stringify(next, null, 2) + '\n',
  );
  console.log('Wrote infra/deployment.json');
}

// DNS records for Namecheap (host values are relative to thingelstad.xyz).
if (cert.CertificateArn) {
  const { Certificate } = await new ACMClient(settings).send(
    new DescribeCertificateCommand({ CertificateArn: cert.CertificateArn }),
  );
  const record = Certificate.DomainValidationOptions?.[0]?.ResourceRecord;
  console.log(`\nCertificate ${Certificate.Status}`);
  if (record)
    console.log(
      `DNS  CNAME  host ${record.Name.replace(/\.thingelstad\.xyz\.?$/, '')}  ->  ${record.Value.replace(/\.$/, '')}   (ACM validation; keep for renewal)`,
    );
}
if (site.DistributionDomain)
  console.log(
    `DNS  CNAME  host poap  ->  ${site.DistributionDomain}   (the site)`,
  );
if (delivery.DeploymentRoleArn)
  console.log(
    `\nGitHub repository variable AWS_DEPLOY_ROLE_ARN = ${delivery.DeploymentRoleArn}`,
  );
