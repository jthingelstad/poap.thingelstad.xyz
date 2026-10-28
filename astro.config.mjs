import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import deployment from './infra/deployment.json' with { type: 'json' };
import { mediaPrefixes } from './tools/delivery-plan.mjs';
import { localMedia } from './tools/local-media.mjs';
import { contentDate } from './tools/content-date.mjs';

const site = 'https://poap.thingelstad.xyz';

// Published media is never copied into the site. The dev server reads it from
// CloudFront once the distribution exists; before that, and for local review
// of new renderings, tools/local-media.mjs serves the ignored media/ folder.
const proxy = deployment.deliveryUrl
  ? Object.fromEntries(
      mediaPrefixes.map((prefix) => [
        `/${prefix}`,
        { target: deployment.deliveryUrl, changeOrigin: true },
      ]),
    )
  : {};

export default defineConfig({
  site,
  output: 'static',
  trailingSlash: 'always',
  devToolbar: { enabled: false },
  vite: { server: { proxy } },
  // Every page carries the date the archive's content last changed
  // (tools/content-date.mjs), and the index the same.
  integrations: [sitemap({ lastmod: contentDate() }), localMedia()],
});
