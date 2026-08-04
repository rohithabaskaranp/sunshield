/* ═══════════════════════════════════════════════════════════════
   vision.js — image analysis that runs entirely in the browser.

   No API, no upload, no key. The photo is drawn to an offscreen
   canvas, downscaled, and every pixel is classified by hue,
   saturation, and lightness. Surface temperatures come from those
   classifications combined with the live air temperature and UV
   reading, using published albedo values.

   Nothing leaves the device, which also means this keeps working
   on static hosting with no backend.
   ═══════════════════════════════════════════════════════════════ */

const SAMPLE_WIDTH = 180;

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

/* Surface classes with solar reflectance (albedo). Darker, lower
   albedo surfaces absorb more and run far hotter than air. Values
   are midpoints from published urban heat-island measurements. */
export const SURFACE_CLASS = {
  grass:    { name: "Grass",             rise:  -8, swatch: "#4E9C3F", advice: "Safe to walk on." },
  tree:     { name: "Tree Canopy",       rise: -12, swatch: "#2F6B33", advice: "Coolest spot in frame." },
  water:    { name: "Water",             rise:  -4, swatch: "#3A7CC4", advice: "Cool, but reflects UV upward." },
  shade:    { name: "Shaded Ground",     rise:   6, swatch: "#6B6F76", advice: "Much cooler than open pavement." },
  concrete: { name: "Concrete Sidewalk", rise:  28, swatch: "#C6C4BE", advice: "Use caution." },
  sand:     { name: "Sand",              rise:  32, swatch: "#E3C99A", advice: "Wear sandals or shoes." },
  metal:    { name: "Metal / Painted",   rise:  45, swatch: "#D7D9DD", advice: "Can cause burns." },
  asphalt:  { name: "Asphalt",           rise:  50, swatch: "#57595E", advice: "Avoid contact." },
  sky:      { name: "Sky",               rise:   0, advice: "" },
};

/* One pixel to one class. Ordering matters: sky and greenery are
   checked before the low-saturation pavement rules, because a hazy
   sky and a concrete slab can land close in lightness. */
function classify(h, s, l) {
  if (l > 0.55 && s > 0.08 && h >= 185 && h <= 255) return "sky";
  if (l > 0.88 && s < 0.10) return "sky";
  if (s > 0.12 && h >= 65 && h <= 105 && l < 0.30) return "tree";
  if (s > 0.13 && h >= 60 && h <= 165 && l >= 0.12 && l <= 0.72) return "grass";
  if (s > 0.16 && h >= 170 && h <= 240 && l >= 0.20 && l <= 0.58) return "water";
  if (s >= 0.13 && s <= 0.62 && h >= 20 && h <= 58 && l > 0.42) return "sand";
  if (s < 0.13 && l > 0.70) return "metal";
  if (s < 0.16 && l >= 0.40 && l <= 0.70) return "concrete";
  if (s < 0.16 && l >= 0.14 && l < 0.40) return "asphalt";
  if (l < 0.14) return "shade";
  if (s >= 0.13 && s <= 0.62 && h >= 15 && h <= 60) return "sand";
  return "concrete";
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read that image")); };
    img.src = url;
  });
}

/* Grabs a frame from a video file so the scan flows accept video too. */
function loadVideoFrame(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.onloadeddata = () => { v.currentTime = Math.min(1, (v.duration || 2) / 2); };
    v.onseeked = () => {
      const c = document.createElement("canvas");
      c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext("2d").drawImage(v, 0, 0);
      URL.revokeObjectURL(url);
      resolve(c);
    };
    v.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read that video")); };
    v.src = url;
  });
}

/* Core pass: downscale, walk every pixel, tally classes and stats. */
export async function analyzeImage(file, onProgress = () => {}) {
  onProgress(8);
  const isVideo = file.type.startsWith("video");
  const source = isVideo ? await loadVideoFrame(file) : await loadImage(file);
  onProgress(28);

  const sw = source.width || source.videoWidth;
  const sh = source.height || source.videoHeight;
  const w = Math.min(SAMPLE_WIDTH, sw);
  const h = Math.max(1, Math.round((sh / sw) * w));

  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, h);
  onProgress(45);

  const { data } = ctx.getImageData(0, 0, w, h);
  const total = w * h;

  const counts = {};
  let sumL = 0, sumS = 0;
  let darkGround = 0, groundPixels = 0;
  const horizon = Math.floor(h * 0.45);

  for (let i = 0; i < data.length; i += 4) {
    const px = (i / 4) % w;
    const py = Math.floor((i / 4) / w);
    const [hu, sa, li] = rgbToHsl(data[i], data[i + 1], data[i + 2]);

    let cls = classify(hu, sa, li);
    /* Sky only counts in the upper part of the frame — blue-gray
       pavement in the lower half is pavement, not sky. */
    if (cls === "sky" && py > horizon) cls = li > 0.6 ? "concrete" : "asphalt";

    counts[cls] = (counts[cls] || 0) + 1;
    sumL += li;
    sumS += sa;

    if (py >= horizon) {
      groundPixels++;
      if (li < 0.30) darkGround++;
    }
    if (px === 0 && py % 40 === 0) onProgress(45 + Math.round((py / h) * 35));
  }
  onProgress(84);

  const pct = (k) => ((counts[k] || 0) / total) * 100;
  const greenery = pct("grass") + pct("tree");
  const meanLight = sumL / total;
  const meanSat = sumS / total;
  const shadeFraction = groundPixels ? darkGround / groundPixels : 0;

  /* Rank the ground surfaces actually present, biggest first. */
  const surfaces = Object.entries(counts)
    .filter(([k]) => k !== "sky")
    .map(([k, n]) => ({ key: k, share: (n / total) * 100 }))
    .filter((s) => s.share >= 3.5)
    .sort((a, b) => b.share - a.share)
    .slice(0, 5);

  onProgress(100);

  return {
    width: sw,
    height: sh,
    fromVideo: isVideo,
    thumbnail: canvas.toDataURL("image/jpeg", 0.6),
    greenery: +greenery.toFixed(1),
    skyShare: +pct("sky").toFixed(1),
    shadeFraction: +shadeFraction.toFixed(2),
    brightness: +meanLight.toFixed(3),
    saturation: +meanSat.toFixed(3),
    surfaces,
    counts,
  };
}

/* ── Surface temperature ──────────────────────────────────────────
   Albedo alone gives wrong answers: grass has a middling albedo but
   sits BELOW air temperature because it transpires, while asphalt
   runs 40–50F above. So each class carries a measured maximum rise
   over air temperature in full sun, scaled by the current solar
   load. Figures follow published urban heat-island surface studies
   (asphalt near 150F when air is 100F; turf slightly below air).  */
export function surfaceTemp(key, airTempF, uvi) {
  const meta = SURFACE_CLASS[key] || SURFACE_CLASS.concrete;
  const solar = Math.min(1, Math.max(0.15, (uvi || 0) / 10));
  return Math.round(airTempF + meta.rise * solar);
}

/* Graded against skin contact risk, not comfort. Contact burns
   begin around 120F for sustained touch. */
export function heatVerdict(tempF) {
  if (tempF >= 135) return { label: "Very Hot", bars: 4 };
  if (tempF >= 120) return { label: "Hot", bars: 3 };
  if (tempF >= 100) return { label: "Warm", bars: 2 };
  return { label: "Cool", bars: 1 };
}

/* Turns the raw pixel breakdown into the surface table. */
export function surfaceReport(analysis, airTempF, uvi) {
  return analysis.surfaces.map((s) => {
    const meta = SURFACE_CLASS[s.key] || SURFACE_CLASS.concrete;
    const f = surfaceTemp(s.key, airTempF, uvi);
    const v = heatVerdict(f);
    return {
      key: s.key,
      name: meta.name,
      share: Math.round(s.share),
      swatch: meta.swatch,
      f,
      c: Math.round((f - 32) * 5 / 9),
      verdict: v.label,
      bars: v.bars,
      advice: meta.advice,
    };
  });
}

/* 0–100 environment score. Greenery and shade help; glare, heat,
   and a fully paved frame hurt. */
export function environmentScore(analysis, conditions) {
  const uv = conditions?.uv ?? 0;
  const temp = conditions?.temp ?? 80;
  const paved = (analysis.counts.asphalt || 0) + (analysis.counts.concrete || 0);
  const pavedPct = (paved / (analysis.width && 1 ? Object.values(analysis.counts).reduce((a, b) => a + b, 0) : 1)) * 100;

  let score = 55;
  score += Math.min(25, analysis.greenery * 0.55);
  score += Math.min(12, analysis.shadeFraction * 30);
  score -= Math.min(20, Math.max(0, uv - 4) * 3);
  score -= Math.min(12, Math.max(0, temp - 88) * 0.6);
  score -= Math.min(14, Math.max(0, pavedPct - 35) * 0.28);

  const n = Math.max(0, Math.min(100, Math.round(score)));
  const label = n >= 80 ? "Excellent" : n >= 65 ? "Good" : n >= 45 ? "Fair" : "Poor";
  return { score: n, label, pavedPct: Math.round(pavedPct) };
}

/* Written findings, all derived from the numbers above. */
export function insights(analysis, conditions, env) {
  const out = [];
  const uv = conditions?.uv ?? 0;

  if (uv >= 6) out.push({ emoji: "☀️", text: `UV is ${uv.toFixed(1)} here. Seek shade and reapply sunscreen every two hours.` });
  else if (uv >= 3) out.push({ emoji: "☀️", text: `UV is moderate at ${uv.toFixed(1)}. Sunscreen is still worth it.` });
  else out.push({ emoji: "☀️", text: `UV is low at ${uv.toFixed(1)}. Comfortable conditions for time outside.` });

  if (analysis.greenery >= 30) out.push({ emoji: "🌳", text: `Strong greenery at ${analysis.greenery}% of the frame. Green cover measurably lowers local temperature.` });
  else if (analysis.greenery >= 12) out.push({ emoji: "🌳", text: `Some greenery at ${analysis.greenery}%. Look for tree cover if you plan to stay a while.` });
  else out.push({ emoji: "🧱", text: `Very little greenery, around ${analysis.greenery}%. Mostly hard surfaces, which hold heat.` });

  if (analysis.shadeFraction < 0.15 && uv >= 5) out.push({ emoji: "⛱️", text: "Almost no shade in view. Bring your own cover or move somewhere with tree canopy." });
  else if (analysis.shadeFraction >= 0.3) out.push({ emoji: "⛱️", text: `Good shade coverage at ${Math.round(analysis.shadeFraction * 100)}% of the ground.` });

  if (env.pavedPct >= 55) out.push({ emoji: "🌡️", text: `${env.pavedPct}% paved surface. Expect ground temperatures well above the air reading.` });

  return out;
}
