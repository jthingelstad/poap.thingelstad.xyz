import fs from 'node:fs/promises';
const commit = process.env.GITHUB_SHA || 'local';
const { counts, commit: archive } = JSON.parse(
  await fs.readFile('data/export.json', 'utf8'),
);
await fs.writeFile(
  'dist/revision.json',
  JSON.stringify({
    commit,
    archive,
    builtAt: new Date().toISOString(),
    counts,
  }) + '\n',
);
