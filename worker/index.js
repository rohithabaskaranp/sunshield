/* ═══════════════════════════════════════════════════════════════
   SunShield vision proxy — Cloudflare Worker.

   Holds the Anthropic API key server-side so the static app never
   sees it. Deploy this, then paste the Worker URL into
   src/lib/cloud.js.

   Deploy:
     npm install -g wrangler
     wrangler login
     wrangler secret put ANTHROPIC_API_KEY
     wrangler deploy

   Lock ALLOWED_ORIGIN to your Pages URL before going live, or
   anyone can point their own site at your Worker and spend your
   credits.
   ═══════════════════════════════════════════════════════════════ */

const ALLOWED_ORIGIN = "https://rohithabaskaranp.github.io";
const MODEL = "claude-sonnet-4-6";

const SYSTEM = `You analyze photos for a sun-safety app called SunShield.
Identify what is in the scene that matters for sun exposure and surface heat:
shade sources, hot surfaces, water, greenery, people, and animals.

Respond with ONLY a JSON object, no prose and no markdown fences:
{
  "summary": "one or two sentences describing the scene",
  "objects": [{"name": "...", "meaning": "why it matters for sun safety"}],
  "risks": ["specific risk in this scene"],
  "shade": "where shade is available, or 'none visible'"
}
Be concrete about what you can actually see. Do not invent objects.`;

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export default {
  async fetch(request, env) {
    const headers = cors(ALLOWED_ORIGIN);

    if (request.method === "OPTIONS") return new Response(null, { headers });
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers });
    }

    const origin = request.headers.get("Origin");
    if (origin && origin !== ALLOWED_ORIGIN && !origin.startsWith("http://localhost")) {
      return new Response("Origin not allowed", { status: 403, headers });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400, headers });
    }

    const { image, mediaType = "image/jpeg", context = "" } = body;
    if (!image) return new Response("Missing image", { status: 400, headers });

    /* Base64 inflates by ~4/3, so this caps the original near 3MB. */
    if (image.length > 4_200_000) {
      return new Response("Image too large", { status: 413, headers });
    }

    try {
      const upstream = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 700,
          system: SYSTEM,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
              { type: "text", text: context || "Analyze this scene for sun safety." },
            ],
          }],
        }),
      });

      if (!upstream.ok) {
        const detail = await upstream.text();
        return new Response(`Upstream error: ${detail.slice(0, 200)}`, {
          status: upstream.status,
          headers,
        });
      }

      const data = await upstream.json();
      const text = (data.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");

      /* The model is told to return bare JSON, but strip fences
         defensively so one stray markdown block can't break the UI. */
      const cleaned = text.replace(/```json|```/g, "").trim();

      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        parsed = { summary: cleaned.slice(0, 400), objects: [], risks: [], shade: "" };
      }

      return new Response(JSON.stringify(parsed), {
        headers: { ...headers, "Content-Type": "application/json" },
      });
    } catch (e) {
      return new Response(`Proxy error: ${e.message}`, { status: 502, headers });
    }
  },
};
