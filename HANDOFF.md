# Handoff for a local session

Written 2026-10-17 by the cloud session that bootstrapped this repository. Everything
below needs something the cloud session does not have: the `cloud-engineer` AWS identity,
the Mac's Photos library, or Jamie at the Namecheap console. Do these in order; each
step says what it produces and what to commit. Read `AGENTS.md` and `docs/deployment.md`
first, and `~/Projects/AGENTS.md` for the AWS rules (verify the STS identity before any
mutation; infrastructure through reviewed change sets; never static keys in GitHub).

State when this was written: `main` has the bootstrap (data, tooling, infra templates, CI,
layout, home and about). `infra/deployment.json` has nulls for the distribution,
certificate and role ARNs. `data/media.json` has no objects. The CI deployment job skips
until the repository variable `AWS_DEPLOY_ROLE_ARN` exists.

## Local preferences (Otto, Jamie's Mac)

- Use Node 24, as `.nvmrc` and CI do: `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`.
  The Mac's default `node` is newer.
- Verify the identity before any mutation: `aws sts get-caller-identity --profile
cloud-engineer` must show account `999153317627` and
  `assumed-role/ProjectsCloudEngineer/projects-cloud-engineer`. Never the `jamie` profile.
- Show Jamie the `infra:plan` change sets and wait for an explicit go before `infra:apply`
  or `infra:attach`. Jamie's go names the action and target, e.g.
  `Approved: npm run infra:apply for poap.thingelstad.xyz`.
- Give Jamie DNS records formatted for Namecheap, hosts relative to `thingelstad.xyz`, and
  times in US Central.
- Checks never send live Tinylytics hits or kudos; browser checks against production block
  the Tinylytics host.

## 1. Create the stacks and get the DNS records

```sh
cd ~/Projects/poap.thingelstad.xyz
npm ci
AWS_PROFILE=cloud-engineer npm run infra:plan
```

Read the printed change sets: `poap-certificate` (one ACM certificate), `poap-storage`
(two private versioned buckets and their policies), `poap-site` (origin access control,
cache and headers policies, index function, distribution, access log, 5xx alarm),
`poap-delivery` (two IAM roles for GitHub OIDC). Nothing is executed by `plan`. Then:

```sh
AWS_PROFILE=cloud-engineer npm run infra:apply
```

`plan` leaves each new stack in `REVIEW_IN_PROGRESS`; `apply` creates fresh CREATE change
sets for those (fixed 2026-10-17, it used to ask for an UPDATE and fail).

`poap-certificate` does not finish until the certificate is ISSUED, so `apply` stops at
the first stack until the ACM validation CNAME is in DNS (the script waits 30 minutes).
Read the record while it waits (`aws acm describe-certificate`, `DomainValidationOptions`)
and give it to Jamie straight away. Run `apply` with a long enough timeout for the
distribution too (allow 45 minutes); if it is cut off, running it again is safe, because
finished stacks report no changes and it carries on from there.

It executes the change sets in order, runs `poap-storage` again with the distribution id
so the bucket policy admits CloudFront, rewrites `infra/deployment.json` from the live
stacks, and prints two DNS records and the deployment role ARN. Commit
`infra/deployment.json`.

Give Jamie the two records for Namecheap (hosts are relative to `thingelstad.xyz`):

| Type  | Host                                | Target                             |
| ----- | ----------------------------------- | ---------------------------------- |
| CNAME | `_<hash>` (the ACM validation host) | `_<hash>.<id>.acm-validations.aws` |
| CNAME | `poap`                              | `<distribution>.cloudfront.net`    |

The validation CNAME stays forever; ACM renews through it. Until the certificate is
attached, `https://<distribution>.cloudfront.net/` serves the site for review.

## 2. Attach the certificate

When ACM shows the certificate ISSUED (minutes after the validation record resolves):

```sh
AWS_PROFILE=cloud-engineer npm run infra:attach
```

This updates `poap-site` with the alias `poap.thingelstad.xyz` and the certificate. Commit
`infra/deployment.json` again. Check `https://poap.thingelstad.xyz/` answers with valid
TLS at a desktop and a phone width.

## 3. Turn on deployment

In the GitHub repository settings, add the variable `AWS_DEPLOY_ROLE_ARN` with the
deployment role ARN from step 1 (`infra/deployment.json` `deploymentRoleArn`). It is not a
secret. The next push to `main` deploys; `npm run deploy` refuses anything but this
repository's `main` under that role. Consider branch protection on `main` requiring the
`Build and browser validation` job, as nnxyz has.

## 4. Publish the media, once

The artwork comes from the archive checkout, not from any POAP host:

```sh
cd ~/Projects/poap.thingelstad.xyz
POAP_ARCHIVE=../poap-archive npm run media:build        # media/: 260 originals + WebP stills, checked against data/artwork.json
AWS_PROFILE=cloud-engineer npm run media:publish        # uploads only keys the bucket lacks, If-None-Match: *
AWS_PROFILE=cloud-engineer npm run media:verify
git add data/media.json && git commit -m "Publish the drop artwork"
```

`data/media.json` must list every key the pages reference; `tools/validate-site.py` fails
the build otherwise. Media is write-once: a new rendering needs a new key name. The
deployment role is denied `PutObject` under `art/` and `raster/`, so no deploy can replace
artwork.

## 5. Keep a copy of the export in the archive bucket

Optional but in the nnxyz spirit. Pack `data/*.json` from the archive export:

```sh
cd ~/Projects/poap-archive
python3 -I scripts/export_site_data.py /tmp/poap-export
tar -czf /tmp/poap-export.tar.gz -C /tmp/poap-export .
shasum -a 256 /tmp/poap-export.tar.gz
```

Upload to `s3://poap-storage-archive-999153317627/datasets/<sha256>/export.tar.gz` with
`If-None-Match: *` (the AWS MCP presigned upload, as nnxyz does), and record bucket, key
and hash in `infra/dataset.json` in the site repo.

## 6. Moment photos from Photos

The 79 photos Jamie attached to POAP Moments are gone upstream. The moments carry
timestamps to the second in `data/moments.json` (`by_jamie: true`, `media > 0`). Export
originals from the Mac's Photos library by date and match on time (within a minute, UTC
in the data, local time in Photos). Put the matched files in a new media prefix,
`moments/<moment id>.<ext>`, add the prefix to `tools/delivery-plan.mjs`,
`tools/validate-site.py`, `infra/delivery.json` and `tools/validate-infra.mjs` together
(the infra change is a reviewed change set), publish with `media:publish`, and add a
`photo` key to the moment rows in the export. This is the one step that changes the data
contract; do it in `poap-archive` first.

## 7. Merge the design branch in poap-archive

`jthingelstad/poap-archive` branch `design/time-capsule` holds `DESIGN.md`, the two
prototypes under `capsule/`, `scripts/build_capsule.py`, `scripts/build_network.py` and
`scripts/export_site_data.py`. It is Jamie's call to merge; nothing in it rewrites a
capture.

## 8. At launch

- Submit `https://poap.thingelstad.xyz/` and its main pages to the Wayback Machine.
- Confirm Tinylytics shows the site's first hits (site 3838) and that a CloudFront preview
  URL shows none.
- Update the status lines in `README.md` here and in the archive's `README.md`.

## What the cloud session keeps doing

Everything else needs no AWS: the drop, token, people, series, timeline and network pages
from the prototypes, the writing and advice pages, the POAP company page, and the content
files. Those arrive on `main` through CI; once step 3 is done, each push deploys.
