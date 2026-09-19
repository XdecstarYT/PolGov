/**
 * Browser smoke test: drives a real turn loop end to end and screenshots it.
 * Fails loudly on any console error or page exception.
 */
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173';
const OUT = process.env.OUT_DIR ?? '/tmp/claude-0/-home-user-PolGov/fa849906-2ba3-5691-a605-22a4e2d3b9b6/scratchpad';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

const step = async (label, fn) => {
  process.stdout.write(`• ${label} … `);
  await fn();
  console.log('ok');
};

await step('load title', async () => {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Statecraft' }).waitFor();
});
await page.screenshot({ path: `${OUT}/01-title.png` });

await step('found a party', async () => {
  await page.getByRole('button', { name: 'Found a party' }).click();
  await page.getByLabel('Party name').fill('Reform Coalition');
  await page.getByLabel('Economic', { exact: true }).fill('-0.2');
  await page.getByLabel('Environmental', { exact: true }).fill('0.35');
});
await page.screenshot({ path: `${OUT}/02-setup.png` });

await step('contest the election', async () => {
  await page.getByRole('button', { name: 'Contest the election' }).click();
  await page.waitForTimeout(700);
});

const inCoalition = await page.getByRole('heading', { name: 'The coalition room' }).isVisible().catch(() => false);
if (inCoalition) {
  await page.screenshot({ path: `${OUT}/03-coalition.png`, fullPage: true });
  await step('form a government', async () => {
    // Accept partners until the agreement commands a majority.
    for (let i = 0; i < 6; i++) {
      const done = await page.getByText('commands a majority').isVisible().catch(() => false);
      if (done) break;
      const accept = page.getByRole('button', { name: 'Accept their terms' }).first();
      if (!(await accept.isVisible().catch(() => false))) break;
      await accept.click();
      await page.waitForTimeout(150);
    }
    await page.getByRole('button', { name: 'Present this government' }).click();
    await page.waitForTimeout(700);
  });
}

await step('reach the briefing', async () => {
  await page.getByRole('heading', { name: 'The morning brief' }).waitFor({ timeout: 8000 });
});
await page.screenshot({ path: `${OUT}/04-briefing.png`, fullPage: true });

await step('look at the institutions', async () => {
  await page.getByRole('heading', { name: 'The institutions' }).waitFor();
  await page.getByRole('button', { name: /Standing Council/ }).click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: /Humanitarian Mission/ }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/04b-organisations.png`, fullPage: true });
});

await step('look at the trade schedule', async () => {
  await page.getByRole('heading', { name: 'The schedule' }).waitFor();
  await page
    .locator('section:has(> header h2:text-is("The schedule")) button[aria-expanded]')
    .first()
    .click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/04c-trade.png`, fullPage: true });
});

await step('open the red box', async () => {
  await page.getByRole('button', { name: /Open the red box/ }).click();
  await page.waitForTimeout(400);
});

await step('resolve every event', async () => {
  for (let i = 0; i < 4; i++) {
    const take = page.getByRole('button', { name: 'Take this course' }).first();
    if (!(await take.isVisible().catch(() => false))) break;
    if (i === 0) await page.screenshot({ path: `${OUT}/05-event.png`, fullPage: true });
    await take.click();
    await page.waitForTimeout(300);
  }
  await page.getByRole('button', { name: /Continue to the agenda/ }).click();
  await page.waitForTimeout(400);
});

await step('table a bill from the policy desk', async () => {
  await page.getByRole('heading', { name: 'Policy desk' }).waitFor();
  // Expand the first bill to reveal its pass-chance breakdown.
  await page.locator('button[aria-expanded]').first().click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/06-agenda.png`, fullPage: true });
  const table = page.getByRole('button', { name: /^Table this bill/ }).first();
  if (await table.isVisible().catch(() => false)) await table.click();
  await page.waitForTimeout(300);
});

await step('go to the budget', async () => {
  await page.getByRole('button', { name: /Continue to the budget/ }).click();
  await page.getByRole('heading', { name: 'The departments' }).waitFor();
  await page.waitForTimeout(300);
});
await page.screenshot({ path: `${OUT}/07-budget.png`, fullPage: true });

await step('open a department and move a line', async () => {
  /* The treasury is expanded by default; open a second one so the document
     is shown the way a player who is actually arguing with it sees it. */
  await page.getByRole('button', { name: /Health/ }).first().click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/07b-budget-document.png`, fullPage: true });
});

await step('put the budget to the chamber', async () => {
  const present = page.getByRole('button', { name: /Put it to the chamber/ });
  if (await present.isEnabled().catch(() => false)) {
    await present.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/07c-budget-division.png`, fullPage: true });
  }
});

await step('end the turn', async () => {
  await page.getByRole('button', { name: /End turn/ }).click();
  await page.getByRole('heading', { name: /What changed, and why/ }).waitFor({ timeout: 10000 });
});
await page.screenshot({ path: `${OUT}/08-report.png`, fullPage: true });

await step('dark mode', async () => {
  await page.getByRole('button', { name: 'Dark' }).click();
  await page.waitForTimeout(300);
});
await page.screenshot({ path: `${OUT}/09-report-dark.png`, fullPage: true });

await step('advance into the next week', async () => {
  await page.getByRole('button', { name: /Begin the next week/ }).click();
  await page.getByRole('heading', { name: 'The morning brief' }).waitFor({ timeout: 8000 });
});

/* The second briefing is the first one with any history on it, so it is the
   one worth looking at: the economy traces and the trend line are empty on
   turn one and tell you nothing about whether they render. */
await page.getByRole('button', { name: 'Light' }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/10-briefing-turn2.png`, fullPage: true });

await browser.close();

if (errors.length) {
  console.error('\nCONSOLE ERRORS:');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
console.log('\nSmoke test passed with no console errors.');
