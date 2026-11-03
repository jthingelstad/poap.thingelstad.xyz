# Tinylytics

Recorded 2026-10-17 for `https://poap.thingelstad.xyz`. Tinylytics site 3838, "POAP Capsule".

## Embed

```html
<script
  defer
  src="https://tinylytics.app/js/script.js"
  data-site="nQYJ5URe6Y3umkYW7HQN"
></script>
```

Since 2026-11-02 Tinylytics serves one script for every site, keyed by `data-site`, and
the tag takes no query parameters. Widgets and options (custom kudos here, once
`?kudos=custom` on the old `embed/nQYJ5URe6Y3umkYW7HQN.js` URL) are the site's settings in
the Tinylytics dashboard. The site ID is a public browser identifier, not a credential.

## Implementation

`src/layouts/Layout.astro` loads one script (it creates the element, sets `defer`, `src`
and `dataset.site`, then appends it), only when the build ran
with `PUBLIC_TINYLYTICS_ENABLED=true` (CI sets it for the production build) and the page is
on the production hostname. Local review, CloudFront preview URLs and browser tests send no
hits and no kudos; `tools/check-site.mjs` fails if any request reaches tinylytics.app.

Kudos (`src/components/Kudos.astro`) use `class="tinylytics_kudos"`, `data-private="true"`
and `data-path` set to the drop's canonical path, `/drops/<id>/`, on cards and on the drop
page alike, so one drop counts as one thing wherever it appears.
