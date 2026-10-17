// What each year of the timeline holds: the three columns and the chapter
// numbers. Drops sit at their event date; tokens at their mint date.
import {
  type Drop,
  type Token,
  type WritingItem,
  dropsByDate,
  events,
  is612,
  mints,
  tokensFromOthers,
  wallets,
  writingItems,
  years,
} from './data';

export type SpineItem =
  | { kind: 'writing'; date: string; item: WritingItem }
  | { kind: 'world'; date: string; title: string }
  | { kind: 'note'; date: string; title: string; url: string };

export interface Year {
  year: string;
  left: Token[];
  right: Drop[];
  spine: SpineItem[];
  mints: number;
  minters: number;
  writing: number;
}

const poapWallet = Object.entries(wallets).find(
  ([, name]) => name === 'poap.thingelstad.eth',
)![0];
// The 2023 move of Jamie's collection into a wallet made for collecting: one
// note, not a row per transfer.
const moved = events.filter(
  (e) =>
    e.kind === 'transfer' &&
    e.date.startsWith('2023-02') &&
    'to' in e &&
    e.to === poapWallet,
).length;

export const yearData: Year[] = years.map((year) => {
  const spine: SpineItem[] = [
    ...writingItems
      .filter((w) => w.kind !== 'drop-announcement' && w.date.startsWith(year))
      .map((item) => ({ kind: 'writing' as const, date: item.date, item })),
    ...events
      .filter(
        (e) =>
          e.kind === 'milestone' &&
          // POAP's own beginnings, before Jamie's first token, open 2021.
          (e.date.startsWith(year) || (year === years[0] && e.date < year)),
      )
      .map((e) => ({
        kind: 'world' as const,
        date: e.date,
        title: 'title' in e ? String(e.title) : '',
      })),
  ];
  if (year === '2023' && moved)
    spine.push({
      kind: 'note',
      date: '2023-02-28',
      title: `Moved ${moved} POAPs into poap.thingelstad.eth, a wallet made just for collecting`,
      url: 'https://www.thingelstad.com/2023/03/04/isolating-crypto-assets.html',
    });
  spine.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const yearMints = mints.filter((m) => m.minted.startsWith(year));
  return {
    year,
    left: tokensFromOthers.filter((t) => t.minted.startsWith(year)),
    right: dropsByDate.filter((d) => d.date.startsWith(year)),
    spine,
    mints: yearMints.length,
    minters: new Set(yearMints.map((m) => m.person)).size,
    writing: spine.filter((s) => s.kind === 'writing').length,
  };
});

export const split612 = <T>(items: T[], name: (item: T) => string) => ({
  rest: items.filter((i) => !is612(name(i))),
  challenge: items.filter((i) => is612(name(i))),
});
