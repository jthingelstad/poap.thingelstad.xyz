// The site reads only data/ (the export from jthingelstad/poap-archive,
// scripts/export_site_data.py). Types come from the JSON itself, so a change in
// the export fails the build here rather than on a page.
import dropsData from '../../data/drops.json';
import tokensData from '../../data/tokens.json';
import peopleData from '../../data/people.json';
import mintsData from '../../data/mints.json';
import seriesData from '../../data/series.json';
import writingData from '../../data/writing.json';
import eventsData from '../../data/events.json';
import layoutData from '../../data/layout.json';
import exportMeta from '../../data/export.json';

export const drops = dropsData;
export const tokens = tokensData;
export const people = peopleData;
export const mints = mintsData;
export const series = seriesData;
export const writing = writingData;
export const events = eventsData;
export const layout = layoutData as unknown as {
  size: number;
  drops: Record<string, [number, number]>;
  people: Record<string, [number, number]>;
};
export const meta = exportMeta;
export type Drop = (typeof drops)[number];
export type Token = (typeof tokens)[number];
export type Person = (typeof people)[number];
export type Series = (typeof series)[number];
export type Mint = (typeof mints)[number];
export type WritingItem = (typeof writing.items)[number];

export const dropById = new Map(drops.map((d) => [d.id, d]));
export const tokenById = new Map(tokens.map((t) => [t.id, t]));
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
export const wallets: Record<string, string> = meta.wallets;

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export const day = (iso: string | null | undefined) => (iso || '').slice(0, 10);
export const year = (iso: string) => iso.slice(0, 4);
export const number = (n: number) => n.toLocaleString('en-US');
export const plural = (n: number, one: string, many = `${one}s`) =>
  `${number(n)} ${n === 1 ? one : many}`;

// People are named as POAP showed them: primary ENS name, else a shortened
// address (Jamie's decision, 2026-10-17).
export const shortAddress = (address: string) =>
  `${address.slice(0, 6)}…${address.slice(-4)}`;
export const labelOf = (address: string) =>
  personByAddress.get(address)?.label ||
  wallets[address] ||
  shortAddress(address);
export const externalUrlOf = (address: string) => {
  const ens = personByAddress.get(address)?.ens;
  return ens
    ? `https://app.ens.domains/${ens}`
    : `https://gnosisscan.io/address/${address}`;
};

export const place = (d: {
  virtual: boolean;
  city: string | null;
  country?: string | null;
}) => (d.virtual ? 'virtual' : d.city || d.country || '');

// Drops Jamie made, in event order.
export const dropsByDate = [...drops].sort(
  (a, b) => byText(a.date, b.date) || a.id - b.id,
);
export const mintsByDrop = new Map<number, Mint[]>();
for (const m of [...mints].sort((a, b) => byText(a.minted, b.minted))) {
  if (!mintsByDrop.has(m.drop)) mintsByDrop.set(m.drop, []);
  mintsByDrop.get(m.drop)!.push(m);
}
export const dropsOfSeries = (slug: string) =>
  dropsByDate.filter((d) => d.series === slug);

// Tokens Jamie collected, in mint order. "From others" are tokens of drops
// Jamie did not make: the left side of the timeline.
export const tokensByDate = [...tokens].sort((a, b) =>
  byText(a.minted, b.minted),
);
export const tokensFromOthers = tokensByDate.filter((t) => !t.own_drop);

export const years = ['2021', '2022', '2023', '2024', '2025', '2026'];

// The 612 POAP Challenge: 40 drops made on one day and 31 visits collected
// over a summer. The timeline shows each side as one group.
export const is612 = (name: string) => name.includes('612 POAP Challenge');

// Writing, newest first within a year on /writing/; oldest first on the timeline.
export const writingItems = [...writing.items].sort((a, b) =>
  byText(a.date, b.date),
);
export const writingKind: Record<string, string> = {
  essay: 'Essay',
  'weekly-thing': 'Weekly Thing',
  announcement: 'Note',
  'drop-announcement': 'Drop announcement',
};

// The nine series in network order, with their drops.
export const seriesOrder = series.map((s) => s.slug);
