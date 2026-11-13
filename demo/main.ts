import '../src/skin';
import '../src/videoboy.css';
import '@videojs/html/media/mux-video';
import './page.css';

/** Set VITE_MUX_PLAYBACK_ID to stream from Mux; ?local (or no ID) plays the bundled clip instead. */
const MUX_ID = (import.meta.env.VITE_MUX_PLAYBACK_ID as string | undefined)?.trim();
const params = new URLSearchParams(location.search);
const local = params.has('local') || !MUX_ID;

/* ---------------------------------------------------------------- hero player */
const skin = document.getElementById('skin')!;
function heroMedia() {
  if (!local && MUX_ID) {
    const m = document.createElement('mux-video');
    m.setAttribute('playback-id', MUX_ID);
    m.setAttribute('playsinline', '');
    m.setAttribute('crossorigin', 'anonymous');
    m.setAttribute('preload', 'auto');
    m.innerHTML = '<track kind="subtitles" src="/media/tos-en.vtt" srclang="en" label="English" default>';
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

document.querySelectorAll<HTMLInputElement>('input[name="hero-theme"]').forEach((i) =>
  i.addEventListener('change', () => {
    if (!i.checked) return;
    if (i.value === 'tangerine') delete skin.dataset.theme;
    else skin.dataset.theme = i.value;
  })
);

/* ---------------------------------------------------------------- gallery, captured from the real player */
const STATES: [string, string, string][] = [
  ['01-boot', 'Boot', 'The logo drops down an empty panel in fourteen steps.'],
  ['02-start', 'Start', 'The poster frame in dot-matrix, under a Press Start menu.'],
  ['03-playing', 'Playing', 'Full colour. Only captions sit on the picture.'],
  ['04-scrub', 'Scrub', 'Hovering the strip shows the time, and a dot-matrix thumbnail on Mux.'],
  ['05-volume', 'Volume', 'A plate counts the six grille slots; the grille dims with it.'],
  ['06-muted', 'Muted', 'B shows the muted speaker; every grille slot goes dark.'],
  ['07-tooltip', 'Tooltip', 'Each key names itself and its shortcut after a short hover.'],
  ['08-focus', 'Focus', 'A 3 px ring, offset from the key, for keyboard users.'],
  ['09-paused', 'Paused', 'The frame snaps to four tones under a Pause window.'],
  ['10-buffering', 'Buffering', 'Three stepping dots, and the power LED blinks.'],
  ['11-ended', 'The end', 'The last frame in dot-matrix; A or a tap plays again.'],
  ['12-captions-off', 'Captions off', 'The CC key goes back to grey.'],
  ['13-fullscreen', 'Fullscreen', 'The handheld steps away; the console floats over the film.'],
  ['14-fullscreen-idle', 'Fullscreen idle', 'After two seconds only an outlined progress line stays.'],
  ['15-error', 'Error', 'Static on the panel, and a window that says what went wrong.'],
];
const gallery = document.getElementById('gallery');
if (gallery) {
  gallery.innerHTML = STATES.map(
    ([id, name, text], i) => `<li><figure><button type="button" class="shot" data-full="/states/tangerine-720-${id}.webp" aria-label="Enlarge: ${name}"><img src="/states/tangerine-720-${id}.webp" alt="" loading="lazy" decoding="async"></button><figcaption><span class="idx">${String(i + 1).padStart(2, '0')}</span><b>${name}</b> ${text}</figcaption></figure></li>`
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
  ['1100', 'L · 900 px and up', 'One row. Bezel with stripes, the Power and Dot Matrix labels.'],
  ['640', 'M · 460 to 699 px', 'The seek strip moves to its own row above the keys.'],
  ['420', 'S · 300 to 459 px', 'The grille steps out; volume moves to the D-pad and B.'],
  ['280', 'XS · under 300 px', 'Duration and key labels drop; every key stays full size.'],
];
const sizes = document.getElementById('sizes-list');
if (sizes) {
  sizes.innerHTML = SIZES.map(
    ([w, name, text]) => `<li style="--w:${w}"><figure><img src="/states/size-${w}.webp" alt="VIDEOBOY at ${w} pixels wide" loading="lazy" decoding="async"><figcaption><b>${name}</b> ${text}</figcaption></figure></li>`
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
document.getElementById('accent-reset')!.addEventListener('click', () => {
  accentSet = false;
  applyLab();
});
applyLab();
