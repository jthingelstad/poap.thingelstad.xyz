// Prose lives in content/ as Markdown (chapter titles and quotes, series
// descriptions, the POAP page, the essay list), so a word change never touches
// code. Each file gives front matter and a rendered Content component.
import type { MarkdownInstance } from 'astro';

type Chapter = { title: string; quote: string; cite: string; url: string };
type Titled = { title: string; description?: string };

const byName = <T extends Record<string, unknown>>(
  files: Record<string, MarkdownInstance<T>>,
) =>
  Object.fromEntries(
    Object.entries(files).map(([path, file]) => [
      path.replace(/^.*\/|\.md$/g, ''),
      file,
    ]),
  );

export const chapters = byName(
  import.meta.glob<MarkdownInstance<Chapter>>('../../content/chapters/*.md', {
    eager: true,
  }),
);
export const seriesText = byName(
  import.meta.glob<MarkdownInstance<Titled>>('../../content/series/*.md', {
    eager: true,
  }),
);
const pages = byName(
  import.meta.glob<MarkdownInstance<Titled>>('../../content/*.md', {
    eager: true,
  }),
);
export const poapPage = pages.poap;
export const essays = pages.writing;
