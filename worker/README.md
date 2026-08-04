# SunShield vision proxy

A tiny Cloudflare Worker that lets the app use a hosted vision model
without putting an API key in the browser.

The app works without this. On-device object detection and pixel
analysis need no key and no server. Deploy this only if you want
richer scene descriptions than COCO's 80 object classes can give.

## Why it exists

SunShield is served as static files from GitHub Pages. Anything in
the JavaScript bundle is readable by every visitor, so an API key
placed there is public. Bots scrape public repos for keys within
minutes of a push. This Worker keeps the key on Cloudflare's side
and forwards only the image.

## Deploy

```bash
npm install -g wrangler
wrangler login
wrangler secret put ANTHROPIC_API_KEY   # paste your key when prompted
wrangler deploy
```

Wrangler prints a URL like `https://sunshield-vision.you.workers.dev`.
Paste it into `PROXY_URL` in `src/lib/cloud.js`, then commit and push.

## Before going live

Set `ALLOWED_ORIGIN` in `index.js` to your Pages URL. Without it,
anyone can point their own page at your Worker and spend your credits.

For real traffic, add Cloudflare Rate Limiting on the Worker route.
The origin check stops casual abuse; it does not stop a determined
script.

## Cost

Each scan is one image plus a short prompt. Downscaling to 900px
happens client-side in `cloud.js` before upload, which keeps token
counts low. Check current pricing at anthropic.com/pricing.
