/* ═══════════════════════════════════════════════════════════════
   store.js — persistence, streaks, and badges.

   Writes to localStorage where it's available and falls back to an
   in-memory object where it isn't (private windows, sandboxed
   previews). Everything reads through the same interface, so the
   app never has to care which one it got.
   ═══════════════════════════════════════════════════════════════ */

const KEY = "sunshield.v1";

let memory = null;

function canUseLocalStorage() {
  try {
    const probe = "__ss__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

const HAS_LS = typeof window !== "undefined" && canUseLocalStorage();

export const EMPTY = {
  profile: { name: "", age: "", email: "", phone: "", skin: "", burn: "", tone: "" },
  place: null,
  days: {},        // "2026-07-29": { protected: true, spf: true, shade: true, scans: 2 }
  scans: [],       // last 20 scan results
  badges: [],      // ids of earned badges
  seenAward: null, // last badge shown on the celebration screen
};

export function load() {
  try {
    const raw = HAS_LS ? window.localStorage.getItem(KEY) : memory;
    if (!raw) return { ...EMPTY };
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return { ...EMPTY, ...parsed, profile: { ...EMPTY.profile, ...(parsed.profile || {}) } };
  } catch {
    return { ...EMPTY };
  }
}

export function save(state) {
  try {
    const raw = JSON.stringify(state);
    if (HAS_LS) window.localStorage.setItem(KEY, raw);
    else memory = raw;
  } catch {
    /* Storage full or blocked. The app keeps working from React state. */
  }
}

export function reset() {
  try {
    if (HAS_LS) window.localStorage.removeItem(KEY);
    memory = null;
  } catch { /* nothing to do */ }
}

export const today = () => new Date().toISOString().slice(0, 10);

export function dayKey(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

/* ── Streaks ──────────────────────────────────────────────────── */

/* Counts back from today for consecutive days with any logged
   protective action. Today not being logged yet doesn't break a
   streak, so the count doesn't reset every morning. */
export function currentStreak(days) {
  let n = 0;
  for (let i = 0; i < 400; i++) {
    const d = days[dayKey(-i)];
    const active = d && (d.spf || d.shade || d.protected);
    if (active) n++;
    else if (i > 0) break;
  }
  return n;
}

export function daysSafeThisWeek(days) {
  let safe = 0;
  for (let i = 0; i < 7; i++) {
    const d = days[dayKey(-i)];
    if (d && (d.spf || d.shade || d.protected)) safe++;
  }
  return safe;
}

export function reminderRate(days) {
  let logged = 0, followed = 0;
  for (let i = 0; i < 7; i++) {
    const d = days[dayKey(-i)];
    if (!d) continue;
    logged++;
    if (d.spf) followed++;
  }
  return logged ? Math.round((followed / logged) * 100) : 0;
}

/* ── Badges ───────────────────────────────────────────────────── */

export const BADGES = [
  { id: "first_scan",  emoji: "🔍", title: "First Look",              blurb: "Ran your first scan",           bg: "#CFE6FA", test: (s) => s.scans.length >= 1 },
  { id: "champion",    emoji: "🏆", title: "Sun Safety Champion",     blurb: "7 days of safe UV habits",      bg: "#D9D6F7", test: (s) => currentStreak(s.days) >= 7 },
  { id: "spf_streak",  emoji: "🧴", title: "SPF Streak",              blurb: "3 days of sunscreen logged",    bg: "#CBF2CF", test: (s) => streakOf(s.days, "spf") >= 3 },
  { id: "uv_expert",   emoji: "🌞", title: "UV Expert",               blurb: "Checked your UV 5 days",        bg: "#FBD9DE", test: (s) => Object.keys(s.days).length >= 5 },
  { id: "shade_seek",  emoji: "🌳", title: "Shade Seeker",            blurb: "Logged shade 3 times",          bg: "#A9E8D5", test: (s) => countOf(s.days, "shade") >= 3 },
  { id: "scanner",     emoji: "📸", title: "Environment Analyst",     blurb: "Completed 5 scans",             bg: "#F0F5A8", test: (s) => s.scans.length >= 5 },
  { id: "thirty",      emoji: "🔒", title: "30-Day Protection Streak", blurb: "Use this app for 30 days!",    bg: "#F7C9D8", test: (s) => currentStreak(s.days) >= 30 },
];

function streakOf(days, field) {
  let n = 0;
  for (let i = 0; i < 400; i++) {
    const d = days[dayKey(-i)];
    if (d && d[field]) n++;
    else if (i > 0) break;
  }
  return n;
}

function countOf(days, field) {
  return Object.values(days).filter((d) => d && d[field]).length;
}

/* Returns the badges now earned and any that are newly unlocked. */
export function evaluateBadges(state) {
  const earned = BADGES.filter((b) => {
    try { return b.test(state); } catch { return false; }
  }).map((b) => b.id);
  const fresh = earned.filter((id) => !state.badges.includes(id));
  return { earned, fresh };
}

export function badgeById(id) {
  return BADGES.find((b) => b.id === id);
}
