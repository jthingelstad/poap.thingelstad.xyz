# Tinylytics

Recorded 2026-10-17 for `https://poap.thingelstad.xyz`. Tinylytics site 3838, "POAP Capsule".

## Embed

```html
<script
  src="https://tinylytics.app/embed/nQYJ5URe6Y3umkYW7HQN.js"
  defer
></script>
```

This is a public browser embed identifier, not a credential.

## Implementation

`src/layouts/Layout.astro` loads one script, with `?kudos=custom`, only when the build ran
with `PUBLIC_TINYLYTICS_ENABLED=true` (CI sets it for the production build) and the page is
on the production hostname. Local review, CloudFront preview URLs and browser tests send no
hits and no kudos; `tools/check-site.mjs` fails if any request reaches tinylytics.app.

Kudos (`src/components/Kudos.astro`) use `class="tinylytics_kudos"`, `data-private="true"`
and `data-path` set to the drop's canonical path, `/drops/<id>/`, on cards and on the drop
page alike, so one drop counts as one thing wherever it appears.
