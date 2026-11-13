// VIDEOBOY showcase film: a 1920x1080 stage around the real player, stepped frame by frame.
// The renderer (tests/film-render.mjs) installs a fake clock, then calls film.frame(t) for every frame.
import '/src/skin.ts';
import '/src/videoboy.css';

const FPS = 30;
const DT = 1000 / FPS;
const $ = <T extends HTMLElement = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as T;

/* ---------------------------------------------------------------- easing */
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const outCubic = (p: number) => 1 - Math.pow(1 - p, 3);
const inOutCubic = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const outBack = (p: number) => { const c1 = 1.6, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };
const outExpo = (p: number) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));
const prog = (t: number, a: number, b: number) => clamp((t - a) / (b - a));

/* ---------------------------------------------------------------- the cast */
const stage = $('#stage');
const cam = $('#cam');
const rig = $('#rig');
const skin = $('#skin');
const vid = $<HTMLVideoElement>('#vid');
const shelf = $('#shelf');
const sizes = $('#sizes');
const lines = $('#lines');
const tags = $('#tags');
const keyEl = $('#key');
const cursor = $('#cursor');
const title = $('#title');
const titleSub = $('#title-sub');
const end = $('#end');
const dissolve = $<HTMLCanvasElement>('#dissolve');
const dctx = dissolve.getContext('2d')!;
stage.append(sizes); // sizes live in stage space, not under the camera

const WORD = 'VIDEOBOY';
$('#wm').innerHTML = [...WORD].map((c) => `<span>${c}</span>`).join('');
const letters = [...$('#wm').children] as HTMLElement[];

const CARTS = [
  { id: 'tos', title: 'Tears of Steel', tag: 'Sci-fi · 2:00' },
  { id: 'bbb', title: 'Big Buck Bunny', tag: 'Bright · 1:15' },
  { id: 'sintel', title: 'Sintel', tag: 'Dark · 1:20' },
  { id: 'cosmos', title: 'Cosmos Laundromat', tag: 'Vivid · 1:15' },
];
shelf.innerHTML = CARTS.map((c, i) => `<div class="cart${i === 0 ? ' on' : ''}" data-id="${c.id}"><span class="cart-body"><span class="cart-ridge"></span><span class="cart-label"><img src="/dev/film/${c.id}.jpg" alt=""></span><span class="cart-led"></span></span><span class="cart-name">${c.title}</span><span class="cart-tag">${c.tag}</span></div>`).join('');

const SIZE_W = [940, 600, 400, 280];
const SIZE_L = ['900 px and up', '460 to 699 px', '300 to 459 px', 'Under 300 px'];
const SIZE_K = 0.78; // the row is scaled to fit; each player keeps its true width and layout
sizes.innerHTML = SIZE_W.map((w, i) => `<div style="width:${w}px"><span class="size-l">${SIZE_L[i]}</span><video-player><videoboy-skin no-chime data-theme="night" poster="/dev/film/tos.jpg"><video src="/dev/film/tos.mp4" playsinline preload="auto" crossorigin="anonymous"></video></videoboy-skin></video-player></div>`).join('');
const sizeBoxes = [...sizes.children] as HTMLElement[];
const sizeVids = [...sizes.querySelectorAll('video')] as HTMLVideoElement[];

/* ---------------------------------------------------------------- helpers */
const container = () => skin.querySelector('.videoboy') as HTMLElement;
function key(k: string, type: 'keydown' | 'keyup' = 'keydown') {
  container().dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true, cancelable: true }));
}
function press(k: string) { key(k, 'keydown'); key(k, 'keyup'); }

// Kinetic line: a masked reveal from below, out upwards.
type Line = { el: HTMLElement; inner: HTMLElement; a: number; b: number };
const lineList: Line[] = [];
function line(html: string, x: number, y: number, a: number, b: number, cls = '') {
  const el = document.createElement('div');
  el.className = 'line ' + cls;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.innerHTML = `<span>${html}</span>`;
  lines.append(el);
  lineList.push({ el, inner: el.firstElementChild as HTMLElement, a, b });
}
type Tag = { el: HTMLElement; a: number; b: number };
const tagList: Tag[] = [];
function tag(text: string, a: number, b: number, place: () => { x: number; y: number }, down = false) {
  const el = document.createElement('div');
  el.className = 'tag' + (down ? ' down' : '');
  el.textContent = text;
  tags.append(el);
  tagList.push({ el, a, b, ...{ place } } as Tag & { place: () => { x: number; y: number } });
}
type Cap = { keys: string[]; label: string; a: number; b: number };
const caps: Cap[] = [];
function cap(keys: string[], label: string, a: number, b = a + 0.9) { caps.push({ keys, label, a, b }); }

/* ---------------------------------------------------------------- geometry, read once the player has laid out */
let P = { x: 0, y: 0, w: 0, h: 0 }; // player box in cam space
const parts: Record<string, { x: number; y: number; w: number; h: number }> = {};
function measure() {
  const rr = rig.getBoundingClientRect();
  const camRect = cam.getBoundingClientRect();
  const sk = skin.getBoundingClientRect();
  const sc = camRect.width / 1920; // current cam scale (1 at measure time)
  const rel = (r: DOMRect) => ({ x: (r.left - camRect.left) / sc, y: (r.top - camRect.top) / sc, w: r.width / sc, h: r.height / sc });
  P = rel(sk);
  for (const [name, sel] of Object.entries({ dpad: 'vb-dpad', play: '.vb-a', mute: '.vb-b', menu: '.vb-menu-btn', full: '.vb-fs', grille: '.vb-grille', seek: '.vb-groove', screen: 'vb-lcd' })) {
    const el = skin.querySelector(sel);
    if (el) parts[name] = rel(el.getBoundingClientRect());
  }
  shelf.style.top = P.h + 56 + 'px';
  void rr;
}
const ctr = (p: { x: number; y: number; w: number; h: number }) => ({ x: p.x + p.w / 2, y: p.y + p.h / 2 });

/* ---------------------------------------------------------------- camera: keyframes of scale and focus point */
type View = { s: number; fx: number; fy: number };
let views: [number, View, (p: number) => number][] = [];
function camAt(t: number): View {
  let v = views[0][1];
  for (let i = 1; i < views.length; i++) {
    const [t1, v1, ease] = views[i];
    const [t0, v0] = views[i - 1];
    if (t <= t0) break;
    if (t >= t1) { v = v1; continue; }
    // each keyframe is reached at its time, moving over the 0.9 s before it
    const span = Math.min(1.1, t1 - t0);
    const p = ease(prog(t, t1 - span, t1));
    v = { s: lerp(v0.s, v1.s, p), fx: lerp(v0.fx, v1.fx, p), fy: lerp(v0.fy, v1.fy, p) };
    break;
  }
  return v;
}
function applyCam(v: View, screenX = 960, screenY = 540) {
  cam.style.transform = `translate(${screenX - v.fx * v.s}px, ${screenY - v.fy * v.s}px) scale(${v.s})`;
}

/* ---------------------------------------------------------------- the score */
type Ev = [number, () => void];
const events: Ev[] = [];
const at = (t: number, fn: () => void) => events.push([t, fn]);
let fired = 0;
let playing = false; // our record of whether the film should advance
let vt = 0; // media time we drive while playing

function setTheme(name: 'tangerine' | 'classic' | 'night') {
  stage.dataset.t = name;
  if (name === 'tangerine') delete skin.dataset.theme; else skin.dataset.theme = name;
}
const OFFSET: Record<string, number> = { tos: 0, bbb: 3.2, sintel: 0.4, cosmos: 3.4 };
function loadClip(id: string) {
  skin.setAttribute('poster', `/dev/film/${id}.jpg`);
  // as on the site: only Tears of Steel carries captions
  vid.querySelectorAll('track').forEach((t) => t.remove());
  if (id === 'tos') vid.insertAdjacentHTML('beforeend', '<track kind="subtitles" src="/dev/film/tos.vtt" srclang="en" label="English" default>');
  vid.src = `/dev/film/${id}.mp4`;
  const off = OFFSET[id] ?? 0;
  vt = off;
  vid.addEventListener('loadeddata', () => { vid.currentTime = off; }, { once: true });
  for (const c of shelf.children) c.classList.toggle('on', (c as HTMLElement).dataset.id === id);
}

function score() {
  const L = 116; // left column for kinetic lines
  // the player sits in the right of the frame (x 700 to 1880), the words in the left column
  const sideR = (): View => { const s = Math.min(0.86 * 1080 / P.h, 1200 / P.w); return { s, fx: P.x + P.w / 2 - (1270 - 960) / s, fy: P.y + P.h / 2 }; };
  const full = (): View => { const s = Math.min(1700 / P.w, 1000 / P.h); return { s, fx: P.x + P.w / 2, fy: P.y + P.h / 2 }; };
  const dpad = ctr(parts.dpad), keys = ctr(parts.menu), play = ctr(parts.play);
  const withShelf = (): View => { const h = P.h + 56 + 330; const s = Math.min(1000 / h, 1180 / P.w); return { s, fx: P.x + P.w / 2 - (1290 - 960) / s, fy: P.y + h / 2 }; };

  // the handheld waits below the frame, then rises into place as the title lifts away
  const start = { ...sideR(), fx: sideR().fx - (960 - 1270) / sideR().s, fy: sideR().fy - 1250 / sideR().s };
  views = [
    [0, start, inOutCubic],
    [2.8, start, inOutCubic],
    [3.9, sideR(), outExpo],
    [12.6, sideR(), inOutCubic],
    [13.7, { s: 2.1, fx: dpad.x + 250, fy: dpad.y - 80 }, inOutCubic],
    [15.9, { s: 2.1, fx: dpad.x + 250, fy: dpad.y - 80 }, inOutCubic],
    [16.9, { s: 2.9, fx: keys.x - 40, fy: keys.y - 50 }, inOutCubic],
    [19.4, { s: 2.9, fx: keys.x - 40, fy: keys.y - 50 }, inOutCubic],
    [20.4, sideR(), inOutCubic],
    [21.0, sideR(), inOutCubic],
    [22.0, withShelf(), inOutCubic],
    [28.4, withShelf(), inOutCubic],
    [29.3, sideR(), inOutCubic],
    [34.0, sideR(), inOutCubic],
  ];

  /* S1 · title */
  /* S2 · playing */
  cap(['X'], 'Play', 3.2, 4.1);
  at(3.45, () => { press('x'); playing = true; });
  line('Full colour', L, 400, 4.0, 8.6);
  line('while it plays.', L, 474, 4.15, 8.6);
  line('Only captions sit', L, 584, 4.7, 8.6, 'sm');
  line('on the picture.', L, 630, 4.8, 8.6, 'sm');
  /* S3 · pause */
  cap(['X'], 'Pause', 8.75, 9.7);
  at(9.0, () => { press('x'); playing = false; });
  line('The moment', L, 360, 9.25, 12.5);
  line('it stops,', L, 434, 9.4, 12.5);
  line('the screen becomes a', L, 548, 9.9, 12.5, 'sm');
  line('<span class="a">four-tone dot-matrix</span>', L, 594, 10.05, 12.5, 'sm');
  line('<span class="a">panel.</span>', L, 640, 10.15, 12.5, 'sm');
  /* S4 · console */
  const tg = (p: { x: number; y: number }, dx = 0, dy = 0) => () => ({ x: p.x + dx, y: p.y + dy });
  cap(['D'], 'Seek +5 s', 13.9, 14.7);
  at(14.05, () => press('d'));
  at(14.5, () => press('d'));
  cap(['A'], 'Seek −5 s', 14.75, 15.3);
  at(14.95, () => press('a'));
  tag('◀ ▶  Seek 5 s', 13.9, 15.9, tg(dpad, 0, -parts.dpad.h / 2 - 46));
  cap(['W'], 'Volume', 15.25, 15.9);
  at(15.4, () => press('s'));
  at(15.65, () => press('w'));
  tag('▲ ▼  Volume', 15.25, 15.9, tg(dpad, 0, parts.dpad.h / 2 + 54), true);
  cap(['Shift'], 'Menu', 17.0, 17.9);
  at(17.25, () => { key('Shift', 'keydown'); key('Shift', 'keyup'); });
  tag('Select opens the menu', 17.4, 19.2, tg(ctr(parts.menu), -205, 30));
  at(18.4, () => press('ArrowDown'));
  at(18.75, () => press('ArrowDown'));
  cap(['Esc'], 'Back out', 19.05, 19.7);
  at(19.25, () => { const m = skin.querySelector('.vb-menu-btn') as HTMLButtonElement; if (m.getAttribute('aria-expanded') === 'true') m.click(); });
  line('Every part of the console', L, 96, 13.3, 19.6, 'hd');
  line('is a <span class="a">real control.</span>', L, 170, 13.45, 19.6, 'hd');
  cap(['X'], 'Play', 20.2, 21.0);
  at(20.45, () => { press('x'); playing = true; });
  /* S5 · cartridges */
  line('Slot in', L, 360, 21.2, 29.0);
  line('any film.', L, 434, 21.35, 29.0);
  const cartXY = (i: number) => () => { const c = shelf.children[i] as HTMLElement; return { x: rig.offsetLeft + c.offsetLeft + c.offsetWidth / 2, y: rig.offsetTop + P.h + 56 + 90 }; };
  cursorPath.push([21.6, cartXY(0), 0], [22.5, cartXY(1), 1], [24.6, cartXY(1), 0], [25.4, cartXY(2), 1], [27.0, cartXY(2), 0], [27.7, cartXY(3), 1], [28.6, cartXY(3), 0]);
  at(22.5, () => { loadClip('bbb'); });
  at(22.85, () => { vid.play().catch(() => {}); playing = true; });
  line('<span class="a">Bright</span> scenes,', L, 552, 23.0, 29.0, 'sm');
  at(25.4, () => { loadClip('sintel'); });
  at(25.75, () => { vid.play().catch(() => {}); playing = true; });
  line('<span class="a">dark</span> ones,', L, 598, 25.9, 29.0, 'sm');
  at(27.7, () => { loadClip('cosmos'); });
  at(28.05, () => { vid.play().catch(() => {}); playing = true; });
  line('<span class="a">vivid</span> ones.', L, 644, 28.0, 29.0, 'sm');
  line('Always readable.', L, 712, 28.2, 29.0, 'sm');
  /* S6 · themes */
  cap(['X'], 'Pause', 29.0, 29.8);
  at(29.25, () => { press('x'); playing = false; });
  line('Three themes.', L, 380, 29.6, 33.9);
  line('The whole page follows.', L, 470, 29.8, 33.9, 'sm');
  swaps.push([30.6, 'classic'], [32.2, 'night']);
  /* S7 · sizes */
  at(33.6, () => { for (const v of sizeVids) { if (v.paused) { v.play().catch(() => {}); } } });
  at(33.75, () => { for (const v of sizeVids) v.pause(); });
  line('One handheld. Four layouts.', 0, 120, 34.6, 38.5, 'ctr');
  line('The console follows the player’s own width.', 0, 204, 34.8, 38.5, 'ctr sm');
  /* S8 · end */
}
const cursorPath: [number, () => { x: number; y: number }, number][] = [];
const swaps: [number, 'tangerine' | 'classic' | 'night'][] = [];

/* ---------------------------------------------------------------- per-frame render */
function draw(t: number) {
  // title
  const tIn = (i: number) => outBack(prog(t, 0.25 + i * 0.075, 0.75 + i * 0.075));
  letters.forEach((el, i) => {
    const p = tIn(i);
    el.style.transform = `translateY(${(1 - p) * -260}px)`;
    el.style.opacity = String(clamp(p * 3));
  });
  const sp = outCubic(prog(t, 1.15, 1.75));
  titleSub.style.opacity = String(sp);
  titleSub.style.transform = `translateY(${(1 - sp) * 24}px)`;
  const tOut = inOutCubic(prog(t, 2.7, 3.5));
  title.style.transform = `translateY(${-tOut * 160}px) scale(${1 - tOut * 0.2})`;
  title.style.opacity = String(1 - tOut);
  title.style.display = t > 3.6 ? 'none' : '';

  // camera, with a slow drift while a shot holds
  const v = camAt(t);
  let scenesHide = t > 34.0;
  const s7 = inOutCubic(prog(t, 34.0, 34.8));
  const s7o = inOutCubic(prog(t, 38.4, 39.0));
  cam.style.opacity = String(1 - s7);
  applyCam(v);

  // kinetic lines
  for (const l of lineList) {
    const pin = outExpo(prog(t, l.a, l.a + 0.7));
    const pout = inOutCubic(prog(t, l.b - 0.35, l.b));
    const y = (1 - pin) * 110 - pout * 110;
    l.inner.style.transform = `translateY(${y}%)`;
    l.el.style.visibility = t < l.a - 0.05 || t > l.b + 0.05 ? 'hidden' : 'visible';
    if (l.el.classList.contains('ctr')) { l.el.style.left = '0'; l.el.style.right = '0'; l.el.style.textAlign = 'center'; }
  }
  // tags follow their anchor through the camera
  for (const tgi of tagList as (Tag & { place: () => { x: number; y: number } })[]) {
    const pin = outBack(prog(t, tgi.a, tgi.a + 0.45));
    const pout = prog(t, tgi.b - 0.25, tgi.b);
    const on = t >= tgi.a && t <= tgi.b;
    tgi.el.style.display = on ? '' : 'none';
    if (!on) continue;
    const pt = tgi.place();
    const sx = 960 - v.fx * v.s + pt.x * v.s;
    const sy = 540 - v.fy * v.s + pt.y * v.s;
    const w = tgi.el.offsetWidth, h = tgi.el.offsetHeight;
    tgi.el.style.left = sx - w / 2 + 'px';
    tgi.el.style.top = sy - h / 2 + 'px';
    tgi.el.style.opacity = String((1 - pout) * clamp(pin * 2));
    tgi.el.style.transform = `scale(${0.7 + 0.3 * pin})`;
  }
  // keycaps
  const c = caps.find((k) => t >= k.a && t <= k.b);
  if (c) {
    const html = `${c.keys.map((k) => `<span class="cap${k.length > 1 ? ' wide' : ''}">${k}</span>`).join('')}<span class="cap-l">${c.label}</span>`;
    if (keyEl.dataset.k !== c.keys.join() + c.label) { keyEl.innerHTML = html; keyEl.dataset.k = c.keys.join() + c.label; }
    const pin = outBack(prog(t, c.a, c.a + 0.3));
    const down = prog(t, c.a + 0.22, c.a + 0.3) - prog(t, c.a + 0.34, c.a + 0.44);
    const pout = prog(t, c.b - 0.2, c.b);
    keyEl.style.opacity = String(clamp(pin * 2) * (1 - pout));
    keyEl.style.transform = `translateY(${(1 - pin) * 40}px)`;
    const capEl = keyEl.querySelector('.cap') as HTMLElement;
    capEl.style.transform = `translateY(${down * 6}px)`;
    capEl.style.boxShadow = `inset 0 ${-8 + down * 6}px 0 var(--rule), inset 0 0 0 2px var(--rule), 0 ${18 - down * 10}px 30px -18px rgb(0 0 0 / 0.55)`;
    keyEl.style.display = '';
  } else keyEl.style.display = 'none';

  // shelf slides up into the rig
  const sh = outExpo(prog(t, 21.0, 21.9)) * (1 - inOutCubic(prog(t, 28.5, 29.2)));
  shelf.style.opacity = String(sh);
  shelf.style.transform = `translateY(${(1 - sh) * 80}px)`;
  [...shelf.children].forEach((el, i) => {
    const on = el.classList.contains('on');
    (el.firstElementChild as HTMLElement).style.transform = `translateY(${on ? -10 : 0}px)`;
    void i;
  });

  // cursor
  let cx = -100, cy = -100, cvis = 0, click = 0;
  if (cursorPath.length) {
    const first = cursorPath[0][0], last = cursorPath[cursorPath.length - 1][0];
    cvis = prog(t, first - 0.4, first) * (1 - prog(t, last, last + 0.3));
    let a = cursorPath[0], b = cursorPath[0];
    for (let i = 0; i < cursorPath.length; i++) { if (cursorPath[i][0] <= t) a = cursorPath[i]; b = cursorPath[Math.min(i + 1, cursorPath.length - 1)]; if (cursorPath[i][0] > t) { b = cursorPath[i]; break; } }
    const pa = a[1](), pb = b[1]();
    const p = a === b ? 1 : inOutCubic(prog(t, a[0], b[0]));
    const px = lerp(pa.x, pb.x, p), py = lerp(pa.y, pb.y, p);
    cx = 960 - v.fx * v.s + px * v.s;
    cy = 540 - v.fy * v.s + py * v.s;
    const clickAt = cursorPath.find(([ct, , k]) => k === 1 && t >= ct && t < ct + 0.25);
    if (clickAt) click = Math.sin(prog(t, clickAt[0], clickAt[0] + 0.25) * Math.PI);
  }
  cursor.style.opacity = String(cvis);
  cursor.style.transform = `translate(${cx}px, ${cy}px) scale(${1 - click * 0.18})`;

  // sizes
  const sy = outExpo(prog(t, 34.4, 35.4));
  sizes.style.opacity = String(sy * (1 - s7o));
  const GAP = 56;
  let x = (1920 / SIZE_K - (SIZE_W.reduce((a, b) => a + b, 0) + 3 * GAP)) / 2;
  sizes.style.transform = `scale(${SIZE_K})`;
  sizes.style.transformOrigin = '0 0';
  sizeBoxes.forEach((b, i) => {
    const pi = outExpo(prog(t, 34.5 + i * 0.16, 35.4 + i * 0.16));
    const bh = b.offsetHeight;
    b.style.left = x + 'px';
    b.style.top = 720 / SIZE_K - bh / 2 + (1 - pi) * 120 + 'px';
    b.style.opacity = String(pi);
    x += SIZE_W[i] + 44;
  });
  sizes.style.display = t > 33.8 ? '' : 'none';
  void scenesHide;

  // end card
  const e = outExpo(prog(t, 38.9, 39.9));
  end.hidden = t < 38.8;
  end.style.opacity = String(e);
  end.style.transform = `translateY(${(1 - e) * 40}px)`;

  // theme swap: a pixel dissolve in the new page colour, then the swap, then out
  dctx.clearRect(0, 0, 1920, 1080);
  for (const [ts, name] of swaps) {
    const pi = prog(t, ts - 0.32, ts), po = prog(t, ts, ts + 0.32);
    if (pi <= 0 || po >= 1) continue;
    const col = name === 'classic' ? '#E2E0DA' : name === 'night' ? '#0F1016' : '#F4ECDF';
    dctx.fillStyle = col;
    const B = 60;
    for (let gy = 0; gy < 1080 / B; gy++) for (let gx = 0; gx < 1920 / B; gx++) {
      const h = ((gx * 73856093) ^ (gy * 19349663)) >>> 0;
      const r = (h % 1000) / 1000;
      const diag = (gx / 32 + gy / 18) / 2 * 0.5;
      const k = r * 0.5 + diag;
      if (pi < 1 ? k < pi : k >= po) dctx.fillRect(gx * B, gy * B, B, B);
    }
  }
}

/* ---------------------------------------------------------------- step: fire due events, drive media, step CSS animations */
async function seekTo(v: HTMLVideoElement, tt: number) {
  if (Math.abs(v.currentTime - tt) < 0.0005) return;
  await new Promise<void>((res) => {
    v.addEventListener('seeked', () => res(), { once: true });
    v.currentTime = tt;
  });
}
let lastT = -1;
async function frame(t: number) {
  while (fired < events.length && events[fired][0] <= t) events[fired++][1]();
  for (const [ts, name] of swaps) if (lastT < ts && t >= ts) setTheme(name);
  if (t >= 34.0 && lastT < 34.0) setTheme('night');
  // media: frozen at playbackRate 0; we place each frame ourselves
  if (playing && !vid.paused) {
    vt = Math.min(vt + 1 / FPS, (vid.duration || 999) - 0.05);
    await seekTo(vid, vt);
  } else vt = vid.currentTime;
  // CSS animations and transitions advance exactly one frame
  for (const a of document.getAnimations()) {
    if (a.playState === 'running') a.pause();
    a.currentTime = ((a.currentTime as number) ?? 0) + (lastT < 0 ? 0 : DT);
  }
  draw(t);
  lastT = t;
}

/* ---------------------------------------------------------------- setup */
async function ready(v: HTMLVideoElement) {
  if (v.readyState < 2) await new Promise((r) => v.addEventListener('loadeddata', r, { once: true }));
}
async function init() {
  await document.fonts.ready;
  await Promise.all([vid, ...sizeVids].map(ready));
  measure();
  score();
  events.sort((a, b) => a[0] - b[0]);
  // freeze playback: we place every frame
  // frozen (rate 0) only while playing; paused, the speed reads 1× as it should in the menu
  for (const v of [vid, ...sizeVids]) { v.addEventListener('play', () => { v.playbackRate = 0; }); v.addEventListener('playing', () => { v.playbackRate = 0; }); v.addEventListener('pause', () => { v.playbackRate = 1; }); }
  // the size players rest on a dot-matrix frame
  for (const v of sizeVids) { await v.play().catch(() => {}); await seekTo(v, 6.4); v.pause(); }
  return { P, parts };
}
(window as any).film = { init, frame, FPS };
