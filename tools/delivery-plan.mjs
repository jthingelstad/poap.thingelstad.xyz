import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
export const mime = {
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};
// Published media: the original drop artwork from the archive under art/ and
// the WebP renderings under raster/. Uploaded once by tools/media.mjs and only
// referenced by the site. Site deploys never write these keys, and
// infra/delivery.json denies the deployment role PutObject on them.
export const mediaPrefixes = ['art/', 'raster/'];
export const isMediaKey = (key) =>
  mediaPrefixes.some((prefix) => key.startsWith(prefix));
export function publicationOrder(files) {
  return [...files].sort(
    (a, b) =>
      Number(a.endsWith('.html')) - Number(b.endsWith('.html')) ||
      a.localeCompare(b),
  );
}
// Media keys are write-once, so they and Astro's hashed bundles never change.
export const immutable = 'public,max-age=31536000,immutable';
function cacheControl(key, extension) {
  if (key.startsWith('_astro/') || isMediaKey(key)) return immutable;
  if (['.html', '.txt', '.xml'].includes(extension) || key === 'revision.json')
    return 'public,max-age=0,s-maxage=60,must-revalidate';
  return 'public,max-age=3600';
}
const compressible = new Set([
  '.html',
  '.svg',
  '.json',
  '.css',
  '.js',
  '.txt',
  '.xml',
]);
export function prepareObject(key, bytes) {
  if (
    key.startsWith('/') ||
    key.split('/').includes('..') ||
    key.includes('\\')
  )
    throw new Error('Unsafe public asset key');
  const extension = path.extname(key);
  const type = mime[extension];
  if (!type) throw new Error(`No MIME type for ${key}`);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const object = {
    Body: bytes,
    ContentType: type,
    CacheControl: cacheControl(key, extension),
    Metadata: { sha256 },
  };
  // Text is stored gzip-encoded; the decoded bytes and their hash are what
  // the manifest and the post-deploy comparison use.
  if (compressible.has(extension)) {
    object.Body = gzipSync(bytes, { level: 9 });
    object.ContentEncoding = 'gzip';
  }
  return object;
}
