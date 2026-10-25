# Deployment, storage and DNS

The pattern is nnxyz's (`jthingelstad/nnxyz`): a private, versioned archive bucket; a public
web bucket read only by CloudFront; media published once and write-once; pages deployed from
main by GitHub Actions through an OIDC role that cannot write media or change infrastructure.

## Stacks (us-east-1, account 999153317627)

| Stack              | Template                 | Holds                                                                                                                                                         |
| ------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `poap-certificate` | `infra/certificate.json` | ACM certificate for `poap.thingelstad.xyz`, DNS validated                                                                                                     |
| `poap-storage`     | `infra/storage.json`     | `poap-storage-archive-…` (private, every version kept) and `poap-storage-web-…` (private, CloudFront reads it)                                                |
| `poap-site`        | `infra/site.json`        | Distribution with origin access control, cache and header policies, index function, 14-day access log without client addresses, 5xx alarm to the family topic |
| `poap-delivery`    | `infra/delivery.json`    | GitHub OIDC roles: read-only build, main-only deployment denied `PutObject` under `art/` and `raster/`                                                        |

Live ids and ARNs are in `infra/deployment.json`; `tools/bootstrap-infra.mjs` writes them.

## Bootstrap, once

With the `cloud-engineer` identity:

```sh
npm ci
npm run infra:plan     # creates change sets for every stack and prints them
npm run infra:apply    # executes them in order and prints the DNS records
```

Add the two DNS records at Namecheap (hosts are relative to `thingelstad.xyz`): the ACM
validation CNAME, kept for renewal, and `poap` → the CloudFront domain. When ACM shows
ISSUED:

```sh
npm run infra:attach   # gives the distribution its alias and certificate
```

Then set the repository variable `AWS_DEPLOY_ROLE_ARN` to the deployment role ARN the
script printed. From then on every push to main deploys.

## Media, once

```sh
POAP_ARCHIVE=../poap-archive npm run media:build     # media/ from the archive's artwork
AWS_PROFILE=cloud-engineer npm run media:publish     # upload only keys the bucket lacks
git add data/media.json
```

`media:publish` uses `If-None-Match: *`, so an existing key is never replaced; a new
rendering needs a new key. `media:verify` is read-only. Pages reference media by URL; the
dev server proxies media paths to CloudFront once `deliveryUrl` is set, and serves the
local `media/` folder before that.

## Every push to main

`.github/workflows/ci.yml`: lint, format, types, tests, Ruff, audit, cfn-lint, infrastructure
and data validation; CodeQL; a credential-free build with link, metadata and published-media
checks and Chromium checks at desktop and phone widths; then, on main, the deployment job
uploads changed pages, invalidates page paths and compares delivered bytes with the build.
Media is never uploaded by a deploy. Objects are stored uncompressed and the distribution
compresses them (gzip or brotli) only for clients that send Accept-Encoding; a hashed
bundle under `_astro/` replaced in place (a header change) is invalidated too.

## DNS

| Type  | Host                    | Target                                           |
| ----- | ----------------------- | ------------------------------------------------ |
| CNAME | `poap`                  | the CloudFront domain in `infra/deployment.json` |
| CNAME | the ACM validation host | the ACM validation value                         |

Both records are printed by the bootstrap script. DNS changes are made by Jamie.
