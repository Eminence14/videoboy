/*
 * VIDEOBOY dot-matrix screen. Copyright 2026 Victor Ibidunmoye. Apache-2.0.
 *
 * <vb-lcd> watches the media element and turns the picture into a four-tone
 * dot-matrix LCD whenever the player is not playing: before start, on pause,
 * at the end and on error. It also writes the screen's mode onto the skin's
 * container, so CSS (and the power LED) can follow it:
 *
 *   data-lcd="boot | start | play | pause | end | error"
 *   data-waiting      while the media is buffering
 *   --vb-aspect       the source's own aspect ratio
 *
 * The tones come from the theme's --vb-lcd-0 (darkest) to --vb-lcd-3
 * (lightest). Frames are auto-levelled, then ordered-dithered with a 4x4 Bayer
 * matrix, then drawn as square dots with a gap and a soft drop shadow, the way
 * a reflective LCD casts its pixels onto the backing.
 */

type Mode = 'boot' | 'start' | 'play' | 'pause' | 'end' | 'error';
type RGB = [number, number, number];

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

function parseColor(value: string, fallback: RGB): RGB {
  const v = value.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.replace(/./g, (c) => c + c);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const rgb = /rgba?\(([^)]+)\)/.exec(v);
  if (rgb) {
    const p = rgb[1].split(/[ ,/]+/).map(Number);
    if (p.length >= 3 && p.every((n) => !Number.isNaN(n))) return [p[0], p[1], p[2]];
  }
  return fallback;
}

/** The playable <video> behind a media host: itself, or the one inside a custom media element. */
export function resolveVideo(el: Element | null): HTMLVideoElement | null {
  if (!el) return null;
  if (el instanceof HTMLVideoElement) return el;
  const any = el as any;
  const t = any.target ?? any.nativeEl ?? any.media;
  if (t instanceof HTMLVideoElement) return t;
  return (el.shadowRoot?.querySelector('video') as HTMLVideoElement | null) ?? el.querySelector('video');
}

export class LcdElement extends HTMLElement {
  #host: HTMLElement | null = null;
  #media: Element | null = null;
  #video: HTMLVideoElement | null = null;
  #canvas = document.createElement('canvas');
  #ctx = this.#canvas.getContext('2d', { alpha: true })!;
  #src = document.createElement('canvas'); // captured frame, colour
  #srcCtx = this.#src.getContext('2d', { willReadFrequently: true })!;
  #grid = document.createElement('canvas'); // one pixel per LCD dot
  #gridCtx = this.#grid.getContext('2d', { willReadFrequently: true })!;
  #mode: Mode = 'boot';
  #started = false;
  #hasFrame = false;
  #tainted = false;
  #anim = 0;
  #noise = 0;
  #poll = 0;
  #bootTimer = 0;
  #posterPending = false;
  #ro = new ResizeObserver(() => this.#redraw());
  #mo = new MutationObserver(() => this.#redraw());
  #abort: AbortController | null = null;

  connectedCallback() {
    this.#host = this.closest('media-container') as HTMLElement | null;
    this.setAttribute('aria-hidden', 'true');
    this.#canvas.className = 'vb-lcd-canvas';
    if (!this.#canvas.isConnected) this.prepend(this.#canvas);
    this.#ro.observe(this);
    const skin = this.closest('videoboy-skin');
    if (skin) this.#mo.observe(skin, { attributes: true, attributeFilter: ['data-theme', 'style'] });
    this.#setMode('boot');
    // The boot logo drops for ~1.6 s; reduced motion skips straight to the start screen.
    this.#bootTimer = window.setTimeout(() => this.#host?.setAttribute('data-booted', ''), reduceMotion() ? 0 : 1700);
    this.#findMedia();
  }

  disconnectedCallback() {
    this.#ro.disconnect();
    this.#mo.disconnect();
    this.#abort?.abort();
    cancelAnimationFrame(this.#anim);
    clearInterval(this.#noise);
    clearInterval(this.#poll);
    clearTimeout(this.#bootTimer);
  }

  /* ---------------------------------------------------------------- media wiring */

  #findMedia() {
    const tryFind = () => {
      const host = this.#host;
      if (!host) return false;
      const media = host.querySelector(':scope > video, :scope > [playback-id], :scope > [src]:not(track)') ?? host.firstElementChild;
      const video = resolveVideo(media);
      if (!video) return false;
      if (video !== this.#video) this.#attach(media!, video);
      return true;
    };
    if (!tryFind()) {
      clearInterval(this.#poll);
      this.#poll = window.setInterval(() => tryFind() && clearInterval(this.#poll), 200);
    }
    // A source swap replaces the media element: watch the container for that.
    if (this.#host) {
      new MutationObserver(() => tryFind()).observe(this.#host, { childList: true });
    }
  }

  #attach(media: Element, video: HTMLVideoElement) {
    this.#abort?.abort();
    this.#abort = new AbortController();
    const { signal } = this.#abort;
    this.#media = media;
    this.#video = video;
    this.#started = !video.paused || video.currentTime > 0.05 && !this.#posterTime();
    this.#hasFrame = false;
    this.#tainted = false;
    const on = (ev: string, fn: () => void) => video.addEventListener(ev, fn, { signal });

    on('loadedmetadata', () => {
      if (video.videoWidth && video.videoHeight) {
        this.#host?.style.setProperty('--vb-aspect', `${video.videoWidth} / ${video.videoHeight}`);
      }
      const t = this.#posterTime();
      if (!this.#started && t != null && video.duration > t) {
        this.#posterPending = true;
        try {
          video.currentTime = t;
        } catch {}
      }
    });
    on('loadeddata', () => this.#captureAndDraw());
    on('seeked', () => this.#captureAndDraw());
    on('play', () => {
      if (!this.#started) {
        this.#started = true;
        // The start screen parked the media on its poster frame; play from the top.
        if (this.#posterPending) {
          this.#posterPending = false;
          try {
            video.currentTime = 0;
          } catch {}
        }
        this.dispatchEvent(new CustomEvent('vb-start', { bubbles: true, composed: true }));
      }
      this.#setMode('play');
    });
    on('playing', () => {
      this.#host?.removeAttribute('data-waiting');
      this.#setMode('play');
    });
    on('pause', () => {
      if (video.ended) return;
      if (this.#started) {
        this.#capture();
        this.#setMode('pause');
      }
    });
    on('ended', () => {
      this.#capture();
      this.#setMode('end');
    });
    on('waiting', () => this.#host?.setAttribute('data-waiting', ''));
    on('stalled', () => !video.paused && this.#host?.setAttribute('data-waiting', ''));
    on('canplay', () => this.#host?.removeAttribute('data-waiting'));
    on('error', () => this.#setMode('error'));
    on('emptied', () => {
      this.#started = false;
      this.#hasFrame = false;
      this.#setMode('start');
    });

    if (video.error) this.#setMode('error');
    else if (video.ended) this.#setMode('end');
    else if (this.#started && video.paused) this.#setMode('pause');
    else if (this.#started) this.#setMode('play');
    else this.#setMode('start');
    if (video.readyState >= 2) this.#captureAndDraw();
    if (video.readyState >= 1 && video.videoWidth) {
      this.#host?.style.setProperty('--vb-aspect', `${video.videoWidth} / ${video.videoHeight}`);
    }
  }

  #posterTime(): number | null {
    const skin = this.closest('videoboy-skin');
    const v = skin?.getAttribute('poster-time');
    const n = v == null ? NaN : Number(v);
    return Number.isFinite(n) ? n : null;
  }

  /* ---------------------------------------------------------------- mode */

  #setMode(next: Mode) {
    if (next === 'start' && this.#started) next = this.#video?.paused ? 'pause' : 'play';
    const prev = this.#mode;
    if (prev === next && next !== 'boot') return;
    this.#mode = next;
    const host = this.#host;
    host?.setAttribute('data-lcd', next === 'boot' ? 'start' : next);
    this.setAttribute('data-mode', next);
    clearInterval(this.#noise);
    if (next === 'error') {
      this.#startNoise();
      return;
    }
    const showing = next !== 'play';
    if (showing) {
      if (prev === 'play' && next !== 'boot') this.#transition('in');
      else this.#redraw();
    } else {
      this.#transition('out');
    }
  }

  /* ---------------------------------------------------------------- capture */

  #capture(): boolean {
    const v = this.#video;
    if (!v || v.readyState < 2 || !v.videoWidth) return false;
    const w = 320;
    const h = Math.max(1, Math.round((w * v.videoHeight) / v.videoWidth));
    this.#src.width = w;
    this.#src.height = h;
    try {
      this.#srcCtx.drawImage(v, 0, 0, w, h);
      this.#srcCtx.getImageData(0, 0, 1, 1); // throws when the frame is cross-origin
      this.#tainted = false;
      this.#hasFrame = true;
      this.removeAttribute('data-fallback');
    } catch {
      this.#tainted = true;
      this.#hasFrame = false;
      this.setAttribute('data-fallback', '');
    }
    return this.#hasFrame;
  }

  #captureAndDraw(tries = 6) {
    if (this.#mode === 'play' || this.#mode === 'error') return;
    const v = this.#video;
    const run = () => {
      if (this.#mode === 'play' || this.#mode === 'error') return;
      this.#capture();
      // Streams can report a seek before the new frame is decoded; a near-black read is retried.
      if (this.#hasFrame && tries > 0 && this.#isBlank()) {
        window.setTimeout(() => this.#captureAndDraw(tries - 1), 250);
      }
      cancelAnimationFrame(this.#anim);
      this.#anim = 0;
      this.#redraw();
    };
    const rvfc = (v as any)?.requestVideoFrameCallback;
    if (v && typeof rvfc === 'function' && !v.paused) rvfc.call(v, run);
    else if (v && typeof rvfc === 'function') {
      let done = false;
      rvfc.call(v, () => { done = true; run(); });
      window.setTimeout(() => !done && run(), 120);
    } else run();
  }

  #isBlank() {
    try {
      const d = this.#srcCtx.getImageData(0, 0, this.#src.width, this.#src.height).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 64) s += d[i] + d[i + 1] + d[i + 2];
      return s / (d.length / 64) / 3 < 6;
    } catch {
      return false;
    }
  }

  /* ---------------------------------------------------------------- drawing */

  #tones(): RGB[] {
    const cs = getComputedStyle(this);
    const fb: RGB[] = [
      [42, 18, 6],
      [122, 52, 16],
      [217, 102, 31],
      [255, 216, 168],
    ];
    return [0, 1, 2, 3].map((i) => parseColor(cs.getPropertyValue(`--vb-lcd-${i}`), fb[i]));
  }

  #size() {
    const r = this.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    if (this.#canvas.width !== w || this.#canvas.height !== h) {
      this.#canvas.width = w;
      this.#canvas.height = h;
      // Exact CSS size, so one canvas pixel is one device pixel and no dot column doubles up.
      this.#canvas.style.width = `${w / dpr}px`;
      this.#canvas.style.height = `${h / dpr}px`;
    }
    // About 160 dots across, like the handheld this is named after; never under 3 CSS px.
    const cell = Math.max(3, Math.min(8, Math.round(r.width / 160))) * dpr;
    return { w, h, dpr, cell };
  }

  #redraw() {
    if (this.#mode === 'play' && !this.#anim) return;
    if (this.#mode === 'error') return this.#drawNoise();
    if (this.#anim) return;
    this.#drawDots(1);
  }

  /** Sample the captured frame onto a grid of one pixel per dot, auto-levelled. */
  #sampleGrid(cols: number, rows: number): Uint8ClampedArray | null {
    if (!this.#hasFrame) return null;
    this.#grid.width = cols;
    this.#grid.height = rows;
    const g = this.#gridCtx;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    // Contain-fit, as the video itself is drawn; letterbox dots stay unlit.
    const sw = this.#src.width, sh = this.#src.height;
    const s = Math.min(cols / sw, rows / sh);
    const dw = sw * s, dh = sh * s;
    g.clearRect(0, 0, cols, rows);
    g.drawImage(this.#src, (cols - dw) / 2, (rows - dh) / 2, dw, dh);
    return g.getImageData(0, 0, cols, rows).data;
  }

  /** @param amount 0..1: how much of the screen is lit (the stepped fade on boot and play). */
  #drawDots(amount: number) {
    const { w, h, cell } = this.#size();
    const ctx = this.#ctx;
    const tones = this.#tones();
    const cols = Math.ceil(w / cell);
    const rows = Math.ceil(h / cell);
    const ox = Math.round((w - cols * cell) / 2);
    const oy = Math.round((h - rows * cell) / 2);
    const gap = Math.max(1, Math.round(cell * 0.12));
    const bg = tones[3];
    const substrate = `rgb(${Math.round(bg[0] * 0.94 + tones[2][0] * 0.06)},${Math.round(bg[1] * 0.94 + tones[2][1] * 0.06)},${Math.round(bg[2] * 0.94 + tones[2][2] * 0.06)})`;
    ctx.clearRect(0, 0, w, h);

    const data = this.#sampleGrid(cols, rows);
    const level = new Uint8Array(cols * rows).fill(3);
    // 255 marks a dot outside the picture (letterbox): it is not drawn at all.
    let x0 = 0, y0 = 0, x1 = cols, y1 = rows;
    if (data) {
      x0 = cols; y0 = rows; x1 = 0; y1 = 0;
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        if (data[(y * cols + x) * 4 + 3] > 200) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x + 1 > x1) x1 = x + 1; if (y + 1 > y1) y1 = y + 1; }
        else level[y * cols + x] = 255;
      }
      if (x1 <= x0) { x0 = 0; y0 = 0; x1 = cols; y1 = rows; level.fill(3); }
    }
    ctx.fillStyle = substrate;
    ctx.fillRect(ox + x0 * cell, oy + y0 * cell, (x1 - x0) * cell, (y1 - y0) * cell);
    if (data) {
      // Auto-levels: stretch the 2nd to 98th percentile of luminance across the four tones.
      const lum = new Float32Array(cols * rows);
      const hist = new Uint32Array(256);
      let n = 0;
      for (let i = 0, p = 0; i < lum.length; i++, p += 4) {
        if (level[i] === 255) continue;
        const l = 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2];
        lum[i] = l;
        hist[l | 0]++;
        n++;
      }
      const lo = percentile(hist, n, 0.02);
      const hi = Math.max(lo + 24, percentile(hist, n, 0.98));
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          if (level[i] === 255) continue;
          let v = (lum[i] - lo) / (hi - lo);
          v = Math.pow(Math.min(1, Math.max(0, v)), 0.9);
          const t = Math.round(v * 3 + BAYER[(y & 3) * 4 + (x & 3)] * 0.85);
          level[i] = Math.max(0, Math.min(3, t));
        }
      }
    }
    // Stepped reveal: lighter tones only, as the handheld fades its screen in.
    const floor = amount >= 1 ? 0 : Math.round((1 - amount) * 3);

    const dot = cell - gap;
    const sh = Math.max(1, Math.round(cell * 0.12));
    // Shadows first, then the dots, batched by tone.
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.beginPath();
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const l0 = level[y * cols + x];
        if (l0 === 255) continue;
        const l = Math.max(l0, floor);
        if (l < 3) ctx.rect(ox + x * cell + sh, oy + y * cell + sh, dot, dot);
      }
    }
    ctx.fill();
    for (let tone = 0; tone < 4; tone++) {
      const [r, g, b] = tones[tone];
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.beginPath();
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const l0 = level[y * cols + x];
          if (l0 !== 255 && Math.max(l0, floor) === tone) ctx.rect(ox + x * cell, oy + y * cell, dot, dot);
        }
      }
      ctx.fill();
    }
  }

  /** Colour mosaic, from the captured frame, at a given block size in device px. */
  #drawMosaic(block: number) {
    const { w, h } = this.#size();
    const ctx = this.#ctx;
    if (!this.#hasFrame) return;
    const cols = Math.max(1, Math.ceil(w / block));
    const rows = Math.max(1, Math.ceil(h / block));
    this.#sampleGrid(cols, rows);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.#grid, 0, 0, cols, rows, 0, 0, cols * block, rows * block);
  }

  #transition(dir: 'in' | 'out') {
    cancelAnimationFrame(this.#anim);
    this.#anim = 0;
    const host = this.#host;
    if (reduceMotion() || !this.#hasFrame) {
      this.removeAttribute('data-anim');
      if (dir === 'in') this.#drawDots(1);
      return;
    }
    const { cell } = this.#size();
    const dur = dir === 'in' ? 520 : 300;
    const t0 = performance.now();
    this.setAttribute('data-anim', dir);
    host?.setAttribute('data-lcd-anim', dir);
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      if (dir === 'in') {
        // Colour pixelates up to dot size, then the panel snaps to four tones.
        if (p < 0.55) this.#drawMosaic(Math.max(1, Math.round(1 + (cell - 1) * ease(p / 0.55))));
        else this.#drawDots(1);
      } else {
        // Tones release to colour blocks, which shrink back into the picture.
        if (p < 0.3) this.#drawDots(1);
        else this.#drawMosaic(Math.max(1, Math.round(cell - (cell - 1) * ease((p - 0.3) / 0.7))));
        this.style.setProperty('--vb-lcd-out', String(p < 0.3 ? 1 : 1 - ease((p - 0.3) / 0.7)));
      }
      if (p < 1) this.#anim = requestAnimationFrame(step);
      else {
        this.#anim = 0;
        this.removeAttribute('data-anim');
        host?.removeAttribute('data-lcd-anim');
        this.style.removeProperty('--vb-lcd-out');
      }
    };
    this.#anim = requestAnimationFrame(step);
  }

  /* ---------------------------------------------------------------- error static */

  #startNoise() {
    this.#drawNoise();
    if (!reduceMotion()) this.#noise = window.setInterval(() => this.#drawNoise(), 110);
  }

  #drawNoise() {
    const { w, h, cell } = this.#size();
    const ctx = this.#ctx;
    const tones = this.#tones();
    const c = cell * 2;
    const gap = Math.max(1, Math.round(c * 0.12));
    ctx.fillStyle = `rgb(${tones[3].join(',')})`;
    ctx.fillRect(0, 0, w, h);
    for (let tone = 0; tone < 3; tone++) {
      ctx.fillStyle = `rgb(${tones[tone].join(',')})`;
      ctx.beginPath();
      for (let y = 0; y < h; y += c) for (let x = 0; x < w; x += c) if (Math.random() < 0.18 - tone * 0.04) ctx.rect(x, y, c - gap, c - gap);
      ctx.fill();
    }
  }
}

function percentile(hist: Uint32Array, total: number, q: number) {
  const target = total * q;
  let acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= target) return i;
  }
  return 255;
}

if (!customElements.get('vb-lcd')) customElements.define('vb-lcd', LcdElement);
