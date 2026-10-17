// The site reads only data/ (the export from jthingelstad/poap-archive,
// scripts/export_site_data.py). Types come from the JSON itself, so a change in
// the export fails the build here rather than on a page.
import dropsData from '../../data/drops.json';
import tokensData from '../../data/tokens.json';
import peopleData from '../../data/people.json';
import mintsData from '../../data/mints.json';
import seriesData from '../../data/series.json';
import writingData from '../../data/writing.json';
import exportMeta from '../../data/export.json';

export const drops = dropsData;
export const tokens = tokensData;
export const people = peopleData;
export const mints = mintsData;
export const series = seriesData;
export const writing = writingData;
export const meta = exportMeta;
export type Drop = (typeof drops)[number];
export type Token = (typeof tokens)[number];
export type Person = (typeof people)[number];
export type Series = (typeof series)[number];

export const dropById = new Map(drops.map((d) => [d.id, d]));
export const personByAddress = new Map(people.map((p) => [p.address, p]));
export const seriesBySlug = new Map(series.map((s) => [s.slug, s]));

// Canonical paths (poap-archive DESIGN.md section 3). Kudos and cross-links
// depend on these never changing.
export const dropPath = (id: number) => `/drops/${id}/`;
export const tokenPath = (id: number) => `/tokens/${id}/`;
export const personPath = (address: string) => `/people/${address}/`;
export const seriesPath = (slug: string) => `/series/${slug}/`;
export const yearPath = (year: number | string) => `/timeline/${year}/`;

export const counts = meta.counts;
