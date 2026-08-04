/* ═══════════════════════════════════════════════════════════════
   uv.js — live weather data and sun-exposure math.

   Data comes from Open-Meteo, which is free, needs no API key, and
   allows browser requests. That last part matters: most weather APIs
   block direct calls from a webpage, which would force a backend.
   https://open-meteo.com/en/docs
   ═══════════════════════════════════════════════════════════════ */

const FORECAST = "https://api.open-meteo.com/v1/forecast";
const GEOCODE = "https://geocoding-api.open-meteo.com/v1/search";

export const FALLBACK_PLACE = { name: "Las Vegas", lat: 36.1699, lon: -115.1398 };

/* ── Fitzpatrick skin typing ──────────────────────────────────────
   MED (minimal erythemal dose) is the UV energy needed to redden
   skin, in J/m². These are the standard clinical values. */
const MED = { I: 200, II: 250, III: 300, IV: 450, V: 600, VI: 1000 };

const FITZ_LABEL = {
  I: "Type I", II: "Type II", III: "Type III",
  IV: "Type IV", V: "Type V", VI: "Type VI",
};

/* Maps the two onboarding answers onto a Fitzpatrick type. Tone
   sets the base type and burn frequency nudges it by one, which is
   how the scale is actually defined: type IV is olive skin that
   rarely burns, type I is fair skin that always burns. */
export function fitzpatrick(burn, tone) {
  const base = {
    "Fair, Light Skin": 2, "Medium Skin": 3, "Olive Skin": 4, "Dark Skin": 5,
  }[tone] ?? 3;
  const shift = { Always: -1, Sometimes: 0, Rarely: 0, Never: 1 }[burn] ?? 0;
  const idx = Math.min(6, Math.max(1, base + shift));
  return ["", "I", "II", "III", "IV", "V", "VI"][idx];
}

/* Minutes of unprotected sun before skin starts to burn.

   UV Index 1 == 25 mW/m² of erythemally-weighted irradiance, so
   irradiance = uvi * 0.025 W/m². Time to reach one MED is then
   MED / irradiance seconds. Sanity check: type II skin at UV 8
   gives 250 / (8 * 1.5) ≈ 21 minutes, which matches published
   burn-time tables. */
export function minutesToBurn(fitz, uvi) {
  if (!uvi || uvi <= 0) return Infinity;
  return Math.round(MED[fitz] / (uvi * 1.5));
}

/* SPF multiplies safe exposure time, so the SPF you need is the
   ratio of how long you want to be out to how long you'd last bare. */
export function recommendSPF(fitz, uvi, plannedMinutes = 120) {
  const bare = minutesToBurn(fitz, uvi);
  if (bare === Infinity) return 30;
  /* SPF 30 is the clinical floor for every skin type, so the scale
     starts there rather than at 15. */
  const needed = plannedMinutes / bare;
  return needed <= 2 ? 30 : 50;
}

export function uvCategory(uvi) {
  if (uvi == null) return { label: "Unknown", color: "#8B9096", advice: "No reading yet." };
  if (uvi < 3) return { label: "Low", color: "#4CAF50", advice: "Safe for most people outside." };
  if (uvi < 6) return { label: "Moderate", color: "#FFCC33", advice: "Seek shade near midday." };
  if (uvi < 8) return { label: "High", color: "#FF9F2E", advice: "Cover up and reapply sunscreen." };
  if (uvi < 11) return { label: "Very High", color: "#F4573F", advice: "Minimize sun 10AM–4PM." };
  return { label: "Extreme", color: "#B33FD1", advice: "Avoid direct sun. Skin burns fast." };
}

export function fitzLabel(fitz) {
  return FITZ_LABEL[fitz] || "Type III";
}

/* ── Location ─────────────────────────────────────────────────── */

export function locate() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, name: "Your location" }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 600000 }
    );
  });
}

export async function searchPlace(query) {
  const url = `${GEOCODE}?name=${encodeURIComponent(query)}&count=5&language=en&format=json`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("Place lookup failed");
  const d = await r.json();
  return (d.results || []).map((p) => ({
    name: [p.name, p.admin1, p.country_code].filter(Boolean).join(", "),
    lat: p.latitude,
    lon: p.longitude,
  }));
}

/* ── Forecast ─────────────────────────────────────────────────── */

export async function fetchConditions(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: "temperature_2m,apparent_temperature,cloud_cover,is_day,weather_code",
    hourly: "uv_index,temperature_2m,cloud_cover",
    daily: "uv_index_max,temperature_2m_max,sunrise,sunset",
    temperature_unit: "fahrenheit",
    timezone: "auto",
    forecast_days: 7,
  });

  const r = await fetch(`${FORECAST}?${params}`);
  if (!r.ok) throw new Error(`Weather request failed (${r.status})`);
  const d = await r.json();

  const now = new Date();
  const times = d.hourly.time.map((t) => new Date(t));
  let idx = 0;
  let best = Infinity;
  times.forEach((t, i) => {
    const gap = Math.abs(t - now);
    if (gap < best) { best = gap; idx = i; }
  });

  /* Today's hourly UV, used for the peak window and the chart. */
  const dayStart = idx - now.getHours();
  const today = [];
  for (let h = 0; h < 24; h++) {
    const i = dayStart + h;
    if (i < 0 || i >= d.hourly.uv_index.length) continue;
    today.push({ hour: h, uv: d.hourly.uv_index[i] ?? 0, temp: d.hourly.temperature_2m[i] });
  }

  const risky = today.filter((h) => h.uv >= 6);
  const peak = today.reduce((a, b) => (b.uv > a.uv ? b : a), { hour: 12, uv: 0 });

  return {
    fetchedAt: Date.now(),
    uv: d.hourly.uv_index[idx] ?? 0,
    uvMaxToday: d.daily.uv_index_max?.[0] ?? 0,
    temp: Math.round(d.current.temperature_2m),
    feelsLike: Math.round(d.current.apparent_temperature),
    cloud: d.current.cloud_cover,
    isDay: d.current.is_day === 1,
    sunrise: d.daily.sunrise?.[0],
    sunset: d.daily.sunset?.[0],
    hourly: today,
    peakHour: peak.hour,
    peakUV: peak.uv,
    protectWindow: risky.length
      ? { from: risky[0].hour, to: risky[risky.length - 1].hour + 1 }
      : null,
    week: (d.daily.uv_index_max || []).map((uv, i) => ({
      uv,
      high: Math.round(d.daily.temperature_2m_max[i]),
    })),
  };
}

export function fmtHour(h) {
  const am = h < 12;
  const n = h % 12 === 0 ? 12 : h % 12;
  return `${n}${am ? "AM" : "PM"}`;
}

/* ── Grid readings for the map ────────────────────────────────────
   Open-Meteo accepts comma-separated coordinates in a single
   request, so one call covers the whole grid instead of 25.

   Worth knowing: UV varies only slightly over a few kilometres,
   since it's driven mostly by sun angle, altitude, and cloud. The
   grid is spread wide enough that cloud differences actually show
   up, rather than rendering a uniform blanket that looks fake. */
export async function fetchUVGrid(lat, lon, span = 0.5, steps = 5) {
  const lats = [];
  const lons = [];
  const half = (steps - 1) / 2;

  for (let r = 0; r < steps; r++) {
    for (let c = 0; c < steps; c++) {
      /* Longitude degrees shrink toward the poles, so widen them by
         1/cos(lat) to keep the grid roughly square on the ground. */
      const scale = 1 / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
      lats.push(+(lat + (r - half) * (span / half)).toFixed(4));
      lons.push(+(lon + (c - half) * (span / half) * scale).toFixed(4));
    }
  }

  const params = new URLSearchParams({
    latitude: lats.join(","),
    longitude: lons.join(","),
    current: "uv_index,temperature_2m,cloud_cover",
    temperature_unit: "fahrenheit",
    timezone: "auto",
  });

  const r = await fetch(`${FORECAST}?${params}`);
  if (!r.ok) throw new Error(`Grid request failed (${r.status})`);
  const d = await r.json();

  /* Bulk requests come back as an array, single points as an object.
     Handle both so one changed response shape can't blank the map. */
  const list = Array.isArray(d) ? d : [d];
  const points = list
    .map((p, i) => ({
      lat: p.latitude ?? lats[i],
      lon: p.longitude ?? lons[i],
      uv: p.current?.uv_index,
      temp: Math.round(p.current?.temperature_2m ?? 0),
      cloud: p.current?.cloud_cover ?? 0,
    }))
    .filter((p) => typeof p.uv === "number" && Number.isFinite(p.lat));

  if (!points.length) throw new Error("Grid returned no usable points");
  return points;
}

/* Reverse geocode so the header can name the user's actual place
   instead of showing raw coordinates. */
export async function nameForCoords(lat, lon) {
  try {
    const r = await fetch(`${GEOCODE}?latitude=${lat}&longitude=${lon}&count=1&language=en&format=json`);
    if (!r.ok) return null;
    const d = await r.json();
    const p = d.results?.[0];
    return p ? [p.name, p.admin1].filter(Boolean).join(", ") : null;
  } catch {
    return null;
  }
}
