/*
 * VIDEOBOY: a dot-matrix handheld skin for the Video.js v10 player.
 * Copyright 2026 Victor Ibidunmoye. Licensed under the Apache License, Version 2.0.
 *
 * Usage:
 *   <video-player>
 *     <videoboy-skin data-theme="tangerine" poster-time="58">
 *       <mux-video src="https://stream.mux.com/…m3u8"></mux-video>   (or <video src="…">)
 *     </videoboy-skin>
 *   </video-player>
 *
 * Attributes on <videoboy-skin>:
 *   data-theme   tangerine (default) | classic | night
 *   poster-time  seconds; the start screen shows this frame in dot-matrix
 *   no-chime     turns off the start chime
 * Any --vb-* custom property can be overridden from the page (see README).
 */
import '@videojs/html/video/player';
import '@videojs/html/i18n';
import '@videojs/html/ui/container';
import '@videojs/html/ui/controls';
import '@videojs/html/ui/controls-content';
import '@videojs/html/ui/play-button';
import '@videojs/html/ui/mute-button';
import '@videojs/html/ui/captions-button';
import '@videojs/html/ui/menu';
import '@videojs/html/ui/menu-content';
import '@videojs/html/ui/menu-item';
import '@videojs/html/ui/menu-item-indicator';
import '@videojs/html/ui/menu-radio-item';
import '@videojs/html/ui/menu-separator';
import '@videojs/html/ui/captions-radio-group';
import '@videojs/html/ui/playback-rate-radio-group';
import '@videojs/html/ui/quality-radio-group';
import '@videojs/html/ui/audio-track-radio-group';
import '@videojs/html/ui/fullscreen-button';
import '@videojs/html/ui/time';
import '@videojs/html/ui/time-slider';
import '@videojs/html/ui/volume-slider';
import '@videojs/html/ui/slider-track';
import '@videojs/html/ui/slider-buffer';
import '@videojs/html/ui/slider-fill';
import '@videojs/html/ui/slider-thumb';
import '@videojs/html/ui/slider-preview';
import '@videojs/html/ui/slider-value';
import '@videojs/html/ui/slider-thumbnail';
import '@videojs/html/ui/tooltip';
import '@videojs/html/ui/tooltip-group';
import '@videojs/html/ui/tooltip-label';
import '@videojs/html/ui/tooltip-shortcut';
import '@videojs/html/ui/buffering-indicator';
import '@videojs/html/ui/hotkey';
import '@videojs/html/ui/gesture';
import '@videojs/html/ui/status-announcer';
import '@videojs/html/ui/error-dialog';
import '@videojs/html/ui/dialog-popup';
import '@videojs/html/ui/dialog-title';
import '@videojs/html/ui/dialog-description';
import '@videojs/html/ui/dialog-close';
import './parts';
import './lcd';
import { icon } from './icons';
import { parseColor } from './lcd';

let uid = 0;
const T = (token: string, text: string) => `<media-text token="videoboy.${token}">${text}</media-text>`;

/** A round key: face, sheen and state icons. */
function key(icons: string) {
  return `<span class="vb-key-face" aria-hidden="true"><span class="vb-key-icons">${icons}</span></span>`;
}

/** One row of the root menu that opens a page of choices, with the page itself. */
function menuPage(id: string, key: string, label: string, group: string) {
  const page = `${id}-m-${key}`;
  return `
        <media-menu-item commandfor="${page}" class="vb-menu-row vb-menu-${key}">
          <span class="vb-menu-cursor" aria-hidden="true"></span>
          <span class="vb-menu-label"><media-text token="menu.${key}">${label}</media-text></span>
          <span class="vb-menu-hint"><span data-part="value" class="vb-menu-value"></span><span class="vb-menu-arrow" aria-hidden="true"></span></span>
        </media-menu-item>
        <media-menu-content class="vb-menu-page" id="${page}" aria-label="${label}">
          <media-menu-item class="vb-menu-row vb-menu-back">
            <span class="vb-menu-cursor" aria-hidden="true"></span>
            <span class="vb-menu-back-arrow" aria-hidden="true"></span>
            <span class="vb-menu-label"><media-text token="menu.${key}">${label}</media-text></span>
          </media-menu-item>
          <media-menu-separator class="vb-menu-sep"></media-menu-separator>
          <${group} class="vb-menu-group">
            <template>
              <media-menu-radio-item class="vb-menu-row vb-menu-radio">
                <span class="vb-menu-cursor" aria-hidden="true"></span>
                <span class="vb-menu-label"><span data-part="label"></span><sup data-part="tier" class="vb-menu-tier"></sup></span>
                <span data-part="badge" class="vb-menu-badge"></span>
                <media-menu-item-indicator force-mount class="vb-menu-check"><span aria-hidden="true"></span></media-menu-item-indicator>
              </media-menu-radio-item>
            </template>
          </${group}>
        </media-menu-content>`;
}

function template(id: string) {
  const a = `${id}-a`, b = `${id}-b`, mb = `${id}-menu-btn`, menu = `${id}-menu`, fs = `${id}-fs`, vol = `${id}-vol`;
  return `
  <div class="vb-shell" aria-hidden="true"></div>
  <div class="vb-bezel" aria-hidden="true">
    <span class="vb-bezel-band"><span class="vb-led"></span><span class="vb-led-label">Power</span><span class="vb-stripes"></span><span class="vb-bezel-text">Dot matrix video</span><span class="vb-stripes vb-stripes-end"></span></span>
  </div>

  <div class="vb-screen">
    <vb-lcd class="vb-lcd"></vb-lcd>
    <div class="vb-boot" aria-hidden="true"><span class="vb-boot-logo">VIDEOBOY</span></div>
    <vb-captions class="vb-captions"></vb-captions>

    <button type="button" class="vb-start" aria-label="Press start: play video"></button>
    <span class="vb-start-window" aria-hidden="true">
      <span class="vb-start-logo">VIDEOBOY</span>
      <span class="vb-start-title vb-when-start">${T('pressStart', 'Press start')}</span>
      <span class="vb-start-title vb-when-end">${T('theEnd', 'The end')}</span>
      <span class="vb-start-hint"><span class="vb-when-start">A &middot; Space &middot; Tap</span><span class="vb-when-end">A to play again</span></span>
    </span>
    <div class="vb-window vb-pause-window" aria-hidden="true">${T('paused', 'Pause')}</div>
    <media-buffering-indicator class="vb-loading"><span class="vb-loading-dots" aria-hidden="true"><i></i><i></i><i></i></span></media-buffering-indicator>
    <vb-osd class="vb-osd" aria-hidden="true"></vb-osd>

    <media-error-dialog class="vb-error">
      <media-dialog-popup class="vb-error-popup vb-window">
        <span class="vb-error-head" aria-hidden="true">${T('noSignal', 'No signal')}</span>
        <media-dialog-title class="vb-error-title"></media-dialog-title>
        <media-dialog-description class="vb-error-desc"></media-dialog-description>
        <media-dialog-close class="vb-error-close"></media-dialog-close>
      </media-dialog-popup>
    </media-error-dialog>
  </div>

  <media-controls class="vb-controls">
    <media-controls-content class="vb-deck">
      <media-tooltip-group delay="450">
        <vb-dpad class="vb-dpad"></vb-dpad>

        <div class="vb-seekbox">
          <media-time class="vb-time vb-time-current" type="current"></media-time>
          <media-time-slider class="vb-seek" thumb-alignment="center">
            <media-slider-track class="vb-groove">
              <media-slider-buffer class="vb-buffer"></media-slider-buffer>
              <media-slider-fill class="vb-fill"></media-slider-fill>
            </media-slider-track>
            <media-slider-thumb class="vb-cart"></media-slider-thumb>
            <media-slider-preview class="vb-preview" overflow="clamp">
              <media-slider-thumbnail class="vb-thumb"></media-slider-thumbnail>
              <media-slider-value type="pointer" class="vb-preview-time"></media-slider-value>
            </media-slider-preview>
          </media-time-slider>
          <media-time class="vb-time vb-time-duration" type="duration"></media-time>
        </div>

        <div class="vb-sys">
          <span class="vb-sys-slot">
            <button type="button" class="vb-pill vb-menu-btn" id="${mb}" commandfor="${menu}" aria-label="Menu" aria-keyshortcuts="s"><span class="vb-pill-cap" aria-hidden="true"></span></button>
            <span class="vb-label" aria-hidden="true">${T('menu', 'Menu')}</span>
          </span>
          <media-tooltip trigger="${mb}" side="top" class="vb-tip"><media-text token="videoboy.menuTip">Menu</media-text><span class="vb-tip-key">S</span></media-tooltip>
          <media-menu id="${menu}" side="top" align="center" class="vb-menu">
            <media-menu-content class="vb-menu-page vb-menu-root" aria-label="Player menu">
              ${menuPage(id, 'captions', 'Captions', 'media-captions-radio-group')}
              ${menuPage(id, 'speed', 'Speed', 'media-playback-rate-radio-group')}
              ${menuPage(id, 'quality', 'Quality', 'media-quality-radio-group')}
              ${menuPage(id, 'audio', 'Audio', 'media-audio-track-radio-group')}
              <media-menu-item class="vb-menu-row vb-menu-pip" data-vb-pip>
                <span class="vb-menu-cursor" aria-hidden="true"></span>
                <span class="vb-menu-label"><span class="vb-pip-enter">${T('pip', 'Picture in picture')}</span><span class="vb-pip-exit">${T('pipExit', 'Exit picture in picture')}</span></span>
              </media-menu-item>
            </media-menu-content>
          </media-menu>
          <span class="vb-sys-slot">
            <media-fullscreen-button class="vb-pill vb-fs" id="${fs}"><span class="vb-pill-cap" aria-hidden="true"></span></media-fullscreen-button>
            <span class="vb-label" aria-hidden="true"><span class="vb-i-enter">${T('full', 'Full')}</span><span class="vb-i-exit">${T('exit', 'Exit')}</span></span>
          </span>
          <media-tooltip trigger="${fs}" side="top" class="vb-tip"><media-tooltip-label></media-tooltip-label><media-tooltip-shortcut class="vb-tip-key"></media-tooltip-shortcut></media-tooltip>
        </div>

        <div class="vb-ab">
          <span class="vb-ab-recess" aria-hidden="true"></span>
          <span class="vb-key-slot vb-slot-b">
            <media-mute-button class="vb-key vb-b" id="${b}">${key(icon('vol', 'vb-i-vol') + icon('mute', 'vb-i-mute'))}</media-mute-button>
            <span class="vb-label vb-key-letter" aria-hidden="true">B</span>
          </span>
          <media-tooltip trigger="${b}" side="top" class="vb-tip"><media-tooltip-label></media-tooltip-label><media-tooltip-shortcut class="vb-tip-key"></media-tooltip-shortcut></media-tooltip>
          <span class="vb-key-slot vb-slot-a">
            <media-play-button class="vb-key vb-a" id="${a}">${key(icon('play', 'vb-i-play') + icon('pause', 'vb-i-pause') + icon('replay', 'vb-i-replay'))}</media-play-button>
            <span class="vb-label vb-key-letter" aria-hidden="true">A</span>
          </span>
          <media-tooltip trigger="${a}" side="top" class="vb-tip"><media-tooltip-label></media-tooltip-label><media-tooltip-shortcut class="vb-tip-key"></media-tooltip-shortcut></media-tooltip>
        </div>

        <div class="vb-grille-slot">
          <media-volume-slider class="vb-grille" id="${vol}" step="16.6667" large-step="33.3333" wheel-step="16.6667">
            <media-slider-track class="vb-grille-track">
              <span class="vb-slots vb-slots-off" aria-hidden="true">${'<i></i>'.repeat(6)}</span>
              <span class="vb-slots vb-slots-on" aria-hidden="true">${'<i></i>'.repeat(6)}</span>
            </media-slider-track>
            <media-slider-thumb class="vb-grille-thumb"></media-slider-thumb>
          </media-volume-slider>
          <span class="vb-label" aria-hidden="true">${T('vol', 'Vol')}</span>
        </div>
      </media-tooltip-group>
    </media-controls-content>
  </media-controls>

  <vb-progress class="vb-line" aria-hidden="true"></vb-progress>

  <svg class="vb-defs" width="0" height="0" aria-hidden="true" focusable="false">
    <filter id="${id}-lcdf" color-interpolation-filters="sRGB">
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer class="vb-lcdf-map"><feFuncR type="discrete" tableValues="0 0 0 0"/><feFuncG type="discrete" tableValues="0 0 0 0"/><feFuncB type="discrete" tableValues="0 0 0 0"/></feComponentTransfer>
    </filter>
  </svg>

  <media-hotkey keys="Space" action="togglePaused"></media-hotkey>
  <media-hotkey keys="k" action="togglePaused"></media-hotkey>
  <media-hotkey keys="m" action="toggleMuted"></media-hotkey>
  <media-hotkey keys="f" action="toggleFullscreen"></media-hotkey>
  <media-hotkey keys="c" action="toggleSubtitles"></media-hotkey>
  <media-hotkey keys="ArrowLeft" action="seekStep" value="-5"></media-hotkey>
  <media-hotkey keys="ArrowRight" action="seekStep" value="5"></media-hotkey>
  <media-hotkey keys="j" action="seekStep" value="-10"></media-hotkey>
  <media-hotkey keys="l" action="seekStep" value="10"></media-hotkey>
  <media-hotkey keys="ArrowUp" action="volumeStep" value="0.16667"></media-hotkey>
  <media-hotkey keys="ArrowDown" action="volumeStep" value="-0.16667"></media-hotkey>
  <media-hotkey keys="0-9" action="seekToPercent"></media-hotkey>
  <media-hotkey keys="Home" action="seekToPercent" value="0"></media-hotkey>
  <media-hotkey keys="End" action="seekToPercent" value="100"></media-hotkey>
  <media-gesture type="tap" action="togglePaused" pointer="mouse" region="center"></media-gesture>
  <media-gesture type="tap" action="toggleControls" pointer="touch"></media-gesture>
  <media-gesture type="doubletap" action="seekStep" value="-10" region="left" pointer="touch"></media-gesture>
  <media-gesture type="doubletap" action="seekStep" value="10" region="right" pointer="touch"></media-gesture>
  <media-status-announcer class="vb-sr"></media-status-announcer>`;
}

/* ---------------------------------------------------------------- start chime
 * Two short square-wave notes, the handheld's power-on ping, scaled by the
 * player's own volume. Played once, on the first Start, only from a user
 * gesture, never when muted, and never with the no-chime attribute.
 */
let audioCtx: AudioContext | null = null;
function chime(volume: number) {
  try {
    audioCtx ??= new AudioContext();
    const ctx = audioCtx;
    const t = ctx.currentTime + 0.02;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    const peak = 0.06 * Math.max(0, Math.min(1, volume));
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.005);
    gain.gain.setValueAtTime(peak, t + 0.07);
    gain.gain.linearRampToValueAtTime(peak * 0.8, t + 0.075);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1046.5, t);
    osc.frequency.setValueAtTime(2093, t + 0.07);
    osc.connect(gain);
    osc.start(t);
    osc.stop(t + 0.6);
  } catch {}
}

/** Mirror the theme's four LCD tones into the SVG fallback filter, for cross-origin frames. */
function syncFilter(container: HTMLElement) {
  const cs = getComputedStyle(container);
  const rgb = [0, 1, 2, 3].map((i) => parseColor(cs.getPropertyValue(`--vb-lcd-${i}`), [0, 0, 0]).map((c) => (c / 255).toFixed(3)));
  container.querySelectorAll('.vb-lcdf-map > *').forEach((f, ch) => f.setAttribute('tableValues', rgb.map((c) => c[ch]).join(' ')));
}

class VideoboySkinElement extends HTMLElement {
  #rendered = false;
  #chimed = false;
  #observers: MutationObserver[] = [];
  #observe: (() => void) | null = null;
  #cleanup: (() => void) | null = null;

  disconnectedCallback() {
    for (const o of this.#observers) o.disconnect();
    this.#observers = [];
    this.#cleanup?.();
  }

  connectedCallback() {
    if (this.#rendered) {
      this.#observe?.();
      return;
    }
    this.#rendered = true;
    const id = `vb${(++uid).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const container = document.createElement('media-container');
    container.className = 'videoboy';
    container.setAttribute('data-skin', 'videoboy');
    container.style.setProperty('--vb-lcd-filter', `url(#${id}-lcdf)`);
    const media = Array.from(this.childNodes);
    container.innerHTML = template(id);
    container.prepend(...media);
    this.append(container);
    requestAnimationFrame(() => syncFilter(container));
    // Observers are kept so a skin moved or removed from the page stops watching; they resume on reconnect.
    this.#observe = () => {
      const themes = new MutationObserver(() => syncFilter(container));
      themes.observe(this, { attributes: true, attributeFilter: ['data-theme', 'style'] });
      // Media added later (by script, or a source swap) belongs inside the container too.
      const media = new MutationObserver((records) => {
        for (const r of records) for (const n of r.addedNodes) if (n !== container && n instanceof Element) container.prepend(n);
      });
      media.observe(this, { childList: true });
      const lcd = new MutationObserver(() => {
        const end = container.getAttribute('data-lcd') === 'end';
        start.setAttribute('aria-label', end ? 'The end. Play again' : 'Press start: play video');
      });
      lcd.observe(container, { attributes: true, attributeFilter: ['data-lcd'] });
      this.#observers = [themes, media, lcd];
    };

    // The start and end screens are one big button. Its name says what the screen says.
    const start = container.querySelector<HTMLButtonElement>('.vb-start')!;
    this.#observe!();
    start.addEventListener('click', () => {
      const m = container.querySelector(':scope > video, :scope > [playback-id], :scope > [src]') as HTMLMediaElement | null;
      const p = m?.play?.();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    });

    // S opens the menu, like Select on the handheld. Ignored while typing or with modifiers.
    const menuBtn = container.querySelector<HTMLButtonElement>('.vb-menu-btn')!;
    container.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() !== 's' || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, [contenteditable], media-menu')) return;
      e.preventDefault();
      menuBtn.click();
    });

    // Picture in picture, as a menu row. Hidden where the browser or the media can't do it.
    const pip = container.querySelector<HTMLElement>('[data-vb-pip]')!;
    const mediaEl = () => {
      const m = container.querySelector(':scope > video, :scope > [playback-id], :scope > [src]');
      return (m instanceof HTMLVideoElement ? m : (m as any)?.target) as HTMLVideoElement | undefined;
    };
    const syncPip = () => {
      const v = mediaEl();
      const ok = !!(document.pictureInPictureEnabled && v && !v.disablePictureInPicture);
      pip.toggleAttribute('hidden', !ok);
      container.toggleAttribute('data-pip', !!document.pictureInPictureElement);
    };
    pip.addEventListener('click', async () => {
      const v = mediaEl();
      try {
        if (document.pictureInPictureElement) await document.exitPictureInPicture();
        else if (v) await v.requestPictureInPicture();
      } catch {}
      syncPip();
    });
    document.addEventListener('enterpictureinpicture', syncPip, true);
    document.addEventListener('leavepictureinpicture', syncPip, true);
    this.#cleanup = () => {
      document.removeEventListener('enterpictureinpicture', syncPip, true);
      document.removeEventListener('leavepictureinpicture', syncPip, true);
    };
    const observeOnly = this.#observe!;
    this.#observe = () => {
      observeOnly();
      document.addEventListener('enterpictureinpicture', syncPip, true);
      document.addEventListener('leavepictureinpicture', syncPip, true);
    };
    window.setTimeout(syncPip, 0);

    container.addEventListener('vb-start', () => {
      if (this.#chimed || this.hasAttribute('no-chime')) return;
      this.#chimed = true;
      const v = container.querySelector('vb-lcd') as any;
      const media = container.querySelector(':scope > video, :scope > [playback-id], :scope > [src]') as HTMLMediaElement | null;
      const muted = media?.muted ?? false;
      const vol = media?.volume ?? 1;
      if (!muted && vol > 0 && v) chime(vol);
    });
  }
}
if (!customElements.get('videoboy-skin')) customElements.define('videoboy-skin', VideoboySkinElement);
