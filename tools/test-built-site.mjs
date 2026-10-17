// Serve dist/ on loopback with media from CloudFront (or media/ when
// LOCAL_MEDIA=1) and run the browser checks against it.
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { mediaPrefixes, mime } from './delivery-plan.mjs';
const root = path.resolve('dist');
const deployment = JSON.parse(
  await fs.readFile('infra/deployment.json', 'utf8'),
);
const { objects } = JSON.parse(await fs.readFile('data/media.json', 'utf8'));
const local = process.env.LOCAL_MEDIA === '1';
const published = new Map(
  deployment.deliveryUrl
    ? Object.keys(objects).map((key) => [
        `/${key}`,
        new URL(key, deployment.deliveryUrl).href,
      ])
    : [],
);
const server = createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(
      new URL(req.url, 'http://localhost').pathname,
    );
    const key = name.slice(1);
    if (mediaPrefixes.some((prefix) => key.startsWith(prefix))) {
      if (local) {
        const target = path.resolve('media', key);
        if (!target.startsWith(path.resolve('media') + path.sep))
          throw new Error('outside');
        res.writeHead(200, {
          'content-type':
            mime[path.extname(target)] || 'application/octet-stream',
        });
        res.end(await fs.readFile(target));
        return;
      }
      const mediaUrl = published.get(name);
      if (!mediaUrl) throw new Error('unpublished media');
      const media = await fetch(mediaUrl);
      res.writeHead(media.status, {
        'content-type':
          media.headers.get('content-type') || 'application/octet-stream',
      });
      res.end(Buffer.from(await media.arrayBuffer()));
      return;
    }
    const target = path.resolve(
      root,
      '.' + name + (name.endsWith('/') ? 'index.html' : ''),
    );
    if (!target.startsWith(root + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    res.writeHead(200, {
      'content-type': mime[path.extname(target)] || 'application/octet-stream',
    });
    res.end(await fs.readFile(target));
  } catch {
    res.writeHead(404).end('Not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const child = spawn(process.execPath, ['tools/check-site.mjs'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    SITE_TEST_URL: `http://127.0.0.1:${server.address().port}`,
  },
});
try {
  process.exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
