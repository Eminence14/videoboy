# VIDEOBOY

A dot-matrix handheld skin for the [Video.js v10](https://videojs.org) player.

Full colour while it plays. The moment it stops, the screen becomes a four-tone dot-matrix panel: a boot logo, a Press Start menu, a Pause window, an end card, and static when the signal drops. The controls live on the console below the screen, so nothing covers the picture while it plays. In fullscreen the console floats over the film and then steps away to a single outlined progress line.

Designed and built by [Victor Ibidunmoye](https://cad.victoribidunmoye.me) for the #Video.js Skins Design Challenge.

## Use it

```bash
npm i @videojs/html @videojs/mux-video
```

```js
import './videoboy/skin';        // the src folder of this project
import './videoboy/videoboy.css';
import '@videojs/html/media/mux-video';
```

```html
<video-player>
  <videoboy-skin data-theme="tangerine" poster-time="36">
    <mux-video playback-id="YOUR_PLAYBACK_ID" playsinline crossorigin="anonymous"></mux-video>
  </videoboy-skin>
</video-player>
```

Any `<video>` works in place of `<mux-video>`.

### Attributes on `<videoboy-skin>`

| Attribute | Values | What it does |
| --- | --- | --- |
| `data-theme` | `tangerine` (default), `classic`, `night` | Picks a palette for the shell, keys and LCD tones. |
| `poster-time` | seconds | The start screen shows this frame in dot-matrix. Playback still starts at 0. |
| `no-chime` | (boolean) | Turns off the short start chime. The chime only plays from a user gesture, scaled by the player volume, never when muted. |

### Tokens

Every colour and radius is a custom property on `videoboy-skin`, so a site can restyle the handheld from its own CSS:

```css
videoboy-skin {
  --vb-accent: #2f7cf6;          /* seek fill, CC lit, grille */
  --vb-key: #2f7cf6;             /* A and B faces */
  --vb-key-hi: #74a6f9;
  --vb-key-lo: #1b4fa6;
  --vb-key-ink: #fff;            /* icons on A and B */
  --vb-led: #5b9bff;             /* power LED */
  --vb-lcd-0: #0b1d3a;           /* darkest LCD tone ... */
  --vb-lcd-3: #dbe8ff;           /* ... lightest */
  --vb-radius-corner: 48px;      /* the handheld's big bottom-right corner */
}
```

The full list is at the top of `src/videoboy.css`.

## How the dot-matrix works

`src/lcd.ts` defines `<vb-lcd>`. It captures the current frame into a small canvas, samples it onto a grid of about 160 dots across, auto-levels the luminance (2nd to 98th percentile), ordered-dithers it with a 4×4 Bayer matrix into four tones, and draws each dot with a gap and a soft drop shadow, like a reflective LCD. On pause the colour picture first pixelates up to dot size, then snaps to the four tones; on play it releases back. While paused, seeking redraws the panel, so scrubbing shows the new frame in dot-matrix.

If a frame cannot be read (cross-origin footage without CORS), the panel falls back to an SVG filter that maps the picture onto the same four tones.

`<vb-lcd>` also writes the screen's mode to the container (`data-lcd="start | play | pause | end | error"`, `data-waiting`), which the power LED and the screen windows follow.

## Controls

| Part | Does |
| --- | --- |
| Power LED | Lit while playing, low when stopped, blinking while buffering, red on error. |
| D-pad | Left/right seek 5 s, up/down volume one slot. One tab stop; arrows move between arms; hold to repeat. |
| Seek strip | Cartridge thumb on a segmented groove. Dot-matrix storyboard preview on Mux. |
| Select · CC | Captions on/off. Lights when on, hidden when the media has no captions. |
| Start · Full | Fullscreen. |
| B | Mute. |
| A | Play, pause, replay. |
| Speaker grille | Volume slider, six slots lit from the bottom. |

Keyboard: Space/K play, ←/→ 5 s, J/L 10 s, ↑/↓ volume, 0–9 jump to 0–90%, Home/End, M mute, C captions, F fullscreen.

## Accessibility

- 0 axe-core violations in 78 runs: WCAG 2.2 AA and best-practice rules, three themes, three widths, eight states, and the demo page.
- Labels and timecodes reach at least 6.6:1; key icons at least 5.7:1.
- Every control is a Video.js component with its own name and shortcut; the status announcer reports changes. The LCD canvas is hidden from assistive tech.
- `prefers-reduced-motion`: no mosaic transition, no blinking, no boot drop.
- `forced-colors`: the handheld redraws itself in system colours.
- Keys are 40 px or more, D-pad arms at least 24 px, seek strip and grille 44 px tall.

## Develop

```bash
npm install
npm run dev        # demo page at http://localhost:5173
npm run build      # static site in dist/
```

Set `VITE_MUX_PLAYBACK_ID` (see `.env.production`) to stream from Mux; add `?local` to the URL to use the bundled clips.

## Credits and licences

- Skin code: Apache License 2.0 (see `LICENSE`).
- Fonts: Press Start 2P and Silkscreen, SIL Open Font License 1.1 (see `src/fonts`).
- Demo film: *Tears of Steel* © Blender Foundation, [mango.blender.org](https://mango.blender.org), CC BY 3.0. Playground clips and captions are original.
