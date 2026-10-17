# poap.thingelstad.xyz

**POAP: Proof of a Person.** Jamie Thingelstad's POAP time capsule, 2021 to 2026, live at
https://poap.thingelstad.xyz/. The design is `DESIGN.md` in `jthingelstad/poap-archive`;
read it before changing structure, URLs or data.

- Built with Astro and TypeScript on the nnxyz pattern (`jthingelstad/nnxyz`): S3 and
  CloudFront, GitHub Actions deploying main through OIDC, media published once and
  write-once. `docs/deployment.md` has the operations.
- **Data.** `data/` is the export from `poap-archive` (`scripts/export_site_data.py`), the
  only thing the site reads. Regenerate it there and copy it here; never edit it by hand.
  `data/export.json` records the archive commit. `npm run validate:data` checks the
  contract.
- **URLs are fixed** (DESIGN.md section 3): `/drops/<id>/`, `/tokens/<id>/`,
  `/people/<address>/`, `/timeline/<year>/`, `/network/`, `/series/<slug>/`. Kudos and
  cross-links depend on them. `src/lib/data.ts` is the one place they are built.
- **People are named**: primary ENS name where set, shortened address otherwise, as POAP
  showed them (Jamie's decision, 2026-10-17). Moments by others are quoted with the
  author's name.
- **Media.** Drop artwork lives in the web bucket under `art/` (originals, GIF where
  animated) and `raster/` (WebP stills). Pages reference URLs; nothing under those
  prefixes is ever in `dist/`. `tools/validate-site.py` fails the build if a referenced
  key is not in `data/media.json`.
- **Tinylytics** (`design/tinylytics.md`): one script in the layout, production host
  only, kudos per drop keyed on `/drops/<id>/`. Never send live hits or kudos from QA.
- **Prose is content.** Chapter titles and quotes, series descriptions and the closing
  essay live in `content/` as Markdown, so a word change never touches code.
- This repo is public. Never commit credentials, `.env` files, or anything from Jamie's
  private POAP notes (kept outside both repos, in `~/Projects/poap-archive-private/` and the
  archive bucket's `private/` prefix).
- Run `npm run lint`, `npm run format:check`, `npm run check`, `npm test`,
  `npm run validate:infra`, `npm run validate:data`, `npm run build`,
  `LOCAL_MEDIA=1 npm run validate:site` and `LOCAL_MEDIA=1 npm run test:ci-browser`
  before pushing. Chromium: `npx playwright install chromium` or
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.
- Infrastructure changes go through reviewed CloudFormation change sets with the
  `cloud-engineer` identity, never through the delivery role. DNS changes are made by
  Jamie.
- "POAP KINGS" is a Clash Royale clan, unrelated to the protocol; its tokens are real
  POAPs and appear as such.
