/* ═══════════════════════════════════════════════════════════════
   cloud.js — optional hosted vision, via a proxy you deploy.

   This is off by default and the app works fully without it.

   The reason it can't just call Anthropic directly: this app is
   static files. Anything in the bundle is readable by anyone who
   opens devtools, so an API key here would be public, and scrapers
   find keys in public repos within minutes. The key has to sit on a
   server you control.

   `worker/` in this repo contains a Cloudflare Worker that does
   exactly that. Deploy it, put its URL below, and the cloud
   features light up. Until then `enabled` stays false and the app
   uses on-device detection only.
   ═══════════════════════════════════════════════════════════════ */

/* Paste your deployed proxy URL here, e.g.
   "https://sunshield-vision.YOUR-SUBDOMAIN.workers.dev" */
export const PROXY_URL = "";

export const enabled = () => PROXY_URL.length > 0;

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(new Error("Could not read that image"));
    r.readAsDataURL(file);
  });
}

/* Downscale before sending. A 4000px phone photo costs far more
   tokens than it adds accuracy, and the upload is slower. */
async function shrink(file, maxEdge = 900) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  if (scale === 1) return file;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(new File([b], "scan.jpg", { type: "image/jpeg" })), "image/jpeg", 0.82);
  });
}

/* Asks the model to describe the scene in sun-safety terms, and to
   return structured fields the UI can render. The local analysis is
   passed in as context so the model can comment on the numbers
   rather than guessing at them. */
export async function describeScene(file, { analysis, conditions } = {}) {
  if (!enabled()) throw new Error("Cloud vision isn't configured");

  const small = await shrink(file);
  const b64 = await fileToBase64(small);

  const context = [
    analysis && `On-device analysis: ${analysis.greenery}% greenery, ${Math.round(analysis.shadeFraction * 100)}% shade on the ground, ${analysis.skyShare}% sky.`,
    conditions && `Live conditions: UV index ${conditions.uv.toFixed(1)}, ${conditions.temp}F air temperature, ${conditions.cloud}% cloud.`,
  ].filter(Boolean).join(" ");

  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: b64, mediaType: "image/jpeg", context }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Vision request failed (${res.status}) ${detail.slice(0, 120)}`);
  }

  const data = await res.json();
  return {
    summary: data.summary || "",
    objects: Array.isArray(data.objects) ? data.objects : [],
    risks: Array.isArray(data.risks) ? data.risks : [],
    shade: data.shade || "",
  };
}
