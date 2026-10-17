// Dev-only: serve media/ (tools/build-media.mjs output, ignored by Git) at the
// published media paths, so pages can be reviewed before the media is
// published or when the CloudFront proxy in astro.config.mjs is not set.
import fs from 'node:fs/promises';
import path from 'node:path';
import { mediaPrefixes, mime } from './delivery-plan.mjs';

export function localMedia() {
  return {
    name: 'local-media',
    hooks: {
      'astro:server:setup': ({ server }) => {
        server.middlewares.use(async (req, res, next) => {
          const name = decodeURIComponent(
            new URL(req.url, 'http://localhost').pathname,
          ).slice(1);
          if (!mediaPrefixes.some((prefix) => name.startsWith(prefix)))
            return next();
          const root = path.resolve('media');
          const target = path.resolve(root, name);
          if (!target.startsWith(root + path.sep)) return next();
          try {
            const body = await fs.readFile(target);
            res.writeHead(200, {
              'content-type':
                mime[path.extname(target)] || 'application/octet-stream',
            });
            res.end(body);
          } catch {
            next();
          }
        });
      },
    },
  };
}
