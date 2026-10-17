// The data contract (poap-archive DESIGN.md section 2): every reference
// resolves, counts match the export's own record, and artwork keys are unique.
// Runs in CI and as a Node test, with no network and no archive.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { mediaPrefixes } from './delivery-plan.mjs';

const read = async (name) =>
  JSON.parse(await fs.readFile(`data/${name}.json`, 'utf8'));
export async function validateData() {
  const [
    drops,
    tokens,
    people,
    mints,
    events,
    writing,
    moments,
    series,
    layout,
    artwork,
    meta,
  ] = await Promise.all(
    [
      'drops',
      'tokens',
      'people',
      'mints',
      'events',
      'writing',
      'moments',
      'series',
      'layout',
      'artwork',
      'export',
    ].map(read),
  );
  const media = await read('media');
  const dropIds = new Set(drops.map((d) => d.id));
  const addresses = new Set(people.map((p) => p.address));
  assert.equal(drops.length, meta.counts.drops);
  assert.equal(tokens.length, meta.counts.tokens);
  assert.equal(people.length, meta.counts.people);
  assert.equal(mints.length, meta.counts.mints);
  assert.equal(events.length, meta.counts.events);
  assert.equal(writing.items.length, meta.counts.writing);
  assert.equal(writing.advice.length, meta.counts.advice);
  assert.equal(moments.length, meta.counts.moments);
  assert.equal(artwork.length, meta.counts.artwork);
  assert.equal(dropIds.size, drops.length, 'drop ids are unique');
  assert.equal(addresses.size, people.length, 'addresses are unique');
  for (const d of drops) {
    assert.ok(
      d.series && series.some((s) => s.slug === d.series),
      `series for ${d.id}`,
    );
    assert.match(d.date, /^\d{4}-\d{2}-\d{2}$/, `event date for ${d.id}`);
    assert.ok(d.artwork, `artwork for ${d.id}`);
  }
  const artworkKeys = new Set(artwork.map((a) => a.key));
  assert.equal(artworkKeys.size, artwork.length, 'artwork keys are unique');
  for (const a of artwork) {
    assert.ok(
      mediaPrefixes.some((prefix) => a.key.startsWith(prefix)),
      a.key,
    );
    assert.match(a.sha256, /^[a-f0-9]{64}$/);
  }
  for (const t of tokens) {
    assert.ok(
      t.drop.artwork && artworkKeys.has(t.drop.artwork),
      `artwork for token ${t.id}`,
    );
    assert.equal(t.own_drop, dropIds.has(t.drop.id));
  }
  for (const m of mints) {
    assert.ok(dropIds.has(m.drop), `mint drop ${m.drop}`);
    assert.ok(addresses.has(m.person), `mint person ${m.person}`);
  }
  for (const p of people)
    for (const h of p.drops)
      assert.ok(dropIds.has(h.id), `${p.address} holds ${h.id}`);
  for (const s of series)
    for (const id of s.drops) assert.ok(dropIds.has(id), `series ${s.slug}`);
  assert.equal(Object.keys(layout.drops).length, drops.length);
  assert.equal(Object.keys(layout.people).length, people.length);
  for (const m of moments)
    assert.ok(m.author_label, `moment ${m.id} has an author label`);
  assert.ok(Array.isArray(media.rasterWidths) && media.rasterWidths.length);
  return {
    drops: drops.length,
    tokens: tokens.length,
    people: people.length,
    mints: mints.length,
  };
}

if (
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].split('/').at(-1))
)
  console.log('Data contract validated:', JSON.stringify(await validateData()));
