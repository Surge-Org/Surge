import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

// `localhost`, not `127.0.0.1`: `vite preview` binds to ::1 only by default, so an
// IPv4 literal fails to connect while the server is plainly running.
const base = process.argv[2] ?? 'http://localhost:4173';
const output = path.resolve('output/pitch/screens');
await mkdir(output, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

// Reach the preview's stored state without naming its version. `src/lib/model.ts`
// bumps the key whenever the state shape changes, and a hardcoded one here fails
// silently: `getItem` returns null and the capture writes screenshots of a
// signed-out app that look almost right.
await page.addInitScript(() => {
  const key = () => Object.keys(localStorage).find(k => k.startsWith('surge-preview-'));
  window.__preview = () => {
    const k = key();
    if (!k) throw new Error('no surge-preview-* key in localStorage');
    return JSON.parse(localStorage.getItem(k));
  };
  window.__savePreview = state => localStorage.setItem(key(), JSON.stringify(state));
});

async function ready(route) {
  await page.goto(`${base}${route}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(850);
}

async function capture(name, route, prepare) {
  await ready(route);
  if (prepare) await prepare();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(output, `${name}.png`) });
}

try {
  await capture('01-landing', '/');
  await capture('02-explore', '/explore');
  await capture('03-issue', '/issue/412');

  // The following states use the preview's own local fixture data. They are
  // deliberately set before navigation so the application renders its real,
  // authenticated workspace rather than a fabricated mockup.
  await ready('/');
  await page.evaluate(() => {
    const state = window.__preview();
    state.session.contributor = 'Nadia Osakwe';
    state.applications.push({ issueId: '412', status: 'Assigned', message: 'I will unify the host-call errors and cover every failure mode.' });
    window.__savePreview(state);
  });
  await capture('04-contributor', '/me');
  await capture('05-points', '/me/points');

  await ready('/');
  await page.evaluate(() => {
    const state = window.__preview();
    state.session.maintainer = 'stellar';
    state.repos = state.repos.map(repo => repo.id === 'jssdk' ? { ...repo, ownerId: 'stellar', status: 'Accepted' } : repo);
    window.__savePreview(state);
  });
  await capture('06-maintainer', '/maintainer/repo/jssdk');
  await capture('07-maintainer-issues', '/maintainer/repo/jssdk/issues');
} finally {
  await browser.close();
}
