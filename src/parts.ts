/*
 * VIDEOBOY custom parts. Copyright 2026 Victor Ibidunmoye. Apache-2.0.
 * Each part reads player state through PlayerController, as Video.js's
 * "Build your own UI component" guide describes.
 */
import {
  UIElement,
  PlayerController,
  playerContext,
  selectTime,
  selectVolume,
  selectBuffer,
  selectTextTrack,
  selectTextCues,
  type PropertyValues,
} from '@videojs/html';
import { icon } from './icons';

const SEEK_STEP = 5;
const VOL_STEP = 1 / 6; // one grille slot

/* ------------------------------------------------------------------ D-pad
 * One tab stop (roving tabindex across four arm buttons). Arrow keys move
 * focus to that arm and run it; Enter/Space and pointer presses run the
 * focused or pressed arm, and holding repeats. Left/right seek 5 s, up/down
 * change volume by one grille slot.
 */
type Dir = 'up' | 'down' | 'left' | 'right';
const ARMS: Record<Dir, { label: string; token: string }> = {
  up: { token: 'videoboy.volumeUp', label: 'Volume up' },
  left: { token: 'videoboy.seekBack', label: 'Seek back 5 seconds' },
  right: { token: 'videoboy.seekForward', label: 'Seek forward 5 seconds' },
  down: { token: 'videoboy.volumeDown', label: 'Volume down' },
};
const KEYMAP: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

class DpadElement extends UIElement {
  readonly #time = new PlayerController(this, playerContext, selectTime);
  readonly #volume = new PlayerController(this, playerContext, selectVolume);
  #abort: AbortController | null = null;
  #repeat: ReturnType<typeof setTimeout> | null = null;
  #flashTimer: ReturnType<typeof setTimeout> | null = null;
  #current: Dir = 'right';

  override connectedCallback() {
    super.connectedCallback();
    if (!this.querySelector('.vb-arm')) this.#render();
    this.#abort?.abort();
    this.#abort = new AbortController();
    const { signal } = this.#abort;
    this.addEventListener('keydown', this.#onKey, { signal });
    this.addEventListener('pointerdown', this.#onPointerDown, { signal });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture'] as const) {
      this.addEventListener(ev, this.#stop, { signal });
    }
  }
  override disconnectedCallback() {
    super.disconnectedCallback();
    this.#abort?.abort();
    this.#abort = null;
    this.#stop();
    if (this.#flashTimer) clearTimeout(this.#flashTimer);
    this.#flashTimer = null;
  }
  #render() {
    this.setAttribute('role', 'group');
    this.setAttribute('aria-label', 'D-pad');
    const arms = (Object.keys(ARMS) as Dir[])
      .map(
        (d) =>
          `<button type="button" class="vb-arm vb-arm-${d}" data-dir="${d}" tabindex="${d === this.#current ? 0 : -1}" aria-label="${ARMS[d].label}" aria-keyshortcuts="Arrow${d[0].toUpperCase() + d.slice(1)}"></button>`
      )
      .join('');
    // Drawn in CSS from theme tokens: a well, a cross with four arms, a dimple.
    this.innerHTML = `<span class="vb-dpad-well" aria-hidden="true"></span><span class="vb-dpad-cross" aria-hidden="true"><i class="vb-dpad-dimple"></i></span>${arms}`;
  }
  #run(dir: Dir) {
    const time = this.#time.value;
    const vol = this.#volume.value;
    if ((dir === 'left' || dir === 'right') && time) {
      const t = Math.max(0, Math.min(time.duration || Infinity, time.currentTime + (dir === 'left' ? -SEEK_STEP : SEEK_STEP)));
      time.seek(t);
    } else if (vol && vol.volumeAvailability === 'available') {
      const base = vol.muted ? 0 : vol.volume;
      const next = Math.max(0, Math.min(1, Math.round((base + (dir === 'up' ? VOL_STEP : -VOL_STEP)) / VOL_STEP) * VOL_STEP));
      vol.setVolume(next);
      if (vol.muted && next > 0) vol.setMuted(false);
    }
    this.#flash(dir);
  }
  #flash(dir: Dir) {
    this.setAttribute('data-pressed', dir);
    if (this.#flashTimer) clearTimeout(this.#flashTimer);
    this.#flashTimer = setTimeout(() => {
      this.#flashTimer = null;
      if (!this.#repeat) this.removeAttribute('data-pressed');
    }, 140);
  }
  /** Which arm a pointer press means: the 90° wedge it falls in, measured from the centre. */
  #dirAt(e: PointerEvent): Dir | null {
    const r = this.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    if (Math.hypot(dx, dy) < r.width * 0.09) return null; // the centre dimple does nothing
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
  }
  #focusArm(dir: Dir) {
    this.#current = dir;
    this.querySelectorAll<HTMLButtonElement>('.vb-arm').forEach((b) => (b.tabIndex = b.dataset.dir === dir ? 0 : -1));
    this.querySelector<HTMLButtonElement>(`.vb-arm-${dir}`)?.focus();
  }
  #onKey = (e: KeyboardEvent) => {
    const dir = KEYMAP[e.key];
    if (dir) {
      // Handled here, so the container's arrow hotkeys must not run it twice.
      e.preventDefault();
      e.stopPropagation();
      this.#focusArm(dir);
      this.#run(dir);
    } else if (e.key === 'Enter' || e.key === ' ') {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('.vb-arm');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat || e.key === 'Enter') this.#run(btn.dataset.dir as Dir);
    }
  };
  #onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const dir = this.#dirAt(e);
    if (!dir) return;
    e.preventDefault();
    this.setPointerCapture?.(e.pointerId);
    this.#current = dir;
    this.querySelectorAll<HTMLButtonElement>('.vb-arm').forEach((b) => (b.tabIndex = b.dataset.dir === dir ? 0 : -1));
    this.#run(dir);
    this.setAttribute('data-pressed', dir);
    const loop = (delay: number) => {
      this.#repeat = setTimeout(() => {
        this.#run(dir);
        this.setAttribute('data-pressed', dir);
        loop(160);
      }, delay);
    };
    loop(420);
  };
  #stop = () => {
    if (this.#repeat) clearTimeout(this.#repeat);
    this.#repeat = null;
    this.removeAttribute('data-pressed');
  };
}

/* ------------------------------------------------------------------ Captions
 * Draws the active caption cues on dark plates above the console base.
 * The browser's own cue rendering is hidden in CSS, because it cannot be
 * moved clear of the controls.
 */
class CaptionsElement extends UIElement {
  readonly #tracks = new PlayerController(this, playerContext, selectTextTrack);
  readonly #cues = new PlayerController(this, playerContext, selectTextCues);
  #unwatch: (() => void) | null = null;
  #last = '';

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.#unwatch?.();
    this.#unwatch = null;
  }
  protected override update(changed: PropertyValues) {
    super.update(changed);
    const cues = this.#cues.value;
    const tracks = this.#tracks.value;
    if (cues && !this.#unwatch) this.#unwatch = cues.watchTextCues({ kind: ['captions', 'subtitles'] });
    const showing = !!tracks?.subtitlesShowing;
    const lines: string[] = [];
    if (showing && cues) {
      for (const tc of cues.textCues) {
        if ((tc.track.kind === 'captions' || tc.track.kind === 'subtitles') && tc.track.mode === 'showing') {
          for (const cue of tc.activeCues) lines.push(...String(cue.text ?? '').split(/\n/));
        }
      }
    }
    const html = lines
      .filter(Boolean)
      .map((l) => `<span class="vb-cue">${l.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)}</span>`)
      .join('');
    if (html !== this.#last) {
      this.#last = html;
      this.innerHTML = html;
    }
    this.toggleAttribute('data-visible', !!html);
  }
}

/* ------------------------------------------------------------------ On-screen volume plate
 * Shows VOL with the LED level, or MUTED, for 1.5 s after any volume or mute change,
 * from any source: B, the LEDs, the D-pad, hotkeys. The status announcer reports
 * the same change to screen readers, so this plate stays aria-hidden.
 */
class OsdElement extends UIElement {
  readonly #volume = new PlayerController(this, playerContext, selectVolume);
  #prev: string | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;

  override disconnectedCallback() {
    super.disconnectedCallback();
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
  }

  protected override update(changed: PropertyValues) {
    super.update(changed);
    const v = this.#volume.value;
    if (!v) return;
    const key = `${v.muted}|${Math.round(v.volume * 100)}`;
    if (this.#prev === null) {
      this.#prev = key;
      return;
    }
    if (key === this.#prev) return;
    this.#prev = key;
    const level = v.muted ? 0 : Math.round(v.volume * 6);
    const pct = Math.round(v.volume * 100);
    const bars = Array.from({ length: 6 }, (_, i) => `<i${i < level ? ' class="on"' : ''}></i>`).join('');
    this.innerHTML = v.muted || v.volume === 0
      ? `<span class="vb-plate">${icon('mute')}<span><media-text token="videoboy.muted">Muted</media-text></span></span>`
      : `<span class="vb-plate">${icon('vol')}<span><media-text token="videoboy.vol">Vol</media-text></span><span class="vb-osd-bars">${bars}</span><span class="vb-osd-pct">${pct}%</span></span>`;
    this.setAttribute('data-open', '');
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.removeAttribute('data-open'), 1500);
  }
}

/* ------------------------------------------------------------------ Idle progress line
 * The outlined progress line that remains when the base steps away.
 */
class ProgressLineElement extends UIElement {
  readonly #time = new PlayerController(this, playerContext, selectTime);
  readonly #buffer = new PlayerController(this, playerContext, selectBuffer);

  override connectedCallback() {
    super.connectedCallback();
    if (!this.firstElementChild) this.innerHTML = '<span class="vb-line-buf"></span><span class="vb-line-fill"></span>';
  }
  protected override update(changed: PropertyValues) {
    super.update(changed);
    const t = this.#time.value;
    if (!t) return;
    const d = t.duration || 0;
    const p = d ? (t.currentTime / d) * 100 : 0;
    const ranges = this.#buffer.value?.buffered ?? [];
    const end = ranges.reduce((m, [s, e]) => (s <= t.currentTime + 0.5 && e > m ? e : m), 0);
    const b = d ? (end / d) * 100 : 0;
    this.style.setProperty('--vb-line-fill', `${p.toFixed(2)}%`);
    this.style.setProperty('--vb-line-buffer', `${Math.max(p, b).toFixed(2)}%`);
  }
}

for (const [tag, el] of [
  ['vb-dpad', DpadElement],
  ['vb-captions', CaptionsElement],
  ['vb-osd', OsdElement],
  ['vb-progress', ProgressLineElement],
] as const) {
  if (!customElements.get(tag)) customElements.define(tag, el as unknown as CustomElementConstructor);
}
