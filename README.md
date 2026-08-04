# SunShield

A sun and UV protection app. Designed in Figma, built in React.

**Live:** https://rohithabaskaranp.github.io/sunshield/

## What it does

SunShield reads live UV and temperature for your location, works out how fast
*your* skin burns from your Fitzpatrick type, and analyzes photos of your
surroundings to flag heat and sun risk. Streaks and badges track the habit
over time.

## What's actually real

| Feature | How it works |
| --- | --- |
| UV index, temperature, hourly forecast | Live from [Open-Meteo](https://open-meteo.com). No API key, no backend. |
| Time-to-burn | MED values by Fitzpatrick type. UV Index 1 = 25 mW/m² erythemal, so time to one MED = `MED / (UVI × 1.5)` minutes. Type II at UV 8 gives ~21 min, matching published burn tables. |
| SPF recommendation | Derived from your burn time against a two-hour exposure, floored at SPF 30. |
| Image analysis | Every uploaded photo is drawn to a canvas, downscaled, and classified pixel by pixel in HSL space. Produces greenery %, shade fraction, sky share, brightness, and a ranked surface breakdown. |
| Surface temperatures | Per-surface measured rise over air temperature, scaled by solar load. Asphalt reaches ~150F when air is 100F; grass sits *below* air temperature because it transpires. |
| Environment score | Weighted from greenery, shade, paved fraction, live UV, and temperature. |
| Map | Real OpenStreetMap tiles via Leaflet, centred on your device location. |
| UV overlay | 25 live readings across a ~55km grid, fetched in one bulk Open-Meteo call. Tap a circle for its UV, temperature, and cloud cover. |
| Live camera scan | `getUserMedia` stream with the pixel classifier running a few times a second. Surface names and temperatures update as you move the phone. |
| Object detection | COCO-SSD via TensorFlow.js, running on the device. Recognises 80 everyday object types and maps the relevant ones to sun-safety meaning. No key, no server, no photo upload. |
| Streaks and badges | Computed from habits you actually log and scans you actually run. |
| Sunny (chat) | Answers from the live forecast and your skin profile. Handles specific times ("can I play at 1 PM"), SPF, cloud cover, and peak hours. |

Nothing about image analysis leaves your device. There is no server.

## What's still a placeholder

- **Sunny's artwork** is an emoji. Export the character from Figma and drop it into `<Sunny>`.
- **Auth** doesn't exist. Login accepts any valid-looking email and a 6-character password.
- **Camera needs HTTPS.** GitHub Pages qualifies, and `localhost` counts as secure during development. Opening the built files over `file://` will not get camera access.
- **Dark mode** is a CSS filter, not a real palette.

## Why OpenStreetMap and not Mapbox or Google

Both require an API key. A key in a static site is readable by anyone who
opens the page source, and both bill per load. Leaflet with OSM tiles needs
neither. If you outgrow OSM's usage policy, Mapbox tiles drop into `LiveMap.jsx`
by swapping the tile URL, with the token behind the same proxy described below.

## The three ways this app sees

**1. Pixel analysis (always on, no key).** Every photo and every live
camera frame is classified in HSL space to produce greenery, shade, sky,
brightness, and a ranked surface list. This is what drives surface
temperature estimates.

**2. On-device object detection (no key, opt-in download).** TensorFlow.js
with COCO-SSD on the lite MobileNet backbone. The weights are about 6MB and
download the first time you tap "Detect objects", then stay cached. Both the
library and the model sit behind a dynamic import, so the main bundle stays
at ~122kB gzipped and nothing downloads unless you use the feature.

COCO knows 80 object types. The useful ones here are mapped to sun-safety
meaning rather than just labelled: an umbrella means shade is available, a
bench means check the seat temperature, a dog on hot pavement triggers a paw
burn warning. Open landscape often detects nothing, which is a real limit of
the model rather than a bug.

**3. Hosted vision (needs a key, off by default).** `worker/` holds a
Cloudflare Worker that keeps an Anthropic API key server-side and returns a
structured scene description. Deploy it, paste the URL into `PROXY_URL` in
`src/lib/cloud.js`, and a "Describe scene with AI" button appears on scan
reports. Until then the app runs entirely on the first two.

## Why the hosted model needs a proxy

GitHub Pages serves static files. Anything in the bundle is readable by every
visitor, and scrapers find API keys in public repos within minutes of a push.
So the key lives in a Worker you deploy, and the browser only ever talks to
that Worker. See `worker/README.md`.

Sunny (the chat) works the same way today without any proxy: it reasons over
the live forecast and your skin profile locally. To back it with a hosted
model instead, point the body of `answer()` in `SunShield.jsx` at the same
proxy.

## Running it

```bash
npm install
npm run dev
```

`npm run build` produces the production bundle in `dist/`.

## Structure

```
worker/             Cloudflare Worker for hosted vision (optional)
src/
  SunShield.jsx     screens, router, app shell
  lib/uv.js         Open-Meteo client, Fitzpatrick and burn-time math
  lib/vision.js     canvas pixel analysis, surface heat model
  LiveMap.jsx       Leaflet map, tiles, live UV overlay
  LiveScan.jsx      camera stream, real-time surface and object overlay
  lib/detect.js     TensorFlow.js loader, COCO-SSD, sun-safety mapping
  lib/cloud.js      hosted vision client (inactive until PROXY_URL is set)
  lib/store.js      persistence, streaks, badge rules
```

Design tokens live in the `C` and `P` objects at the top of `SunShield.jsx`.
Change a value there and it propagates through every screen.

The screen index down the left side of the app is a review tool. Delete that
`<nav>` before shipping.

## Deploying

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds and
publishes to GitHub Pages. Set **Settings → Pages → Source** to **GitHub Actions**.

If you rename the repo, change `base` in `vite.config.js` to match.
