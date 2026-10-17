# POAP: Proof of a Person

Jamie Thingelstad's POAP time capsule, 2021 to 2026, at https://poap.thingelstad.xyz/.
Proof of Attendance Protocol wound down in 2026. This site keeps one person's record of it:
259 tokens collected, 130 drops issued, 2,216 tokens minted from them by 639 people, and
the writing that went with it.

The data lives in [jthingelstad/poap-archive](https://github.com/jthingelstad/poap-archive).
That repository's `DESIGN.md` is the design; its `scripts/export_site_data.py` writes this
repository's `data/`.

## Working on it

```sh
npm ci
npm run dev                                        # http://127.0.0.1:4321/
POAP_ARCHIVE=../poap-archive npm run media:build   # local artwork for review, once
```

Checks: `npm run lint`, `npm run format:check`, `npm run check`, `npm test`,
`npm run validate:infra`, `npm run validate:data`, `npm run build`,
`LOCAL_MEDIA=1 npm run validate:site`, `LOCAL_MEDIA=1 npm run test:ci-browser`.

Deployment, storage and DNS are in [docs/deployment.md](docs/deployment.md). Analytics in
[design/tinylytics.md](design/tinylytics.md). Conventions in [AGENTS.md](AGENTS.md).

## Status

Bootstrapped 2026-10-17: data, tooling, infrastructure templates, CI, the layout and the
home and about pages. The timeline, network, drop, token, people and series pages follow,
from the prototypes in `poap-archive/capsule/`.
