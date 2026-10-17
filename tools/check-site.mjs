// Browser checks: every route in the list renders without console or page
// errors at desktop and phone widths, and no request reaches Tinylytics.
// Evidence goes to /tmp/poap-site-qa. SITE_TEST_URL defaults to the dev server.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = process.env.SITE_TEST_URL || 'http://127.0.0.1:4321';
const output = '/tmp/poap-site-qa';
await fs.mkdir(output, { recursive: true });
const routes = ['/', '/about/'];
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
});
const errors = [],
  analytics = [];
for (const [name, viewport] of [
  ['desktop', { width: 1440, height: 900 }],
  ['phone', { width: 390, height: 844 }],
]) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`${name}: ${error}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`${name}: ${msg.text()}`);
  });
  page.on('request', (request) => {
    if (request.url().includes('tinylytics.app')) analytics.push(request.url());
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
assert.deepEqual(analytics, [], 'no Tinylytics requests during QA');
console.log(
  `Checked ${routes.length} routes at desktop and phone widths; evidence in ${output}`,
);
