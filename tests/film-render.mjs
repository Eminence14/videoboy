// Renders dev/film.html frame by frame. Usage: node tests/film-render.mjs <from> <to> <outdir> [--stills t1,t2,...]
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { mkdirSync, renameSync } from 'fs';
const [from = 0, to = 43.5, out = '/tmp/film'] = process.argv.slice(2);
const stills = (process.argv.find((a) => a.startsWith('--stills=')) || '').slice(9).split(',').filter(Boolean).map(Number);
const SCENES = (process.env.SCENES || '').split(',').filter(Boolean).map(Number); // scene start times, for one file per scene
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.VB_CHROME, args: ['--autoplay-policy=no-user-gesture-required', '--disable-gpu-vsync'] });
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
p.on('console', (m) => m.type() === 'error' && console.log('page error:', m.text().slice(0, 200)));
p.on('pageerror', (e) => console.log('pageerror:', String(e).slice(0, 300)));
await p.clock.install({ time: 0 });
await p.goto('http://localhost:5199/dev/film.html');
await p.waitForFunction(() => window.film, null, { timeout: 30000 });
// let the players boot (their boot logo runs on the fake clock)
for (let i = 0; i < 90; i++) await p.clock.runFor(33.333);
const geo = await p.evaluate(() => window.film.init());
console.log('geometry', JSON.stringify(geo.P));
const FPS = 30, N0 = Math.round(+from * FPS), N1 = Math.round(+to * FPS);
let ff = null, sceneIdx = -1, tmp = '';
const openScene = (i) => {
  tmp = `${out}/scene-${String(i).padStart(2, '0')}.tmp.mp4`;
  ff = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-crf', '17', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', '30', tmp], { stdio: ['pipe', 'inherit', 'inherit'] });
  ff.final = tmp.replace('.tmp.mp4', '.mp4');
};
const closeScene = () => new Promise((res) => { if (!ff) return res(); const f = ff; f.on('close', (code) => { if (code === 0) renameSync(tmp, f.final); res(); }); f.stdin.end(); ff = null; });
const t0 = Date.now();
for (let n = 0; n <= N1; n++) {
  const t = n / FPS;
  await p.evaluate((t) => window.film.frame(t), t);
  const shoot = n >= N0 && !stills.length;
  const still = stills.find((s) => Math.round(s * FPS) === n);
  if (shoot) {
    const si = SCENES.length ? SCENES.filter((s) => s <= t + 1e-6).length - 1 : 0;
    if (si !== sceneIdx) { await closeScene(); sceneIdx = si; openScene(si); }
    const buf = await p.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  } else if (still !== undefined) {
    await p.screenshot({ path: `${out}/still-${still.toFixed(2)}.jpg`, type: 'jpeg', quality: 92 });
  }
  await p.clock.runFor(1000 / FPS);
  if (n % 150 === 0) console.log('frame', n, 't', t.toFixed(1), Math.round((Date.now() - t0) / 1000) + 's');
}
await closeScene();
await b.close();
