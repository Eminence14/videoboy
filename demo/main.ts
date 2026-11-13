import '../src/skin';
import '../src/videoboy.css';
import '@videojs/html/media/mux-video';
import './page.css';

/** Set VITE_MUX_PLAYBACK_ID to stream from Mux; ?local (or no ID) plays the bundled clip instead. */
const MUX_ID = (import.meta.env.VITE_MUX_PLAYBACK_ID as string | undefined)?.trim();
/** The two-minute cut: Tears of Steel 4:50 to 6:50, clipped by Mux from the same asset and playback ID. */
const CLIP = { start: 290, end: 410, poster: 300 };
const params = new URLSearchParams(location.search);
const local = params.has('local') || !MUX_ID;

/* ---------------------------------------------------------------- hero player */
const skin = document.getElementById('skin')!;
function heroMedia() {
  if (!local && MUX_ID) {
    const m = document.createElement('mux-video');
    // <mux-video> reads a Mux stream URL; the playback ID is taken from it.
    m.setAttribute('src', `https://stream.mux.com/${MUX_ID}.m3u8?asset_start_time=${CLIP.start}&asset_end_time=${CLIP.end}`);
    m.setAttribute('playsinline', '');
    m.setAttribute('crossorigin', 'anonymous');
    m.setAttribute('preload', 'auto');
    // The start screen draws Mux's own thumbnail, so the stream loads from 0:00 only once.
    skin.setAttribute('poster', `https://image.mux.com/${MUX_ID}/thumbnail.webp?time=${CLIP.poster}&width=960`);
    m.innerHTML = '<track kind="subtitles" src="/media/tos-clip-en.vtt" srclang="en" label="English" default>';
    return m;
  }
  skin.setAttribute('poster-time', '12');
  const v = document.createElement('video');
  v.src = '/media/night.mp4';
  v.playsInline = true;
  v.preload = 'auto';
  v.crossOrigin = 'anonymous';
  v.innerHTML = '<track kind="captions" src="/media/captions.vtt" srclang="en" label="English" default>';
  return v;
}
skin.prepend(heroMedia());

/* ---------------------------------------------------------------- theme: the hero player and the whole page change together */
type Theme = 'tangerine' | 'classic' | 'night';
const THEME_KEY = 'videoboy.theme';
const PAGE_BG: Record<Theme, string> = { tangerine: '#F4ECDF', classic: '#E2E0DA', night: '#0F1016' };
const savedTheme = (): Theme => {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === 'classic' || t === 'night') return t;
  } catch {}
  return 'tangerine';
};
let theme: Theme = savedTheme();
function setTheme(t: Theme, opts: { fade?: boolean; save?: boolean } = {}) {
  theme = t;
  const root = document.documentElement;
  if (opts.fade) {
    root.classList.add('theme-fade');
    clearTimeout((setTheme as any).t);
    (setTheme as any).t = setTimeout(() => root.classList.remove('theme-fade'), 500);
  }
  if (t === 'tangerine') { delete root.dataset.pageTheme; delete skin.dataset.theme; }
  else { root.dataset.pageTheme = t; skin.dataset.theme = t; }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', PAGE_BG[t]);
  for (const i of document.querySelectorAll<HTMLInputElement>('input[name="hero-theme"], input[name="page-theme"]')) i.checked = i.value === t;
  // Screenshots follow the theme too: each state was captured from the player in all three.
  for (const img of document.querySelectorAll<HTMLImageElement>('img[data-themed]')) img.src = img.dataset.themed!.replace('{t}', t);
  for (const b of document.querySelectorAll<HTMLButtonElement>('button[data-themed]')) b.dataset.full = b.dataset.themed!.replace('{t}', t);
  const it = document.getElementById('install-theme');
  if (it) it.textContent = t;
  if (opts.save) try { localStorage.setItem(THEME_KEY, t); } catch {}
  // The playground starts from the page's theme; its own radios can still pick another.
  const lab = document.querySelector<HTMLInputElement>(`input[name="theme"][value="${t}"]`);
  if (lab && !lab.checked) { lab.checked = true; lab.dispatchEvent(new Event('input', { bubbles: true })); }
}
document.addEventListener('change', (e) => {
  const i = e.target as HTMLInputElement;
  if ((i.name === 'hero-theme' || i.name === 'page-theme') && i.checked) setTheme(i.value as Theme, { fade: true, save: true });
});

/* ---------------------------------------------------------------- gallery, captured from the real player */
const STATES: [string, string, string][] = [
  ['01-boot', 'Boot', 'The logo drops in on load'],
  ['02-start', 'Start', 'Before first play'],
  ['03-playing', 'Playing', ''],
  ['04-scrub', 'Seeking', 'With a preview frame'],
  ['05-volume', 'Volume', ''],
  ['06-muted', 'Muted', ''],
  ['07-tooltip', 'Tooltip', 'Name and shortcut'],
  ['08-focus', 'Keyboard focus', ''],
  ['09-paused', 'Paused', ''],
  ['10-buffering', 'Buffering', ''],
  ['11-ended', 'Ended', ''],
  ['12-menu', 'Menu', ''],
  ['13-fullscreen', 'Fullscreen', ''],
  ['14-fullscreen-idle', 'Fullscreen, idle', 'Controls step away after 2 s'],
  ['15-error', 'Error', ''],
];
const gallery = document.getElementById('gallery');
if (gallery) {
  gallery.innerHTML = STATES.map(
    ([id, name, text], i) => `<li><figure><button type="button" class="shot" data-themed="/states/{t}-720-${id}.webp" data-full="/states/${theme}-720-${id}.webp" aria-label="Enlarge: ${name}"><img data-themed="/states/{t}-720-${id}.webp" src="/states/${theme}-720-${id}.webp" alt="" loading="lazy" decoding="async"></button><figcaption><span class="idx">${String(i + 1).padStart(2, '0')}</span><b>${name}</b>${text ? ` ${text}` : ''}</figcaption></figure></li>`
  ).join('');
}

/* Lightbox: a native dialog, so focus and Escape behave. */
const dlg = document.createElement('dialog');
dlg.className = 'lightbox';
dlg.innerHTML = '<form method="dialog"><button class="lb-close" aria-label="Close">Close</button></form><img alt="">';
document.body.append(dlg);
document.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.shot');
  if (!b) return;
  const img = dlg.querySelector('img')!;
  img.src = b.dataset.full!;
  img.alt = b.getAttribute('aria-label')!.replace('Enlarge: ', '') + ' state, enlarged';
  dlg.showModal();
});
dlg.addEventListener('click', (e) => e.target === dlg && dlg.close());

/* ---------------------------------------------------------------- sizes */
const SIZES: [string, string, string][] = [
  ['1100', 'Wide · 900 px and up', 'Everything on one row.'],
  ['640', 'Medium · 460 to 699 px', 'The seek strip moves above the keys.'],
  ['420', 'Small · 300 to 459 px', 'The grille steps out; the D-pad still sets the volume.'],
  ['280', 'Extra small · under 300 px', 'The duration and key labels drop; the keys keep their size.'],
];
const sizes = document.getElementById('sizes-list');
if (sizes) {
  sizes.innerHTML = SIZES.map(
    ([w, name, text]) => `<li style="--w:${w}"><figure><img data-themed="/states/{t}-size-${w}.webp" src="/states/${theme}-size-${w}.webp" alt="VIDEOBOY at ${w} pixels wide" loading="lazy" decoding="async"><figcaption><b>${name}</b> ${text}</figcaption></figure></li>`
  ).join('');
}

/* ---------------------------------------------------------------- anatomy pins */
fetch('/states/anatomy.json')
  .then((r) => (r.ok ? r.json() : null))
  .then((pins: { x: number; y: number }[] | null) => {
    const ol = document.getElementById('pins');
    if (!pins || !ol) return;
    ol.innerHTML = pins.map((p, i) => `<li style="left:${p.x}%;top:${p.y}%">${i + 1}</li>`).join('');
  })
  .catch(() => {});

/* ---------------------------------------------------------------- playground */
const labSkin = document.getElementById('lab-skin')!;
const stage = document.getElementById('lab-stage')!;
const frame = document.getElementById('lab-frame')!;
const code = document.getElementById('lab-code')!;
const accent = document.getElementById('accent') as HTMLInputElement;
const corner = document.getElementById('corner') as HTMLInputElement;
const width = document.getElementById('width') as HTMLInputElement;
const DEFAULT_ACCENT: Record<string, string> = { tangerine: '#f26a1b', classic: '#a3184f', night: '#4fc8f5' };
let accentSet = false;

function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}
function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function applyLab() {
  const theme = (document.querySelector<HTMLInputElement>('input[name="theme"]:checked')?.value ?? 'tangerine');
  const site = document.querySelector<HTMLInputElement>('input[name="site"]:checked')?.value ?? 'paper';
  if (theme === 'tangerine') delete labSkin.dataset.theme;
  else labSkin.dataset.theme = theme;
  stage.dataset.site = site;
  if (!accentSet) accent.value = DEFAULT_ACCENT[theme];
  const a = accent.value;
  const lines: string[] = [];
  const props: Record<string, string> = {};
  if (accentSet) {
    // Icons on the keys stay readable: dark ink on light accents, light ink on dark ones.
    const ink = luminance(a) > 0.28 ? '#1a0e06' : '#fff6ef';
    Object.assign(props, {
      '--vb-accent': a,
      '--vb-accent-lo': shade(a, -0.22),
      '--vb-key': a,
      '--vb-key-hi': shade(a, 0.3),
      '--vb-key-lo': shade(a, -0.32),
      '--vb-key-ink': ink,
      '--vb-led': shade(a, 0.12),
      '--vb-stripe-a': a,
    });
  }
  props['--vb-radius-corner'] = `${corner.value}px`;
  for (const k of ['--vb-accent', '--vb-accent-lo', '--vb-key', '--vb-key-hi', '--vb-key-lo', '--vb-key-ink', '--vb-led', '--vb-stripe-a', '--vb-radius-corner']) labSkin.style.removeProperty(k);
  for (const [k, v] of Object.entries(props)) {
    labSkin.style.setProperty(k, v);
    lines.push(`  ${k}: ${v};`);
  }
  frame.style.maxWidth = `${width.value}px`;
  document.getElementById('corner-out')!.textContent = `${corner.value}px`;
  document.getElementById('width-out')!.textContent = `${width.value}px`;
  code.textContent = `<videoboy-skin${theme === 'tangerine' ? '' : ` data-theme="${theme}"`}>\n\nvideoboy-skin {\n${lines.join('\n')}\n}`;
}
document.getElementById('lab-form')!.addEventListener('input', (e) => {
  if (e.target === accent) accentSet = true;
  if ((e.target as HTMLInputElement).name === 'theme') {
    accentSet = false;
  }
  applyLab();
});
// Reset all: every playground setting back to its start, with the theme following the page.
document.getElementById('lab-reset')!.addEventListener('click', () => {
  for (const i of document.querySelectorAll<HTMLInputElement>('#lab-form input[type="radio"]'))
    i.checked = i.name === 'site' ? i.value === 'paper' : i.name === 'theme' ? i.value === theme : i.checked;
  corner.value = corner.defaultValue;
  width.value = width.defaultValue;
  accentSet = false;
  applyLab();
});
applyLab();

// Apply the saved theme once the gallery and sizes are in place.
setTheme(theme);
