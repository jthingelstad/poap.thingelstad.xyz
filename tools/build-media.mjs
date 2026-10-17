// Render the published media into media/ (ignored by Git) from the archive's
// artwork: the original file for every drop under art/, and WebP stills at the
// widths in data/media.json under raster/. Animated GIFs keep their original
// under art/ and get a first-frame still under raster/.
//
//   POAP_ARCHIVE=../poap-archive node tools/build-media.mjs
//
// Media is generated once; tools/media.mjs publish uploads only keys the
// bucket lacks. Re-rendering an existing key is a no-op for the bucket.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const archive = path.resolve(process.env.POAP_ARCHIVE || '../poap-archive');
const artwork = JSON.parse(await fs.readFile('data/artwork.json', 'utf8'));
const { rasterWidths } = JSON.parse(
  await fs.readFile('data/media.json', 'utf8'),
);
await fs.mkdir('media/art', { recursive: true });
await fs.mkdir('media/raster', { recursive: true });
let copied = 0,
  rendered = 0;
for (const item of artwork) {
  const source = path.join(archive, item.source);
  const bytes = await fs.readFile(source);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== item.sha256)
    throw new Error(`${item.source} differs from data/artwork.json`);
  const target = path.join('media', item.key);
  try {
    await fs.access(target);
  } catch {
    await fs.writeFile(target, bytes);
    copied++;
  }
  // Rasters: square-ish drop art, resized inside the width, never enlarged.
  const still = sharp(bytes, { animated: false }).rotate();
  for (const width of rasterWidths) {
    const key = path.join('media', 'raster', `${item.drop}-${width}.webp`);
    try {
      await fs.access(key);
      continue;
    } catch {
      /* render below */
    }
    await still
      .clone()
      .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82, effort: 5 })
      .toFile(key);
    rendered++;
  }
}
console.log(
  `media/: ${copied} originals copied, ${rendered} WebPs rendered for ${artwork.length} drops at ${rasterWidths.join('/')} px`,
);
