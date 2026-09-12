import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:3000';
// With no executablePath, Playwright launches its own managed Chromium — what
// CI installs. CHROME_PATH points at a local browser instead, so the suite can
// run against an already-installed Chrome without a download.
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

const go = async path => { await page.goto(base + path); await page.locator('#main, .public, .auth').first().waitFor(); };
const settle = () => page.waitForTimeout(350);

try {
  // ---------------------------------------------------------- public surfaces
  await go('/');
  await page.getByRole('heading', { name: /Build on Stellar/ }).waitFor();
  assert.equal(await page.locator('.rail').count(), 0, 'landing has no dashboard rail');
  assert.equal(await page.locator('.lanyard-badge').count(), 1, 'hero lanyard renders');
  assert.ok(await page.evaluate(() => {
    const strip = document.querySelector('.strip').getBoundingClientRect();
    return strip.top >= innerHeight - 2;
  }), 'the hero fills the viewport and the repository strip sits below the fold');
  assert.ok(await page.locator('.announce').isVisible(), 'announcement bar renders');
  assert.ok(await page.locator('.navpill .goo-items a').count() >= 3, 'gooey nav links render');
  assert.ok(await page.locator('.logoloop-set').count() >= 2, 'logo loop duplicates its set');
  assert.equal(await page.locator('.swap-card').count(), 4, 'card swap stack renders');
  assert.equal(await page.locator('.bounce-card').count(), 3, 'bounce cards render');
  assert.ok(await page.locator('.spiral-item').count() >= 6, 'infinite spiral renders');
  assert.equal(await page.locator('.pcard').count(), 4, 'profile cards render');
  assert.ok(await page.locator('section').count() >= 8, 'landing has the full set of sections');
  assert.equal(await page.locator('.faq-item').count(), 6);
  assert.ok(await page.locator('.logoloop .strip-item').count() >= 6, 'repository logo loop renders');
  assert.equal(await page.getByRole('link', { name: 'Maintainer sign-in' }).count(), 0,
    'the maintainer sign-in button is gone from the hero');
  assert.ok(await page.locator('.navpill').getByRole('link', { name: 'Submit your repo' }).isVisible(),
    'top nav says Submit your repo');

  await page.getByRole('link', { name: /Explore issues/ }).first().click();
  await page.waitForURL('**/explore');
  await page.getByRole('heading', { name: 'Explore', exact: true }).waitFor();
  await settle();
  assert.equal(await page.locator('.rail').count(), 0, 'explore is not a dashboard');
  assert.equal(await page.locator('.list-row').count(), 7);

  // search + tabs
  await page.getByLabel('Search', { exact: true }).fill('rounding');
  await settle();
  assert.equal(await page.locator('.list-row').count(), 1);
  await page.getByLabel('Search', { exact: true }).fill('');
  await page.getByRole('tab', { name: 'Repositories' }).click();
  await page.waitForURL('**/explore/repos');
  await page.locator('.repo-tile').first().waitFor();
  assert.equal(await page.locator('.repo-tile').count(), 6);
  await page.getByRole('tab', { name: 'Organizations' }).click();
  await page.waitForURL('**/explore/orgs');
  await page.locator('.repo-tile').first().waitFor();
  const orgCount = await page.evaluate(() => new Set(
    JSON.parse(localStorage.getItem('surge-preview-v4')).repos
      .filter(r => r.status === 'Accepted').map(r => r.org)).size);
  // Repository and organization tiles share a class, so the repositories from
  // the previous tab satisfy the wait above. Let the grid actually swap before
  // counting, and let the assertion — not a timeout — report a wrong count.
  await page
    .waitForFunction(n => document.querySelectorAll('.repo-tile').length === n, orgCount, { timeout: 5000 })
    .catch(() => {});
  assert.equal(await page.locator('.repo-tile').count(), orgCount,
    'organizations tab lists every distinct accepted org');

  // filters
  await page.getByRole('tab', { name: 'Issues' }).click();
  await page.waitForURL('**/explore');
  await page.locator('.list-row').first().waitFor();
  await page.getByRole('button', { name: 'Filters' }).click();
  await page.getByLabel('Complexity').selectOption('High');
  await settle();
  assert.equal(await page.locator('.list-row').count(), 2);
  await page.getByRole('button', { name: 'Reset' }).click();
  await settle();
  assert.equal(await page.locator('.list-row').count(), 7);

  // ------------------------------------------------------- contributor apply
  await go('/issue/412');
  await page.getByRole('heading', { name: 'Normalise contract error reporting across host calls' }).waitFor();
  await page.getByRole('button', { name: 'Apply to this issue' }).click();
  await page.waitForURL('**/login?**');
  await page.getByLabel('Display name').fill('Casey Contributor');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL('**/issue/412');
  await page.getByRole('button', { name: 'Apply to this issue' }).click();
  await page.getByLabel('Your plan').fill('I would move every fallible host call onto a shared error enum, keep the discriminants stable, and assert each variant in tests.');
  await page.getByRole('button', { name: 'Send proposal' }).click();
  await settle();
  assert.equal(await page.locator('.proposal').count(), 1);
  await page.reload();
  await settle();
  assert.match(await page.locator('.proposal').first().innerText(), /Applied/, 'proposal persists');

  await go('/me');
  assert.equal(await page.locator('.list-row').count(), 1, 'assignment appears in contributor workspace');

  // ------------------------------------------- maintainer is a separate login
  await go('/maintainer');
  await page.waitForURL('**/maintainer/login');
  assert.ok(await page.getByLabel('Maintainer handle').isVisible(),
    'a contributor session does not open the maintainer area');

  await page.getByLabel('Maintainer handle').fill('ada-org');
  await page.getByRole('button', { name: 'Enter maintainer area' }).click();
  await page.waitForURL('**/maintainer');
  await page.getByRole('heading', { name: 'Nothing submitted yet' }).waitFor();

  // -------------------------------- submit does not open a dashboard by itself
  await page.getByRole('link', { name: /Submit a repository/ }).click();
  await page.waitForURL('**/maintainer/submit');
  await page.getByLabel('GitHub repository').fill('ada-org/soroban-kit');
  await page.getByLabel('What does it do?').fill('A toolkit for building and testing Soroban contracts.');
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await page.waitForURL('**/maintainer');
  await settle();
  assert.match(await page.locator('.repo-card').first().innerText(), /Pending/);
  assert.equal(await page.getByRole('link', { name: /Open dashboard/ }).count(), 0,
    'no dashboard link while the repository is pending');

  const repoId = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('surge-preview-v4')).repos.find(r => r.ownerId === 'ada-org').id);

  // the gate also holds against a direct URL
  await page.goto(`${base}/maintainer/repo/${repoId}`);
  await page.waitForURL('**/maintainer');
  assert.ok(!page.url().includes('/repo/'), 'pending repo dashboard is refused by URL');

  // ------------------------------------------- acceptance opens that dashboard
  await page.getByRole('button', { name: /Simulate acceptance/ }).click();
  await settle();
  assert.match(await page.locator('.repo-card').first().innerText(), /Accepted/);
  await page.getByRole('link', { name: /Open dashboard/ }).click();
  await page.waitForURL(`**/maintainer/repo/${repoId}`);
  await settle();
  assert.equal(await page.locator('.page-head h1').innerText(), 'soroban-kit');
  assert.equal(await page.locator('.rail-scope-sub').innerText(), 'ada-org/soroban-kit',
    'the dashboard is scoped to one repository');

  // a different maintainer cannot reach it
  await go('/maintainer/login');
  await page.getByLabel('Maintainer handle').fill('someone-else');
  await page.getByRole('button', { name: 'Enter maintainer area' }).click();
  await page.waitForURL('**/maintainer');
  await page.goto(`${base}/maintainer/repo/${repoId}`);
  await page.waitForURL('**/maintainer');
  assert.ok(!page.url().includes('/repo/'), 'another maintainer is refused');

  // --------------------------------------------- proposals on a seeded repo
  await go('/maintainer/login');
  await page.getByLabel('Maintainer handle').fill('ada-org');
  await page.getByRole('button', { name: 'Enter maintainer area' }).click();
  await page.waitForURL('**/maintainer');
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('surge-preview-v4'));
    s.repos = s.repos.map(r => (r.id === 'jssdk' ? { ...r, ownerId: 'ada-org' } : r));
    localStorage.setItem('surge-preview-v4', JSON.stringify(s));
  });
  await go('/maintainer/repo/jssdk/issues');
  await page.getByRole('button', { name: /Add a resilient event subscription/ }).click();
  await settle();
  assert.equal(await page.locator('.issue-block-body .proposal').count(), 2, 'two seeded proposals');
  await page.locator('.issue-block-body .proposal').first().getByRole('button', { name: 'Assign' }).click();
  await settle();
  const states = await page.locator('.issue-block-body .proposal .chip').allInnerTexts();
  assert.ok(states.includes('Assigned') && states.includes('Rejected'),
    'assigning one candidate declines the rest');

  // --------------------------------------------------------- theme persistence
  // Dark is the default, so toggle to light, verify it sticks, then return.
  await go('/explore');
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await page.getByRole('button', { name: /Switch to light theme/ }).click();
  await settle();
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  await page.getByRole('button', { name: /Switch to dark theme/ }).click();
  await settle();
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');

  // ------------------------------------------------------------- responsive
  const routes = [
    '/', '/explore', '/explore/repos', '/explore/orgs', '/issue/707',
    '/login', '/maintainer/login', '/maintainer', '/maintainer/submit',
    '/maintainer/repo/jssdk', '/maintainer/repo/jssdk/issues',
    '/maintainer/repo/jssdk/settings', '/me', '/me/points', '/me/settings',
  ];
  for (const width of [1440, 1024, 820, 640, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await go(route);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1),
        false,
        `${route} overflows horizontally at ${width}px`,
      );
    }
  }

  // ---------------------------------------------------------- mobile drawer
  await page.setViewportSize({ width: 390, height: 900 });
  await go('/maintainer');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await settle();
  await page.locator('.rail.open').getByRole('link', { name: 'Submit a repo' }).click();
  await page.waitForURL('**/maintainer/submit');

  assert.deepEqual(errors, []);
  console.log('Passed: public explore (no dashboard chrome), search/tabs/filters, contributor apply and persistence, separate maintainer sign-in, submit-then-review gate, per-repo dashboards scoped by owner and acceptance, proposal assignment, theme persistence, 15 routes at 5 widths with no overflow, and the mobile drawer.');
} catch (error) {
  console.log(await page.locator('body').innerText());
  await page.screenshot({ path: 'reference/test-failure.png', fullPage: true });
  throw error;
} finally {
  await browser.close();
}
