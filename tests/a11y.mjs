// Reproducible accessibility check for VIDEOBOY.
// Copyright 2026 Victor Ibidunmoye. Apache-2.0.
//
//   npm run test:a11y
//
// Builds the site, serves it, and runs axe-core (WCAG 2.2 A/AA and best-practice
// rules) against the hero player in every theme, at three player widths, in ten
// states from boot to error, plus the whole page. It writes:
//   public/a11y-report.json  every run, every rule result
//   public/a11y-tree.txt     the player's accessibility tree, as a screen reader sees it
// and exits non-zero if any violation is found.
//
// The bundled clip is used (?local) so the run does not depend on the network.
// Set VB_CHROME to a Chromium binary to use one already on the machine.
import { chromium } from 'playwright';
import { preview } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const THEMES = ['tangerine', 'classic', 'night'];
const VIEWPORTS = [
  { name: '1100', width: 1180 },
  { name: '640', width: 700 },
  { name: '360', width: 400 },
];

const server = await preview({ preview: { port: 4179, strictPort: true }, logLevel: 'error' });
const base = 'http://localhost:4179/?local';
const browser = await chromium.launch({
  executablePath: process.env.VB_CHROME || undefined,
  args: ['--autoplay-policy=no-user-gesture-required'],
});

const runs = [];
let violations = 0;

async function axe(page, label) {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ content: AXE });
  const r = await page.evaluate(async (tags) => {
    const res = await window.axe.run(document, { runOnly: { type: 'tag', values: tags } });
    return {
      passes: res.passes.length,
      incomplete: res.incomplete.map((v) => v.id),
      violations: res.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target.join(' ')) })),
    };
  }, TAGS);
  const n = r.violations.reduce((a, v) => a + v.nodes.length, 0);
  violations += n;
  runs.push({ ...label, ...r });
  console.log(`${n ? 'FAIL' : 'ok  '} ${label.theme.padEnd(9)} ${label.width.padEnd(4)} ${label.state}${n ? '  ' + r.violations.map((v) => v.id).join(', ') : ''}`);
}

const STATES = {
  boot: async () => {},
  start: async (p) => p.waitForTimeout(2000),
  playing: async (p) => {
    await p.click('#skin .vb-start');
    await p.waitForTimeout(1200);
  },
  paused: async (p) => {
    await p.click('#skin .vb-a');
    await p.waitForTimeout(900);
  },
  menu: async (p) => {
    await p.click('#skin .vb-menu-btn');
    await p.waitForTimeout(300);
  },
  submenu: async (p) => {
    await p.click('#skin .vb-menu-speed');
    await p.waitForTimeout(300);
  },
  tooltip: async (p) => {
    await p.keyboard.press('Escape');
    await p.keyboard.press('Escape');
    await p.hover('#skin .vb-a');
    await p.waitForTimeout(800);
  },
  muted: async (p) => {
    await p.click('#skin .vb-b');
    await p.waitForTimeout(300);
  },
  ended: async (p) => {
    await p.evaluate(() => {
      const v = document.querySelector('#skin video');
      v.currentTime = v.duration - 0.2;
      v.play();
    });
    await p.waitForTimeout(1500);
  },
  error: async (p) => {
    await p.evaluate(() => {
      const v = document.querySelector('#skin video');
      v.src = '/media/missing.mp4';
      v.load();
    });
    await p.waitForTimeout(1500);
  },
};

for (const theme of THEMES) {
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: 900 } });
    await page.goto(base);
    await page.evaluate((t) => document.querySelector(`input[name=hero-theme][value=${t}]`).click(), theme);
    await page.waitForTimeout(500);
    for (const [state, step] of Object.entries(STATES)) {
      await step(page);
      await axe(page, { theme, width: vp.name, state });
    }
    await page.close();
  }
}

// The whole page in each theme (the page re-colours with the player), at desktop and phone widths.
for (const theme of THEMES) {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.addInitScript((t) => localStorage.setItem('videoboy.theme', t), theme);
    await page.goto(base);
    await page.waitForTimeout(2600);
    await axe(page, { theme, width: String(width), state: 'page' });
    await page.close();
  }
}

// The player's accessibility tree while paused with the menu open.
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(base);
  await page.waitForTimeout(2600);
  await page.click('#skin .vb-start');
  await page.waitForTimeout(1000);
  await page.click('#skin .vb-a');
  await page.waitForTimeout(800);
  const paused = await page.locator('#skin').ariaSnapshot();
  await page.click('#skin .vb-menu-btn');
  await page.waitForTimeout(300);
  const menu = await page.locator('#skin .vb-menu').ariaSnapshot();
  writeFileSync(
    'public/a11y-tree.txt',
    `VIDEOBOY accessibility tree (Playwright ariaSnapshot, Chromium), ${new Date().toISOString().slice(0, 10)}\n\n` +
      `# Player, paused\n${paused}\n\n# Menu, open\n${menu}\n`
  );
  await page.close();
}

await browser.close();
server.httpServer.close();

writeFileSync(
  'public/a11y-report.json',
  JSON.stringify(
    { tool: 'axe-core ' + JSON.parse(readFileSync(require.resolve('axe-core/package.json'), 'utf8')).version, tags: TAGS, date: new Date().toISOString(), runs: runs.length, violations, results: runs },
    null,
    1
  )
);
console.log(`\n${runs.length} runs, ${violations} violations`);
process.exit(violations ? 1 : 0);
