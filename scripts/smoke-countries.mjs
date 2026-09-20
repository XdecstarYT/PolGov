/**
 * smoke-countries.mjs — every country actually starts.
 *
 * `smoke.mjs` plays one complete week in the invented country, which is
 * the deep check. This is the wide one: it founds a party in a handful of
 * real countries and gets each of them to the morning brief.
 *
 * It exists because the failure it catches is quiet. A country whose
 * profile has a bad region id, a party family that produces a duplicate
 * bench, or finances that divide by zero does not fail a type check and
 * does not fail a unit test that builds state directly — it fails when
 * somebody picks it on the setup screen, which is the one place nothing
 * else was looking.
 *
 * Needs the built site being served:  npx vite preview --port 4173
 */

import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/';

/* One of each electoral system, plus the extremes of size. */
const COUNTRIES = [
  { pick: 'Germany', expect: 'Germany' },
  { pick: 'United Kingdom', expect: 'United Kingdom' },
  { pick: 'France', expect: 'France' },
  { pick: 'India', expect: 'India' },
  { pick: 'New Zealand', expect: 'New Zealand' },
  { pick: 'Japan', expect: 'Japan' },
];

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

let failures = 0;

for (const country of COUNTRIES) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));

  process.stdout.write(`• ${country.pick} … `);
  try {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Found a party/ }).click();
    await page.getByRole('button', { name: new RegExp(`^${country.pick}`) }).click();
    await page.getByLabel('Party name').fill('Reform Coalition');
    await page.getByRole('button', { name: 'Contest the election' }).click();
    await page.waitForTimeout(900);

    /* Form a government if the chamber asks for one. */
    const inCoalition = await page
      .getByRole('heading', { name: 'The coalition room' })
      .isVisible()
      .catch(() => false);
    if (inCoalition) {
      for (let i = 0; i < 6; i += 1) {
        const done = await page.getByText('commands a majority').isVisible().catch(() => false);
        if (done) break;
        const accept = page.getByRole('button', { name: 'Accept their terms' }).first();
        if (!(await accept.isVisible().catch(() => false))) break;
        await accept.click();
        await page.waitForTimeout(120);
      }
      const present = page.getByRole('button', { name: 'Present this government' });
      if (await present.isVisible().catch(() => false)) {
        await present.click();
        await page.waitForTimeout(600);
      } else {
        /* No majority available: govern as a minority, or be turned out. */
        const abandon = page.getByRole('button', { name: /Govern (as a )?minority|Abandon/ });
        if (await abandon.isVisible().catch(() => false)) await abandon.click();
        await page.waitForTimeout(600);
      }
    }

    await page.getByRole('heading', { name: 'The morning brief' }).waitFor({ timeout: 10000 });

    const text = await page.locator('body').innerText();
    if (!text.includes(country.expect)) {
      throw new Error(`the desk does not say ${country.expect}`);
    }
    if (errors.length > 0) throw new Error(`console: ${errors[0]}`);

    console.log('ok');
  } catch (error) {
    failures += 1;
    console.log(`FAILED — ${error.message}`);
  } finally {
    await page.close();
  }
}

await browser.close();

if (failures > 0) {
  console.error(`\n${failures} of ${COUNTRIES.length} countries did not start.`);
  process.exit(1);
}
console.log(`\nAll ${COUNTRIES.length} countries start cleanly.`);
