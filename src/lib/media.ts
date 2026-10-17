// Published media keys. The original drop art lives at art/<drop>.<ext> (from
// data/artwork.json) and WebP stills at raster/<drop>-<width>.webp, at the
// widths in data/media.json. Pages reference these URLs; nothing is copied
// into the build, and tools/validate-site.py checks each one is published.
import mediaManifest from '../../data/media.json';

export const rasterWidths: number[] = mediaManifest.rasterWidths;
export const artUrl = (key: string) => `/${key}`;
export const rasterUrl = (drop: number, width: number) =>
  `/raster/${drop}-${width}.webp`;
export const rasterSrcset = (drop: number) =>
  rasterWidths.map((width) => `${rasterUrl(drop, width)} ${width}w`).join(', ');
