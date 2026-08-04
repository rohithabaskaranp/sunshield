/* ═══════════════════════════════════════════════════════════════
   detect.js — object detection that runs on the device.

   COCO-SSD via TensorFlow.js. The model weights download once
   (~6MB for the lite MobileNet backbone) and then everything runs
   locally: no API key, no per-request cost, no photo leaving the
   phone. That's the whole reason to prefer it over a hosted vision
   API for this app.

   Both the library and the model are behind a dynamic import, so
   the main bundle stays small and nothing downloads until someone
   actually opens a detection screen.
   ═══════════════════════════════════════════════════════════════ */

let modelPromise = null;
let loadState = "idle"; // idle | loading | ready | failed

export const detectorState = () => loadState;

export function loadDetector(onProgress = () => {}) {
  if (modelPromise) return modelPromise;
  loadState = "loading";
  onProgress(5);

  modelPromise = (async () => {
    try {
      const tf = await import("@tensorflow/tfjs");
      onProgress(35);
      await tf.ready();
      onProgress(55);
      const cocoSsd = await import("@tensorflow-models/coco-ssd");
      onProgress(70);
      /* lite_mobilenet_v2 is the smallest backbone. Accuracy is
         lower than the full model, but it's the difference between
         a 6MB and a 27MB download on a phone. */
      const model = await cocoSsd.load({ base: "lite_mobilenet_v2" });
      onProgress(100);
      loadState = "ready";
      return model;
    } catch (e) {
      loadState = "failed";
      modelPromise = null;
      throw e;
    }
  })();

  return modelPromise;
}

/* ── Sun-safety meaning for the classes COCO can recognise ────────
   COCO knows 80 everyday objects. Only some matter here, and what
   matters is what each one implies about sun exposure or hot
   surfaces, not the label itself. */
const MEANING = {
  umbrella:      { icon: "⛱️", kind: "shade",  note: "Shade available right here." },
  "potted plant":{ icon: "🪴", kind: "green",  note: "Greenery nearby." },
  bench:         { icon: "🪑", kind: "hot",    note: "Check the seat before sitting. Metal and dark wood get hot." },
  chair:         { icon: "🪑", kind: "hot",    note: "Surface may be hot in direct sun." },
  car:           { icon: "🚗", kind: "hot",    note: "Car metal and interiors get dangerously hot." },
  truck:         { icon: "🚚", kind: "hot",    note: "Large metal surfaces radiate heat." },
  bus:           { icon: "🚌", kind: "hot",    note: "Metal panels get hot to the touch." },
  motorcycle:    { icon: "🏍️", kind: "hot",    note: "Seat and exhaust can burn skin." },
  bicycle:       { icon: "🚲", kind: "hot",    note: "Metal frame and seat heat up fast." },
  dog:           { icon: "🐕", kind: "alert",  note: "Hot pavement burns paws. If it's too hot for your hand, it's too hot for them." },
  cat:           { icon: "🐈", kind: "alert",  note: "Hot pavement burns paws." },
  person:        { icon: "🧍", kind: "info",   note: "Everyone in frame needs sun protection." },
  "sports ball": { icon: "⚽", kind: "info",   note: "Active play means longer exposure. Reapply sunscreen." },
  frisbee:       { icon: "🥏", kind: "info",   note: "Extended outdoor play. Watch your burn window." },
  kite:          { icon: "🪁", kind: "info",   note: "Open-sky activity with little shade." },
  surfboard:     { icon: "🏄", kind: "alert",  note: "Water reflects UV upward. Exposure roughly doubles." },
  boat:          { icon: "⛵", kind: "alert",  note: "Water reflects UV. Cover up more than you would on land." },
  "baseball glove": { icon: "⚾", kind: "info", note: "Field time. Plan shade breaks." },
  "tennis racket": { icon: "🎾", kind: "info", note: "Court surfaces reflect heat and UV." },
  skateboard:    { icon: "🛹", kind: "info",   note: "Pavement play. Check surface heat." },
  backpack:      { icon: "🎒", kind: "info",   note: "Pack sunscreen and water." },
  bottle:        { icon: "🍾", kind: "good",   note: "Good — stay hydrated." },
  cup:           { icon: "🥤", kind: "good",   note: "Keep drinking water in this heat." },
  "stop sign":   { icon: "🛑", kind: "info",   note: "Roadside. Expect asphalt heat." },
  "fire hydrant":{ icon: "🚒", kind: "info",   note: "Urban paved area." },
  "traffic light":{ icon: "🚦", kind: "info",  note: "Intersection. Mostly hard surfaces." },
  bird:          { icon: "🐦", kind: "info",   note: "" },
  horse:         { icon: "🐴", kind: "info",   note: "" },
};

const KIND_COLOR = {
  shade: "#4CAF50", green: "#4CAF50", good: "#4CAF50",
  hot: "#FF9F2E", alert: "#F0576B", info: "#0A6CFF",
};

export function meaningFor(label) {
  return MEANING[label] || null;
}

export function kindColor(kind) {
  return KIND_COLOR[kind] || "#0A6CFF";
}

/* Runs the model over a video frame or image element. */
export async function detectObjects(source, { minScore = 0.45, max = 12 } = {}) {
  const model = await loadDetector();
  const raw = await model.detect(source, max);
  return raw
    .filter((d) => d.score >= minScore)
    .map((d) => {
      const m = meaningFor(d.class);
      return {
        label: d.class,
        score: d.score,
        bbox: d.bbox, // [x, y, width, height]
        icon: m?.icon || "•",
        kind: m?.kind || "info",
        note: m?.note || "",
        relevant: !!m,
      };
    });
}

/* Collapses repeated detections into one line per object type, so
   a frame with six cars reads "6 cars" rather than six entries. */
export function summarize(detections) {
  const byLabel = new Map();
  detections.forEach((d) => {
    const cur = byLabel.get(d.label);
    if (cur) { cur.count++; cur.score = Math.max(cur.score, d.score); }
    else byLabel.set(d.label, { ...d, count: 1 });
  });
  return [...byLabel.values()]
    .sort((a, b) => (b.relevant - a.relevant) || (b.count - a.count) || (b.score - a.score));
}

/* Turns detections into advice that reflects the current UV and
   temperature, not just the object list. */
export function detectionAdvice(detections, conditions) {
  const out = [];
  const has = (l) => detections.some((d) => d.label === l);
  const uv = conditions?.uv ?? 0;
  const temp = conditions?.temp ?? 80;

  if (has("umbrella")) {
    out.push({ icon: "⛱️", kind: "shade", text: "There's shade in frame. Use it during peak UV hours." });
  } else if (uv >= 6) {
    out.push({ icon: "☀️", kind: "alert", text: `No shade structure detected and UV is ${uv.toFixed(1)}. Bring your own cover.` });
  }

  if ((has("dog") || has("cat")) && temp >= 85) {
    out.push({ icon: "🐾", kind: "alert", text: `Pavement is dangerous for paws at ${temp}°F. Press the back of your hand to it for seven seconds first.` });
  }

  if (has("boat") || has("surfboard")) {
    out.push({ icon: "🌊", kind: "alert", text: "Water reflects UV back at you. Effective exposure is roughly double." });
  }

  const hotThings = detections.filter((d) => d.kind === "hot");
  if (hotThings.length && temp >= 85) {
    const names = [...new Set(hotThings.map((d) => d.label))].slice(0, 3).join(", ");
    out.push({ icon: "🌡️", kind: "hot", text: `Check before touching: ${names}. Metal in direct sun runs far above the ${temp}°F air temperature.` });
  }

  if (!has("bottle") && !has("cup") && temp >= 90) {
    out.push({ icon: "💧", kind: "info", text: `${temp}°F and no drink in sight. Bring water.` });
  }

  const people = detections.filter((d) => d.label === "person").length;
  if (people >= 2 && uv >= 6) {
    out.push({ icon: "🧴", kind: "info", text: `${people} people in frame. Everyone needs SPF at UV ${uv.toFixed(1)}.` });
  }

  return out;
}
