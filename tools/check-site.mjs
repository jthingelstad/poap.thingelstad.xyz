// Browser checks: every route in the list renders without console or page
// errors at desktop and phone widths, and no request reaches Tinylytics.
// Evidence goes to /tmp/poap-site-qa. SITE_TEST_URL defaults to the dev server.
// Tinylytics requests are answered in the browser with an empty script, so no
// hit or kudos ever leaves. On the production host the embed must be requested
// (and is stubbed); everywhere else it must not be requested at all.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = process.env.SITE_TEST_URL || 'http://127.0.0.1:4321';
const output = '/tmp/poap-site-qa';
await fs.mkdir(output, { recursive: true });
const routes = [
  '/',
  '/about/',
  '/timeline/',
  '/timeline/2023/',
  '/timeline/2025/',
  '/drops/117328/',
  '/drops/4547/',
  '/tokens/324580/',
  '/people/0x6493db62998997134e0451cacd32360858f9a3d6/',
  '/series/612/',
  '/series/birthday/',
  '/network/',
  '/collected/',
  '/issued/',
  '/writing/',
  '/writing/advice/',
  '/poap/',
];
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
});
const production = new URL(base).hostname === 'poap.thingelstad.xyz';
const errors = [],
  analytics = [];
for (const [name, viewport] of [
  ['desktop', { width: 1440, height: 900 }],
  ['phone', { width: 390, height: 844 }],
]) {
  const context = await browser.newContext({ viewport });
  await context.route(
    /^https:\/\/([a-z0-9-]+\.)*tinylytics\.app\//,
    (route) => {
      analytics.push(route.request().url());
      return route.fulfill({
        status: 200,
        contentType: 'text/javascript',
        body: '',
      });
    },
  );
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`${name}: ${error}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`${name}: ${msg.text()}`);
  });
  for (const route of routes) {
    const response = await page.goto(base + route, {
      waitUntil: 'networkidle',
    });
    assert.equal(response?.status(), 200, `${route} responds 200`);
    assert.ok(
      await page.locator('main').count(),
      `${route} has a main landmark`,
    );
    const title = await page.title();
    assert.ok(title.length > 0, `${route} has a title`);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth + 1,
    );
    assert.ok(!overflow, `${route} has no horizontal scroll at ${name}`);
    await page.screenshot({
      path: `${output}/${name}${route.replaceAll('/', '_') || '_'}.png`,
      fullPage: true,
    });
  }
  await context.close();
}
await browser.close();
assert.deepEqual(errors, [], 'no console or page errors');
if (production)
  assert.ok(
    analytics.length > 0,
    'the Tinylytics embed is requested (stubbed)',
  );
else assert.deepEqual(analytics, [], 'no Tinylytics requests during QA');
console.log(
  `Checked ${routes.length} routes at desktop and phone widths; evidence in ${output}`,
);
