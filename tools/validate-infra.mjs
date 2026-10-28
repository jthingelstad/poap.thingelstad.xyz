import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { mediaPrefixes } from './delivery-plan.mjs';
const read = async (name) =>
  JSON.parse(await fs.readFile(`infra/${name}.json`, 'utf8'));
const storage = await read('storage'),
  site = await read('site'),
  delivery = await read('delivery'),
  certificate = await read('certificate'),
  deployment = await read('deployment');
const DOMAIN = 'poap.thingelstad.xyz';
const SUBJECT = 'repo:jthingelstad@5351/poap.thingelstad.xyz@1423310267';
for (const name of ['ArchiveBucket', 'SiteBucket']) {
  const resource = storage.Resources[name],
    p = resource.Properties;
  assert.equal(resource.DeletionPolicy, 'Retain');
  assert.equal(resource.UpdateReplacePolicy, 'Retain');
  assert.deepEqual(p.PublicAccessBlockConfiguration, {
    BlockPublicAcls: true,
    IgnorePublicAcls: true,
    BlockPublicPolicy: true,
    RestrictPublicBuckets: true,
  });
  assert.equal(p.VersioningConfiguration.Status, 'Enabled');
  assert.equal(
    p.BucketEncryption.ServerSideEncryptionConfiguration[0]
      .ServerSideEncryptionByDefault.SSEAlgorithm,
    'AES256',
  );
  const policy =
    storage.Resources[name + 'Policy'].Properties.PolicyDocument.Statement;
  assert.ok(
    policy.some(
      (s) =>
        s.Effect === 'Deny' &&
        s.Condition?.Bool?.['aws:SecureTransport'] === 'false',
    ),
  );
}
const lifecycle = (name) =>
  storage.Resources[name].Properties.LifecycleConfiguration.Rules;
assert.ok(
  lifecycle('SiteBucket').some(
    (rule) =>
      rule.Status === 'Enabled' &&
      rule.NoncurrentVersionExpiration?.NoncurrentDays === 30,
  ),
);
assert.ok(
  !JSON.stringify(lifecycle('ArchiveBucket')).includes('Expiration'),
  'The archive bucket never expires versions',
);
assert.equal(certificate.Resources.Certificate.Properties.DomainName, DOMAIN);
assert.equal(
  certificate.Resources.Certificate.Properties.ValidationMethod,
  'DNS',
);
assert.ok(
  !JSON.stringify(site).includes('s3-website'),
  'Use signed HTTPS origins',
);
assert.equal(
  site.Resources.OriginAccess.Properties.OriginAccessControlConfig
    .SigningBehavior,
  'always',
);
const dist = site.Resources.Distribution.Properties.DistributionConfig;
assert.equal(
  dist.DefaultCacheBehavior.ViewerProtocolPolicy,
  'redirect-to-https',
);
assert.deepEqual(dist.Aliases['Fn::If'][1], [DOMAIN]);
assert.equal(site.Resources.CachePolicy.Properties.CachePolicyConfig.MinTTL, 0);
const accessLog = site.Resources.AccessLogDelivery.Properties.RecordFields;
assert.ok(accessLog.includes('time-to-first-byte'));
assert.ok(
  !accessLog.some((field) => /^c-ip|x-forwarded-for|cs\(Cookie\)/.test(field)),
  'The access log records no client addresses or cookies',
);
assert.equal(site.Resources.AccessLogGroup.Properties.RetentionInDays, 731);
const alarm = site.Resources.Distribution5xxAlarm.Properties;
assert.equal(alarm.MetricName, '5xxErrorRate');
assert.match(
  alarm.AlarmActions[0]['Fn::Sub'],
  /:weekly-thing-librarian-alarms$/,
);
for (const [name, allowed] of [
  ['BuildRole', ['s3:GetObject']],
  [
    'DeploymentRole',
    [
      's3:GetObject',
      's3:PutObject',
      's3:ListBucket',
      's3:GetBucketLocation',
      'cloudfront:CreateInvalidation',
      'cloudfront:GetInvalidation',
      'cloudfront:GetDistribution',
    ],
  ],
]) {
  const p = delivery.Resources[name].Properties;
  const claim = p.AssumeRolePolicyDocument.Statement[0].Condition.StringEquals;
  assert.equal(
    claim['token.actions.githubusercontent.com:aud'],
    'sts.amazonaws.com',
  );
  const main = `${SUBJECT}:ref:refs/heads/main`;
  assert.deepEqual(
    claim['token.actions.githubusercontent.com:sub'],
    name === 'BuildRole' ? [main, `${SUBJECT}:pull_request`] : main,
  );
  for (const s of p.Policies[0].PolicyDocument.Statement) {
    // Site deploys may not write published media (tools/delivery-plan.mjs).
    if (name === 'DeploymentRole' && s.Effect === 'Deny') {
      assert.deepEqual(s.Action, ['s3:PutObject']);
      assert.deepEqual(
        s.Resource.map((r) => r['Fn::Sub'].split('${SiteBucket}/')[1]),
        mediaPrefixes.map((prefix) => `${prefix}*`),
      );
      continue;
    }
    assert.equal(s.Effect, 'Allow');
    assert.ok(s.Action.every((a) => allowed.includes(a)));
    assert.notEqual(s.Resource, '*');
  }
}
assert.equal(deployment.account, '999153317627');
assert.equal(deployment.region, 'us-east-1');
assert.equal(deployment.productionUrl, `https://${DOMAIN}/`);
assert.equal(
  deployment.siteBucket,
  `${deployment.stacks.storage}-web-${deployment.account}`,
);
console.log(
  'Private retained/versioned storage, HTTPS/OAC, bounded OIDC roles and write-once media validated.',
);
