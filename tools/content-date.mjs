// The sitemap's <lastmod> (astro.config.mjs). The time capsule is a frozen
// archive: every page is drawn from data/ and content/, so every page last
// changed when they last did, and that commit's date is every page's lastmod.
// Template and style changes are not content changes and do not move it, and
// neither does the build: search engines ignore a lastmod that is always "now".
// A shallow clone would give the date of its one commit, so it is refused; the
// build job checks out the full history (fetch-depth: 0).
import { execFileSync } from 'node:child_process';

export const contentPaths = ['data', 'content'];

export function contentDate(cwd = process.cwd()) {
  const git = (...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  if (git('rev-parse', '--is-shallow-repository') === 'true')
    throw new Error(
      'The sitemap dates pages by their git history; fetch the full history (fetch-depth: 0).',
    );
  const date = git('log', '-1', '--format=%cI', '--', ...contentPaths);
  if (!date) throw new Error('No commit touches data/ or content/');
  return new Date(date);
}
