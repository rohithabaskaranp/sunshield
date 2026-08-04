import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Eye, EyeOff, ChevronRight, ChevronLeft, Check, Pencil, Compass, Award,
  User, Home, Bell, Upload, Send, Plus, Image as ImageIcon, MapPin,
  RefreshCw, AlertCircle, Search, X, Video, Sparkles, Zap,
} from "lucide-react";

import {
  FALLBACK_PLACE, fitzpatrick, fitzLabel, minutesToBurn, recommendSPF,
  uvCategory, locate, searchPlace, fetchConditions, fmtHour,
  fetchUVGrid, nameForCoords,
} from "./lib/uv.js";

import LiveMap from "./LiveMap.jsx";
import LiveScan from "./LiveScan.jsx";
import { detectObjects, summarize, detectionAdvice, loadDetector, kindColor } from "./lib/detect.js";
import { describeScene, enabled as cloudEnabled } from "./lib/cloud.js";

import {
  analyzeImage, surfaceReport, environmentScore, insights, SURFACE_CLASS,
} from "./lib/vision.js";

import {
  load, save, reset, today, dayKey, currentStreak, daysSafeThisWeek,
  reminderRate, evaluateBadges, BADGES, badgeById,
} from "./lib/store.js";

/* ═══════════════════════════════════════════════════════════════
   DESIGN TOKENS
   ═══════════════════════════════════════════════════════════════ */
const C = {
  blue: "#0A6CFF", blueDeep: "#0757CC", blueSoft: "#DEEAFD", panel: "#E9EFFB",
  border: "#DFE3E8", hairline: "#EDEFF2", text: "#15171A", muted: "#8B9096",
  error: "#F0576B", track: "#E6E8EB", grayBtn: "#B7BCC2",
  avatarBg: "#DCE9FB", avatarFg: "#A8CAF6", sun: "#FFC629",
};

const P = {
  pink: "#FBD9DE", green: "#CBF2CF", blue: "#CFE6FA", purple: "#E2D4F7",
  yellow: "#F0F5A8", mint: "#A9E8D5", lilac: "#D9D6F7", rose: "#F7C9D8",
  lemon: "#F6F063", jade: "#8DE8AC", blush: "#FBE4E4",
};

const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif';

const SKIN_TYPES = ["Dry", "Oily", "Combination", "Sensitive", "Normal"];
const BURN_LEVELS = ["Always", "Sometimes", "Rarely", "Never"];
const SKIN_TONES = ["Fair, Light Skin", "Medium Skin", "Olive Skin", "Dark Skin"];

/* ═══════════════════════════════════════════════════════════════
   PRIMITIVES
   ═══════════════════════════════════════════════════════════════ */

function StatusBar({ bg = "#fff" }) {
  const [clock, setClock] = useState(() =>
    new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
  useEffect(() => {
    const id = setInterval(() => setClock(
      new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })), 20000);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{
      background: bg, display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "14px 24px 4px", fontSize: 15, fontWeight: 600, color: C.text,
      letterSpacing: -0.2, flexShrink: 0,
    }}>
      <span>{clock}</span>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 5 }}>
        <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={i * 4.6} y={9 - i * 2.8} width="3" height={3 + i * 2.8} rx="1" fill={C.text} />
          ))}
        </svg>
        <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true">
          <path d="M8 10.5 5.6 7.9a3.4 3.4 0 0 1 4.8 0L8 10.5Z M8 5.2a6.6 6.6 0 0 0-4.7 2L1.8 5.6a8.8 8.8 0 0 1 12.4 0l-1.5 1.6A6.6 6.6 0 0 0 8 5.2Z" fill={C.text} />
        </svg>
        <svg width="26" height="13" viewBox="0 0 26 13" aria-hidden="true">
          <rect x="0.5" y="0.5" width="22" height="12" rx="3.5" stroke={C.text} fill="none" />
          <rect x="2.5" y="2.5" width="18" height="8" rx="2" fill={C.text} />
          <path d="M24 4.5v4a2.2 2.2 0 0 0 0-4Z" fill={C.text} />
        </svg>
      </div>
    </div>
  );
}

function Card({ children, style, fill, onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className={onClick ? "ss-row" : undefined} style={{
      border: `1.5px solid ${C.blue}`, borderRadius: 12, background: fill || "#fff",
      padding: 16, width: onClick ? "100%" : undefined, textAlign: onClick ? "left" : undefined,
      font: onClick ? "inherit" : undefined, cursor: onClick ? "pointer" : undefined,
      fontFamily: FONT, color: C.text, ...style,
    }}>{children}</Tag>
  );
}

function Btn({ children, onClick, variant = "primary", style, disabled }) {
  const bg = disabled ? C.grayBtn
    : variant === "secondary" ? C.grayBtn
    : variant === "outline" ? "#fff" : C.blue;
  return (
    <button onClick={disabled ? undefined : onClick} className="ss-pill" disabled={disabled}
      style={{
        width: "100%", padding: "16px 0", borderRadius: variant === "pill" ? 99 : 10,
        border: variant === "outline" ? `1.5px solid ${C.blue}` : "none",
        background: variant === "pill" ? (disabled ? C.grayBtn : C.blue) : bg,
        color: variant === "outline" ? C.blue : "#fff", fontSize: 15, fontWeight: 700,
        fontFamily: FONT, cursor: disabled ? "default" : "pointer", ...style,
      }}>{children}</button>
  );
}

function ProgressBar({ pct }) {
  return (
    <div role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}
      style={{ height: 8, borderRadius: 99, background: C.track, overflow: "hidden" }}>
      <div className="ss-bar" style={{ width: `${pct}%`, height: "100%", borderRadius: 99, background: C.blue }} />
    </div>
  );
}

function Field({ label, value, onChange, error, type = "text", placeholder, onEnter }) {
  const [focused, setFocused] = useState(false);
  const bc = error ? C.error : focused ? C.blue : C.border;
  return (
    <div>
      {label && <label style={{ display: "block", fontSize: 14, color: C.text, marginBottom: 8 }}>{label}</label>}
      <input type={type} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} className="ss-input"
        style={{
          width: "100%", boxSizing: "border-box", padding: "15px 16px", fontSize: 15,
          fontFamily: FONT, color: C.text, background: "#fff",
          border: `${focused || error ? 2 : 1}px solid ${bc}`, borderRadius: 11, outline: "none",
        }} />
      {error && <p style={{ margin: "6px 0 0", fontSize: 12.5, color: C.error }}>{error}</p>}
    </div>
  );
}

function OptionRow({ label, selected, onClick, sub }) {
  return (
    <button role="radio" aria-checked={selected} onClick={onClick} className="ss-option"
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
        padding: "15px 18px", borderRadius: 11,
        border: `1px solid ${selected ? "transparent" : C.border}`,
        background: selected ? C.blueSoft : "#fff", fontFamily: FONT, fontSize: 15,
        color: C.text, cursor: "pointer", textAlign: "left",
      }}>
      <span>{label}{sub && <span style={{ display: "block", fontSize: 12.5, color: C.muted, marginTop: 2 }}>{sub}</span>}</span>
      {selected && <Check size={19} color={C.blue} strokeWidth={3} />}
    </button>
  );
}

function Ring({ pct, size = 150, suffix = "%", tint }) {
  const blades = 12;
  const lit = Math.round((pct / 100) * blades);
  return (
    <div style={{ position: "relative", width: size, height: size, margin: "0 auto" }}>
      <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
        {Array.from({ length: blades }).map((_, i) => (
          <rect key={i} x="46.5" y="6" width="7" height="21" rx="3.5"
            fill={i < lit ? (tint || `hsl(218, 100%, ${38 + i * 2.4}%)`) : "hsl(218, 100%, 88%)"}
            transform={`rotate(${i * 30} 50 50)`} />
        ))}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
        <span style={{ fontSize: size * 0.26, fontWeight: 700, color: C.text, letterSpacing: -1 }}>
          {Math.round(pct)}{suffix}
        </span>
      </div>
    </div>
  );
}

function Sunny({ size = 76, pose = "wave" }) {
  return (
    <div aria-label="Sunny, your SunShield guide" style={{
      width: size, height: size, borderRadius: 18, flexShrink: 0, background: "#FDF3D6",
      display: "grid", placeItems: "center", fontSize: size * 0.5, lineHeight: 1, userSelect: "none",
    }}>{pose === "wave" ? "🙋‍♂️" : pose === "thumb" ? "👍" : "😎"}</div>
  );
}

function Header({ title, onBack, right, big, sub }) {
  return (
    <div style={{ position: "relative", padding: big ? "6px 20px 6px" : "8px 20px 10px", flexShrink: 0 }}>
      {onBack && (
        <button onClick={onBack} aria-label="Back" className="ss-link"
          style={{ position: "absolute", left: 14, top: 6, background: "none", border: "none", cursor: "pointer", padding: 6, zIndex: 2 }}>
          <ChevronLeft size={24} color={C.blue} strokeWidth={2.6} />
        </button>
      )}
      <h1 style={{
        margin: 0, textAlign: "center", color: C.text, letterSpacing: big ? -1 : -0.2,
        fontSize: big ? 30 : 16, fontWeight: big ? 500 : 700, lineHeight: 1.15,
        padding: onBack ? "0 34px" : 0,
      }}>{title}</h1>
      {sub && <p style={{ margin: "2px 0 0", textAlign: "center", fontSize: 13, color: C.muted }}>{sub}</p>}
      {right && <div style={{ position: "absolute", right: 18, top: 8 }}>{right}</div>}
    </div>
  );
}

const TABS = [
  { id: "home", label: "Home", Icon: Home },
  { id: "map", label: "UV Map", Icon: Compass },
  { id: "ai", label: "Sunny", Icon: Pencil },
  { id: "awards", label: "Awards", Icon: Award },
  { id: "profile", label: "Profile", Icon: User },
];

function TabBar({ active, go }) {
  return (
    <nav style={{ display: "flex", borderTop: `1px solid ${C.hairline}`, padding: "9px 0 18px", flexShrink: 0, background: "#fff" }}>
      {TABS.map(({ id, label, Icon }) => {
        const on = id === active;
        return (
          <button key={id} onClick={() => go(id)} className="ss-link" aria-current={on ? "page" : undefined}
            style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
              background: "none", border: "none", cursor: "pointer", fontFamily: FONT,
              fontSize: 10.5, fontWeight: on ? 700 : 500, color: on ? C.blue : "#A9AEB5",
            }}>
            <Icon size={20} color={on ? C.blue : "#C2C7CE"} strokeWidth={on ? 2.4 : 2} fill={on ? C.blue : "none"} />
            {label}
          </button>
        );
      })}
    </nav>
  );
}

function Body({ children, style }) {
  return (
    <div className="ss-scroll" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", ...style }}>
      {children}
    </div>
  );
}

function Spinner({ size = 16, color = C.blue }) {
  return <span className="ss-spin" style={{
    width: size, height: size, borderRadius: 99, display: "inline-block",
    border: `2px solid ${color}33`, borderTopColor: color,
  }} />;
}

/* ═══════════════════════════════════════════════════════════════
   ONBOARDING
   ═══════════════════════════════════════════════════════════════ */

function Logo() {
  return (
    <svg width="150" height="150" viewBox="0 0 150 150" aria-label="SunShield">
      <g stroke={C.sun} strokeWidth="5" strokeLinecap="round">
        {[-70, -50, -30, -10, 10, 30, 50, 70].map((deg) => {
          const r = (deg * Math.PI) / 180;
          return <line key={deg}
            x1={75 - Math.sin(r) * 34} y1={52 - Math.cos(r) * 34}
            x2={75 - Math.sin(r) * 47} y2={52 - Math.cos(r) * 47} />;
        })}
      </g>
      <circle cx="75" cy="52" r="27" fill={C.sun} />
      <path d="M75 40c14 7 26 8 26 8s2 34-26 48c-28-14-26-48-26-48s12-1 26-8Z"
        fill="#3A8DE8" stroke="#1667C9" strokeWidth="4" strokeLinejoin="round" />
      <path d="M75 44v50" stroke="#1667C9" strokeWidth="3" opacity="0.5" />
    </svg>
  );
}

function Login({ go, profile, patch }) {
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");

  const submit = () => {
    if (!profile.email.includes("@") || !profile.email.includes(".")) {
      return setErr("Enter your email as name@example.com");
    }
    if (pw.length < 6) return setErr("Passwords are at least 6 characters");
    setErr("");
    go("profile");
  };

  return (
    <Body>
      <div style={{ background: C.panel, padding: "18px 0 30px", display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
        <Logo />
        <span style={{ marginTop: -14, fontSize: 40, fontWeight: 700, color: C.blue, fontStyle: "italic", letterSpacing: -1 }}>SunShield</span>
      </div>
      <div style={{ padding: "24px 30px 34px" }}>
        <h1 style={{ margin: "0 0 20px", fontSize: 23, fontWeight: 800, lineHeight: 1.32, textAlign: "center", color: C.text, letterSpacing: -0.4 }}>
          Welcome!<br />“Protect your skin.<br />Every day.”
        </h1>
        <div style={{ display: "grid", gap: 14 }}>
          <Field value={profile.email} onChange={(v) => patch({ email: v })} placeholder="Email Address" type="email" />
          <div style={{ position: "relative" }}>
            <Field value={pw} onChange={setPw} placeholder="Password" type={show ? "text" : "password"} onEnter={submit} />
            <button onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}
              style={{ position: "absolute", right: 14, top: 15, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              {show ? <Eye size={19} color={C.muted} /> : <EyeOff size={19} color={C.muted} />}
            </button>
          </div>
        </div>
        <button className="ss-link" style={{ display: "block", margin: "12px 0 0", padding: 0, background: "none", border: "none", color: C.blue, fontSize: 13.5, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}>
          Forgot password?
        </button>
        {err && <p style={{ margin: "12px 0 0", fontSize: 13, color: C.error }}>{err}</p>}
        <div style={{ marginTop: 20 }}><Btn variant="pill" onClick={submit}>Login</Btn></div>
        <p style={{ margin: "16px 0 0", textAlign: "center", fontSize: 13.5, color: C.muted }}>
          Not a member?{" "}
          <button className="ss-link" onClick={() => go("profile")}
            style={{ background: "none", border: "none", padding: 0, color: C.blue, fontSize: 13.5, fontWeight: 700, fontFamily: FONT, cursor: "pointer" }}>
            Register now
          </button>
        </p>
        <div style={{ height: 1, background: C.hairline, margin: "22px 0 16px" }} />
        <p style={{ margin: "0 0 14px", textAlign: "center", fontSize: 13.5, color: C.muted }}>Or continue with</p>
        <div style={{ display: "flex", justifyContent: "center", gap: 16 }}>
          {[{ id: "Google", bg: "#EA4335", g: "G" }, { id: "Apple", bg: "#161617", g: "A" }, { id: "Facebook", bg: "#1877F2", g: "f" }].map((p) => (
            <button key={p.id} aria-label={`Continue with ${p.id}`} className="ss-social" onClick={() => go("profile")}
              style={{ width: 42, height: 42, borderRadius: 99, border: "none", background: p.bg, color: "#fff", fontSize: 19, fontWeight: 700, fontFamily: FONT, cursor: "pointer" }}>
              {p.g}
            </button>
          ))}
        </div>
      </div>
    </Body>
  );
}

function CreateProfile({ go, profile, patch, editing }) {
  const [errors, setErrors] = useState({});
  const submit = () => {
    const e = {};
    if (!profile.name.trim()) e.name = "Add your name";
    if (!profile.age.trim()) e.age = "Add your age";
    if (!profile.email.includes("@") || !profile.email.includes(".")) e.email = "Enter your email as name@example.com";
    if (profile.phone.replace(/\D/g, "").length < 10) e.phone = "Enter a 10-digit phone number";
    setErrors(e);
    if (!Object.keys(e).length) go(editing ? "settings" : "skintype");
  };
  return (
    <Body style={{ padding: "16px 26px 30px" }}>
      {!editing && <ProgressBar pct={25} />}
      <h1 style={{ margin: editing ? "4px 0 16px" : "28px 0 16px", fontSize: 25, fontWeight: 800, color: "#232323", letterSpacing: -0.5 }}>
        {editing ? "Edit Your Profile" : "Create Your Profile"}
      </h1>
      <div style={{ border: "1.5px dashed #C9CDD4", borderRadius: 14, padding: "22px 20px 26px", display: "grid", gap: 16 }}>
        <Field label="Name" value={profile.name} onChange={(v) => patch({ name: v })} error={errors.name} />
        <Field label="Age" value={profile.age} onChange={(v) => patch({ age: v })} error={errors.age} />
        <Field label="Email" value={profile.email} onChange={(v) => patch({ email: v })} error={errors.email} type="email" />
        <Field label="Phone Number" value={profile.phone} onChange={(v) => patch({ phone: v })} error={errors.phone} type="tel" />
      </div>
      <div style={{ flex: 1, minHeight: 26 }} />
      <Btn variant="pill" onClick={submit}>{editing ? "Save" : "Continue"}</Btn>
    </Body>
  );
}

function SkinType({ go, profile, patch, editing }) {
  return (
    <Body style={{ padding: "16px 22px 30px" }}>
      {!editing && <ProgressBar pct={50} />}
      <h1 style={{ margin: editing ? "4px 0 8px" : "30px 0 8px", fontSize: 25, fontWeight: 800, lineHeight: 1.24, color: "#232323", letterSpacing: -0.5 }}>
        Personalize your<br />experience
      </h1>
      <p style={{ margin: "0 0 24px", fontSize: 14.5, color: C.muted }}>What best describes your skin?</p>
      <div role="radiogroup" aria-label="Skin type" style={{ display: "grid", gap: 10 }}>
        {SKIN_TYPES.map((t) => <OptionRow key={t} label={t} selected={profile.skin === t} onClick={() => patch({ skin: t })} />)}
      </div>
      <div style={{ flex: 1, minHeight: 30 }} />
      <Btn variant="pill" onClick={() => go(editing ? "settings" : "burntone")} disabled={!profile.skin}>
        {editing ? "Save" : "Next"}
      </Btn>
    </Body>
  );
}

/* The Figma had both questions in one selection group, which made
   two answers look mutually exclusive. Split into labelled groups. */
function BurnTone({ go, profile, patch, editing }) {
  const ready = profile.burn && profile.tone;
  const fitz = ready ? fitzpatrick(profile.burn, profile.tone) : null;
  return (
    <Body style={{ padding: "16px 22px 30px" }}>
      {!editing && <ProgressBar pct={75} />}
      <h1 style={{ margin: editing ? "4px 0 20px" : "28px 0 20px", fontSize: 23, fontWeight: 800, lineHeight: 1.26, color: "#232323", letterSpacing: -0.5 }}>
        How easily do you burn<br />and what color is your skin?
      </h1>
      <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700, color: C.muted, letterSpacing: 0.3 }}>HOW OFTEN YOU BURN</p>
      <div role="radiogroup" aria-label="How often you burn" style={{ display: "grid", gap: 9 }}>
        {BURN_LEVELS.map((t) => <OptionRow key={t} label={t} selected={profile.burn === t} onClick={() => patch({ burn: t })} />)}
      </div>
      <p style={{ margin: "22px 0 10px", fontSize: 13, fontWeight: 700, color: C.muted, letterSpacing: 0.3 }}>YOUR SKIN TONE</p>
      <div role="radiogroup" aria-label="Skin tone" style={{ display: "grid", gap: 9 }}>
        {SKIN_TONES.map((t) => <OptionRow key={t} label={t} selected={profile.tone === t} onClick={() => patch({ tone: t })} />)}
      </div>
      {fitz && (
        <p style={{ margin: "16px 0 0", fontSize: 13.5, color: C.muted, textAlign: "center" }}>
          That puts you at Fitzpatrick {fitzLabel(fitz)}.
        </p>
      )}
      <div style={{ flex: 1, minHeight: 20 }} />
      <div style={{ marginTop: 20 }}>
        <Btn variant="pill" onClick={() => go(editing ? "settings" : "results")} disabled={!ready}>
          {editing ? "Save" : "Generate Profile"}
        </Btn>
      </div>
    </Body>
  );
}

/* Risk now comes from the live UV reading and the Fitzpatrick type,
   not a lookup table. */
function Results({ go, profile, conditions, loading }) {
  const fitz = fitzpatrick(profile.burn, profile.tone);
  const uv = conditions?.uvMaxToday ?? conditions?.uv ?? 0;
  const burnMin = minutesToBurn(fitz, uv);
  const spf = recommendSPF(fitz, uv);
  const cat = uvCategory(uv);

  return (
    <Body style={{ padding: "6px 22px 30px" }}>
      <p style={{ margin: "0 0 14px", textAlign: "center", fontSize: 14, fontWeight: 700, color: C.text }}>Personalized Results</p>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, lineHeight: 1.15, color: C.text, letterSpacing: -0.8 }}>
          {burnMin <= 25 ? "Your skin needs extra UV protection!" : "Here's your sun profile"}
        </h1>
        <Sunny size={92} />
      </div>

      <div style={{ display: "grid", gap: 13 }}>
        <Card>
          <p style={{ margin: "0 0 2px", fontSize: 13, color: C.text }}>Risk Level {loading && <Spinner size={11} />}</p>
          <p style={{ margin: "0 0 2px", fontSize: 30, fontWeight: 700, letterSpacing: -0.6, color: cat.color }}>
            {cat.label.toUpperCase()}
          </p>
          <p style={{ margin: 0, fontSize: 14, color: C.text }}>{cat.advice}</p>
        </Card>
        <Card>
          <p style={{ margin: "0 0 2px", fontSize: 13, color: C.text }}>Recommended SPF:</p>
          <p style={{ margin: "0 0 2px", fontSize: 30, fontWeight: 700, letterSpacing: -0.6, color: C.text }}>SPF {spf}+</p>
          <p style={{ margin: 0, fontSize: 14, color: C.text }}>Broad-spectrum protection is best!</p>
        </Card>
        <Card>
          <p style={{ margin: "0 0 2px", fontSize: 13, color: C.text }}>Time to burn, unprotected:</p>
          <p style={{ margin: "0 0 2px", fontSize: 30, fontWeight: 700, letterSpacing: -0.6, color: C.text }}>
            {burnMin === Infinity ? "—" : `${burnMin} min`}
          </p>
          <p style={{ margin: 0, fontSize: 14, color: C.text }}>
            Fitzpatrick {fitzLabel(fitz)} at today's peak UV of {uv.toFixed(1)}.
          </p>
        </Card>
        <Card>
          <p style={{ margin: "0 0 4px", fontSize: 14, color: C.text }}>Tip from Sunny:</p>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: C.text }}>
            Even on cloudy days, up to 80% of UV rays can reach your skin!
          </p>
        </Card>
      </div>
      <div style={{ flex: 1, minHeight: 26 }} />
      <Btn onClick={() => go("home")} style={{ borderRadius: 12 }}>Go to Dashboard</Btn>
    </Body>
  );
}

/* ═══════════════════════════════════════════════════════════════
   DASHBOARD — live conditions, habit logging
   ═══════════════════════════════════════════════════════════════ */

function ConditionsError({ onRetry, onPick }) {
  return (
    <Card style={{ borderColor: C.error, padding: "16px 14px", marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <AlertCircle size={20} color={C.error} style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ flex: 1 }}>
          <p style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 700, color: C.text }}>Couldn't reach the weather service</p>
          <p style={{ margin: "0 0 10px", fontSize: 13.5, lineHeight: 1.45, color: C.muted }}>
            Check your connection, or set your location manually.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onRetry} className="ss-link" style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${C.blue}`, background: "#fff", color: C.blue, fontSize: 13, fontWeight: 700, fontFamily: FONT, cursor: "pointer" }}>Retry</button>
            <button onClick={onPick} className="ss-link" style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: "#fff", color: C.text, fontSize: 13, fontFamily: FONT, cursor: "pointer" }}>Set location</button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Dashboard({ go, state, conditions, loading, error, refresh, toggleHabit, place }) {
  const first = state.profile.name.trim().split(" ")[0] || "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good Morning" : hour < 18 ? "Good Afternoon" : "Good Evening";
  const fitz = fitzpatrick(state.profile.burn, state.profile.tone);
  const uv = conditions?.uv ?? null;
  const cat = uvCategory(uv);
  const burnMin = uv ? minutesToBurn(fitz, uv) : null;
  const spf = uv ? recommendSPF(fitz, Math.max(uv, conditions?.uvMaxToday ?? uv)) : 30;
  const log = state.days[today()] || {};
  const streak = currentStreak(state.days);

  const win = conditions?.protectWindow;

  return (
    <Body style={{ padding: "0 20px 26px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "2px 0 10px" }}>
        <span style={{ fontSize: 30, lineHeight: 1 }}>🌞</span>
        <div style={{ textAlign: "center", marginTop: 12 }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>{greeting}, {first}</p>
          <button onClick={() => go("place")} className="ss-link" style={{ margin: "2px 0 0", background: "none", border: "none", padding: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, fontFamily: FONT, fontSize: 12.5, color: C.muted }}>
            <MapPin size={12} /> {place?.name || "Set location"}
          </button>
        </div>
        <button onClick={() => go("notifications")} aria-label="Notifications" className="ss-link"
          style={{ background: "none", border: "none", cursor: "pointer", position: "relative", padding: 2 }}>
          <Bell size={26} color={C.blue} fill={C.blue} />
          {uv >= 6 && <span style={{ position: "absolute", top: 0, right: 0, width: 9, height: 9, borderRadius: 99, background: "#F0576B" }} />}
        </button>
      </div>

      {error && <ConditionsError onRetry={refresh} onPick={() => go("place")} />}

      <Card style={{ padding: "18px", marginBottom: 12, borderColor: uv != null ? cat.color : C.blue }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>
            UV Index: {loading ? "…" : uv != null ? `${uv.toFixed(1)} (${cat.label.toUpperCase()})` : "—"}
          </p>
          <button onClick={refresh} aria-label="Refresh conditions" className="ss-link" style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
            {loading ? <Spinner /> : <RefreshCw size={15} color={C.muted} />}
          </button>
        </div>
        <div style={{ height: 8, borderRadius: 99, background: C.track, overflow: "hidden", marginBottom: 10 }}>
          <div className="ss-bar" style={{ width: `${Math.min(100, ((uv || 0) / 12) * 100)}%`, height: "100%", background: cat.color, borderRadius: 99 }} />
        </div>
        <p style={{ margin: 0, fontSize: 14, color: C.text }}>{cat.advice}</p>
        {burnMin != null && burnMin !== Infinity && (
          <p style={{ margin: "8px 0 0", fontSize: 13.5, color: C.muted }}>
            Your skin starts to burn in about <strong style={{ color: C.text }}>{burnMin} minutes</strong> unprotected.
            SPF {spf} extends that to roughly {Math.round(burnMin * spf / 60)} hours.
          </p>
        )}
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <Card style={{ padding: 14 }}>
          <p style={{ margin: "0 0 4px", fontSize: 21, fontWeight: 700, letterSpacing: -0.5, color: C.text }}>Temperature</p>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.45, color: C.text }}>
            {conditions ? `${conditions.temp} degrees Fahrenheit` : "—"}<br />
            {conditions ? `Feels like ${conditions.feelsLike} degrees` : ""}
          </p>
        </Card>
        <Card style={{ padding: 14 }}>
          <p style={{ margin: "0 0 4px", fontSize: 21, fontWeight: 700, letterSpacing: -0.5, color: C.text }}>Sun Protection</p>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.45, color: C.text }}>
            {win ? `${fmtHour(win.from)}–${fmtHour(win.to)}` : "No high-UV window"}<br />
            {win ? "Seek shade during these hours." : "Low risk across the day."}
          </p>
        </Card>
      </div>

      {/* Hourly UV, straight from the forecast */}
      {conditions?.hourly?.length > 0 && (
        <Card style={{ padding: "14px 12px", marginBottom: 12 }}>
          <p style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700, color: C.text }}>Today's UV by hour</p>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 74 }}>
            {conditions.hourly.filter((h) => h.hour >= 6 && h.hour <= 20).map((h) => {
              const c = uvCategory(h.uv);
              const now = new Date().getHours() === h.hour;
              return (
                <div key={h.hour} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  <div title={`${fmtHour(h.hour)}: UV ${h.uv.toFixed(1)}`} style={{
                    width: "100%", height: `${Math.max(3, (h.uv / 12) * 54)}px`,
                    background: c.color, borderRadius: 3,
                    outline: now ? `2px solid ${C.text}` : "none", outlineOffset: 1,
                  }} />
                  {h.hour % 4 === 0 && <span style={{ fontSize: 8.5, color: C.muted }}>{fmtHour(h.hour)}</span>}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Habit logging — this is what drives streaks and badges */}
      <Card style={{ padding: "16px 14px", marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.text }}>Today's habits</p>
          {streak > 0 && <span style={{ fontSize: 12.5, fontWeight: 700, color: C.blue }}>{streak} day streak 🔥</span>}
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {[
            { k: "spf", label: `Applied SPF ${spf}+` },
            { k: "shade", label: "Stayed in shade at peak UV" },
            { k: "protected", label: "Wore hat or sunglasses" },
          ].map((h) => (
            <button key={h.k} onClick={() => toggleHabit(h.k)} className="ss-option"
              style={{
                display: "flex", alignItems: "center", gap: 11, width: "100%", padding: "11px 13px",
                borderRadius: 10, border: `1px solid ${log[h.k] ? "transparent" : C.border}`,
                background: log[h.k] ? C.blueSoft : "#fff", cursor: "pointer",
                fontFamily: FONT, fontSize: 14, color: C.text, textAlign: "left",
              }}>
              <span style={{
                width: 20, height: 20, borderRadius: 6, flexShrink: 0, display: "grid", placeItems: "center",
                background: log[h.k] ? C.blue : "#fff", border: log[h.k] ? "none" : `1.5px solid ${C.border}`,
              }}>{log[h.k] && <Check size={13} color="#fff" strokeWidth={3.4} />}</span>
              {h.label}
            </button>
          ))}
        </div>
      </Card>

      <Card style={{ padding: "18px 16px", display: "flex", gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1, fontSize: 13.5, lineHeight: 1.5, color: C.text }}>
          <p style={{ margin: "0 0 10px", fontWeight: 700 }}>Recommended Today:</p>
          <p style={{ margin: "0 0 10px" }}>Wear SPF {spf}+<br />Apply 15 min before going out.</p>
          <p style={{ margin: "0 0 10px" }}>
            {win ? `Stay in shade ${fmtHour(win.from)}–${fmtHour(win.to)}` : "UV stays manageable today"}<br />
            {conditions ? `UV peaks at ${fmtHour(conditions.peakHour)} (${conditions.peakUV.toFixed(1)}).` : ""}
          </p>
          <p style={{ margin: 0 }}>Wear sunglasses.<br />Protect your eyes!</p>
        </div>
        <Sunny size={84} pose="thumb" />
      </Card>

      <div style={{ display: "grid", gap: 10 }}>
        <Btn onClick={() => go("envscan")} style={{ borderRadius: 12 }}>Scan My Environment</Btn>
        <Btn variant="outline" onClick={() => go("surface")} style={{ borderRadius: 12 }}>Check Surface Heat</Btn>
      </div>
    </Body>
  );
}

/* ── Location picker ──────────────────────────────────────────── */

function PlacePicker({ go, place, setPlace, useMyLocation }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const run = async () => {
    if (!q.trim()) return;
    setBusy(true); setErr(""); setResults([]);
    try {
      const r = await searchPlace(q.trim());
      setResults(r);
      if (!r.length) setErr("No matches. Try a city name.");
    } catch {
      setErr("Search failed. Check your connection.");
    }
    setBusy(false);
  };

  return (
    <Body style={{ padding: "0 20px 24px" }}>
      <Header title="Your Location" onBack={() => go("home")} />
      <p style={{ margin: "0 0 16px", fontSize: 14, color: C.muted, textAlign: "center" }}>
        UV and temperature readings are pulled for this spot.
      </p>

      <Btn variant="outline" onClick={useMyLocation} style={{ borderRadius: 12, marginBottom: 16 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <MapPin size={16} /> Use my current location
        </span>
      </Btn>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <Field value={q} onChange={setQ} placeholder="Search a city" onEnter={run} />
        </div>
        <button onClick={run} aria-label="Search" className="ss-social" style={{
          width: 50, borderRadius: 11, border: "none", background: C.blue,
          display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0,
        }}>{busy ? <Spinner color="#fff" /> : <Search size={18} color="#fff" />}</button>
      </div>

      {err && <p style={{ margin: "0 0 12px", fontSize: 13.5, color: C.error }}>{err}</p>}

      <div style={{ display: "grid", gap: 9 }}>
        {results.map((r) => (
          <OptionRow key={`${r.lat},${r.lon}`} label={r.name}
            selected={place && Math.abs(place.lat - r.lat) < 0.01 && Math.abs(place.lon - r.lon) < 0.01}
            onClick={() => { setPlace(r); go("home"); }} />
        ))}
      </div>

      {place && !results.length && (
        <p style={{ margin: "16px 0 0", fontSize: 13.5, color: C.muted, textAlign: "center" }}>
          Currently using {place.name}.
        </p>
      )}
    </Body>
  );
}

/* Notifications are generated from the actual forecast. */
function Notifications({ go, conditions, state }) {
  const items = [];
  const win = conditions?.protectWindow;
  const fitz = fitzpatrick(state.profile.burn, state.profile.tone);

  if (win) {
    items.push({ emoji: "☀️", lines: ["High UV Expected", `${fmtHour(win.from)} to ${fmtHour(win.to)}!`] });
  }
  if (conditions) {
    const burn = minutesToBurn(fitz, conditions.peakUV);
    if (burn !== Infinity && burn < 30) {
      items.push({ emoji: "⏱️", lines: ["Short Burn Window", `Your skin burns in ~${burn} min at peak UV.`] });
    }
    items.push({ emoji: "🧴", lines: ["Sunscreen Reminder!", "Reapply sunscreen every 2 hours."] });
    items.push({
      emoji: conditions.cloud > 60 ? "☁️" : "🌤️",
      lines: ["Weather Update", `${conditions.cloud > 60 ? "Cloudy" : "Clear"} skies, ${conditions.temp}°F.`,
        conditions.cloud > 60 ? "Clouds don't block UV." : `UV peaks at ${fmtHour(conditions.peakHour)}.`],
    });
  }
  if (!items.length) {
    items.push({ emoji: "📡", lines: ["No readings yet", "Set your location to get alerts."] });
  }

  return (
    <Body style={{ padding: "0 20px 26px" }}>
      <Header title="Notifications" onBack={() => go("home")} />
      <div style={{ display: "grid", gap: 14, marginTop: 10 }}>
        {items.map((n, i) => (
          <Card key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 14px" }}>
            <span style={{ fontSize: 38, lineHeight: 1 }}>{n.emoji}</span>
            <div style={{ flex: 1, textAlign: "center", fontSize: 14.5, lineHeight: 1.45, color: C.text }}>
              {n.lines.map((l) => <div key={l}>{l}</div>)}
            </div>
          </Card>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 30 }} />
      <Btn onClick={() => go("tips")} style={{ borderRadius: 12 }}>View Protection Tips</Btn>
    </Body>
  );
}

function ProtectionTips({ go, conditions, state }) {
  const fitz = fitzpatrick(state.profile.burn, state.profile.tone);
  const spf = recommendSPF(fitz, conditions?.uvMaxToday ?? 6);
  const win = conditions?.protectWindow;
  const tips = [
    { emoji: "🧴", title: "Sunscreen", body: `Use SPF ${spf}+ or higher and reapply every 2 hours.`, bg: P.purple },
    { emoji: "🕶️", title: "Sunglasses", body: "Wear UV-blocking sunglasses to protect your eyes.", bg: P.pink },
    { emoji: "🧢", title: "Hat", body: "Wear a wide-brimmed hat to shade your face and neck.", bg: P.green },
    { emoji: "🌳", title: "Shade", body: win ? `Seek shade between ${fmtHour(win.from)}–${fmtHour(win.to)} when UV rays are the strongest.` : "Seek shade when the sun is directly overhead.", bg: P.lilac },
    { emoji: "💧", title: "Hydration", body: "Drink plenty of water to stay cool and keep your skin healthy.", bg: P.yellow },
  ];
  return (
    <Body style={{ padding: "0 20px 26px" }}>
      <Header title="Protection Tips" onBack={() => go("home")} sub="Simple steps to keep your skin safe from the sun!" />
      <div style={{ display: "grid", gap: 12, marginTop: 8 }}>
        {tips.map((t) => (
          <Card key={t.title} fill={t.bg} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 12px" }}>
            <span style={{ fontSize: 34, lineHeight: 1 }}>{t.emoji}</span>
            <div style={{ flex: 1, textAlign: "center" }}>
              <p style={{ margin: "0 0 2px", fontSize: 14.5, fontWeight: 700, color: C.text }}>{t.title}</p>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.4, color: C.text }}>{t.body}</p>
            </div>
          </Card>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 22 }} />
      <Btn onClick={() => go("badges")} style={{ borderRadius: 12 }}>Go To Your Awards!</Btn>
    </Body>
  );
}

function UVMap({ go, conditions, place, state, grid, gridLoading, gridError, loadGrid }) {
  const uv = conditions?.uv;
  const cat = uvCategory(uv);
  const fitz = fitzpatrick(state.profile.burn, state.profile.tone);
  const [picked, setPicked] = useState(null);

  const legend = [
    { c: "#4CAF50", label: "Low (0–2)", lo: 0, hi: 3 },
    { c: "#FFCC33", label: "Moderate (3–5)", lo: 3, hi: 6 },
    { c: "#FF9F2E", label: "High (6–8)", lo: 6, hi: 8 },
    { c: "#F4573F", label: "Extreme (9–11+)", lo: 8, hi: 99 },
  ];

  const shown = picked || (conditions ? { uv: conditions.uv, temp: conditions.temp, cloud: conditions.cloud } : null);

  return (
    <Body>
      <Header title="UV Exposure Map" onBack={() => go("home")}
        sub={place?.name || "No location set"}
        right={
          <button onClick={loadGrid} aria-label="Refresh map readings" className="ss-link"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
            {gridLoading ? <Spinner size={14} /> : <RefreshCw size={15} color={C.muted} />}
          </button>
        } />

      {place && (
        <LiveMap lat={place.lat} lon={place.lon} height={330} grid={grid}
          onPointSelect={setPicked} />
      )}

      <div style={{ background: "#fff", borderRadius: "18px 18px 0 0", marginTop: -18, padding: "18px 22px 0", position: "relative", flex: 1, display: "flex", flexDirection: "column", zIndex: 900 }}>
        {gridError && (
          <p style={{ margin: "0 0 10px", fontSize: 13, color: C.error }}>
            Couldn't load area readings. The map still shows your location.
          </p>
        )}

        {picked && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, padding: "9px 12px", background: C.blueSoft, borderRadius: 10 }}>
            <span style={{ fontSize: 13.5, color: C.text }}>
              Selected point: UV {picked.uv.toFixed(1)}, {picked.temp}°F, {picked.cloud}% cloud
            </span>
            <button onClick={() => setPicked(null)} aria-label="Clear selection" className="ss-link"
              style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
              <X size={15} color={C.muted} />
            </button>
          </div>
        )}

        <p style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 700, color: C.text }}>Color Legend:</p>
        <div style={{ display: "grid", gap: 6 }}>
          {legend.map((l) => {
            const active = shown?.uv != null && shown.uv >= l.lo && shown.uv < l.hi;
            return (
              <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: active ? 700 : 400 }}>
                <span style={{ width: 15, height: 15, borderRadius: 99, background: l.c }} />
                <span style={{ fontSize: 14.5, color: C.text }}>{l.label}</span>
                {active && <span style={{ fontSize: 12, color: C.blue, fontWeight: 700 }}>← {picked ? "selected" : "you are here"}</span>}
              </div>
            );
          })}
        </div>

        {shown?.uv != null && (
          <p style={{ margin: "14px 0 0", fontSize: 13.5, lineHeight: 1.5, color: C.muted }}>
            {cat.advice} At UV {shown.uv.toFixed(1)} your skin burns in about {minutesToBurn(fitz, shown.uv)} minutes unprotected.
          </p>
        )}

        <p style={{ margin: "10px 0 0", fontSize: 12, lineHeight: 1.5, color: C.muted }}>
          {grid.length
            ? `${grid.length} live readings across the area. Tap a circle for its numbers.`
            : "Loading area readings…"}
        </p>

        <div style={{ flex: 1, minHeight: 16 }} />
        <div style={{ paddingBottom: 20 }}>
          <Btn variant="outline" onClick={() => go("tips")}>Safety Tips</Btn>
        </div>
      </div>
    </Body>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SUNNY — answers from live data, not a canned script.

   A hosted LLM would need an API key, and a key shipped in a static
   site is public to everyone who loads the page. So Sunny reasons
   over the real forecast and the user's own skin profile instead.
   To swap in a hosted model later, put the key behind a serverless
   proxy (Cloudflare Worker, Vercel function) and replace the body
   of answer() with a fetch to that proxy.
   ═══════════════════════════════════════════════════════════════ */

function answer(text, ctx) {
  const q = text.toLowerCase();
  const { conditions, profile } = ctx;
  const fitz = fitzpatrick(profile.burn, profile.tone);

  if (!conditions) {
    return "I don't have a UV reading yet. Set your location on the dashboard and I can give you real numbers.";
  }

  const uv = conditions.uv;
  const burn = minutesToBurn(fitz, uv);
  const peakBurn = minutesToBurn(fitz, conditions.peakUV);
  const spf = recommendSPF(fitz, conditions.uvMaxToday);
  const win = conditions.protectWindow;

  const timeMatch = q.match(/(\d{1,2})\s*(am|pm)/);
  if (timeMatch) {
    let h = parseInt(timeMatch[1], 10) % 12;
    if (timeMatch[2] === "pm") h += 12;
    const slot = conditions.hourly.find((x) => x.hour === h);
    if (slot) {
      const b = minutesToBurn(fitz, slot.uv);
      const cat = uvCategory(slot.uv);
      return `At ${fmtHour(h)} the UV index is ${slot.uv.toFixed(1)}, which is ${cat.label.toLowerCase()}. ` +
        (b === Infinity
          ? "Your skin isn't at real burn risk then."
          : `Your skin would start burning in about ${b} minutes unprotected, so wear SPF ${spf}+ and take shade breaks.`);
    }
  }

  if (/best time|when should|safest time|go outside|good time/.test(q)) {
    const safe = conditions.hourly.filter((h) => h.uv < 3 && h.hour >= 6 && h.hour <= 20);
    if (!safe.length) return `UV stays elevated all day, peaking at ${conditions.peakUV.toFixed(1)} around ${fmtHour(conditions.peakHour)}. Early morning is your best window, and wear SPF ${spf}+ whenever you're out.`;
    const early = safe.filter((h) => h.hour < 12);
    const late = safe.filter((h) => h.hour >= 15);
    const parts = [];
    if (early.length) parts.push(`before ${fmtHour(early[early.length - 1].hour + 1)}`);
    if (late.length) parts.push(`after ${fmtHour(late[0].hour)}`);
    return `Your safest windows today are ${parts.join(" or ")}. UV peaks at ${conditions.peakUV.toFixed(1)} around ${fmtHour(conditions.peakHour)}.`;
  }

  if (/soccer|run|hike|play|practice|sport|swim|walk|outside now/.test(q)) {
    return `Right now UV is ${uv.toFixed(1)}. ` +
      (burn === Infinity
        ? "That's low enough that you're fine out there."
        : `Your skin burns in roughly ${burn} minutes unprotected, so use SPF ${spf}+, reapply every two hours, and take shade breaks` +
          (win ? `, especially between ${fmtHour(win.from)} and ${fmtHour(win.to)}.` : "."));
  }

  if (/spf|sunscreen|lotion|which sunscreen/.test(q)) {
    return `For Fitzpatrick ${fitzLabel(fitz)} at today's peak UV of ${conditions.uvMaxToday.toFixed(1)}, go with SPF ${spf}+ broad-spectrum. Unprotected you'd burn in about ${peakBurn} minutes at peak, and SPF ${spf} stretches that to roughly ${Math.round(peakBurn * spf / 60)} hours. Reapply every two hours regardless.`;
  }

  if (/cloud|overcast|rain/.test(q)) {
    return `Cloud cover is ${conditions.cloud}% right now and UV is still ${uv.toFixed(1)}. Clouds scatter visible light but let most UV through, so up to 80% still reaches your skin.`;
  }

  if (/burn|sunburn|red|hurt/.test(q)) {
    return `At the current UV of ${uv.toFixed(1)}, ${burn === Infinity ? "burn risk is minimal" : `your skin starts burning in about ${burn} minutes unprotected`}. If you're already burned, cool the skin, drink water, and stay out of direct sun until it fades. Blistering or fever means see a doctor.`;
  }

  if (/hot|temperature|heat|weather/.test(q)) {
    return `It's ${conditions.temp}°F and feels like ${conditions.feelsLike}°F. Pavement and other dark surfaces can run 40 to 60 degrees above that, so check the Surface Detector before walking barefoot.`;
  }

  if (/peak|highest|strongest/.test(q)) {
    return `UV peaks at ${conditions.peakUV.toFixed(1)} around ${fmtHour(conditions.peakHour)} today${win ? `, and stays at high levels from ${fmtHour(win.from)} to ${fmtHour(win.to)}` : ""}.`;
  }

  if (/skin type|fitzpatrick|my type/.test(q)) {
    return `You're Fitzpatrick ${fitzLabel(fitz)}, based on burning ${profile.burn.toLowerCase()} with ${profile.tone.toLowerCase()}. That sets how fast you burn at any UV level, which is what all my numbers come from.`;
  }

  if (/hi|hey|hello|how are you/.test(q) && q.length < 24) {
    return `Doing well! UV is ${uv.toFixed(1)} where you are and it's ${conditions.temp}°F. Ask me when it's safe to go out, what SPF you need, or anything else about the sun today.`;
  }

  return `UV is ${uv.toFixed(1)} right now and peaks at ${conditions.peakUV.toFixed(1)} around ${fmtHour(conditions.peakHour)}. ` +
    (burn === Infinity ? "Burn risk is low today." : `You'd burn in about ${burn} minutes unprotected, so SPF ${spf}+ is the call.`) +
    " Ask me about a specific time, sunscreen, or surface heat.";
}

function AIChat({ go, state, conditions }) {
  const first = state.profile.name.trim().split(" ")[0] || "you";
  const [msgs, setMsgs] = useState([
    { who: "sunny", text: `Hey ${first}!` },
    { who: "sunny", text: "Ask me anything about the sun today. I'm reading live UV for your location." },
  ]);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, typing]);

  const send = () => {
    const t = draft.trim();
    if (!t || typing) return;
    setDraft("");
    setMsgs((m) => [...m, { who: "me", text: t }]);
    setTyping(true);
    setTimeout(() => {
      setMsgs((m) => [...m, { who: "sunny", text: answer(t, { conditions, profile: state.profile }) }]);
      setTyping(false);
    }, 480);
  };

  const chips = ["Can I play outside at 1 PM?", "What SPF do I need?", "Best time to go outside?"];

  return (
    <Body>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 18px 10px", flexShrink: 0 }}>
        <span style={{ fontSize: 26 }}>☀️</span>
        <div style={{ textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C.text }}>SunShield AI</p>
          {conditions && <p style={{ margin: 0, fontSize: 12, color: C.muted }}>Live UV {conditions.uv.toFixed(1)}</p>}
        </div>
        <Sunny size={56} />
      </div>

      <div className="ss-scroll" style={{ flex: 1, overflowY: "auto", padding: "6px 18px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
        {msgs.map((m, i) => {
          const mine = m.who === "me";
          const showName = i === 0 || msgs[i - 1].who !== m.who;
          return (
            <div key={i} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "80%" }}>
              <div style={{
                background: mine ? C.blue : "#F2F4F8", color: mine ? "#fff" : C.text,
                padding: "11px 15px", borderRadius: 16, fontSize: 14.5, lineHeight: 1.5,
              }}>
                {showName && <p style={{ margin: "0 0 3px", fontSize: 12, fontWeight: 700, opacity: mine ? 0.85 : 0.55 }}>{mine ? first : "Sunny"}</p>}
                {m.text}
              </div>
            </div>
          );
        })}
        {typing && (
          <div style={{ alignSelf: "flex-start", background: "#F2F4F8", padding: "12px 16px", borderRadius: 16 }}>
            <Spinner size={13} color={C.muted} />
          </div>
        )}
        <div ref={endRef} />
      </div>

      {msgs.length <= 2 && (
        <div style={{ display: "flex", gap: 7, padding: "0 16px 8px", flexWrap: "wrap", flexShrink: 0 }}>
          {chips.map((c) => (
            <button key={c} onClick={() => { setDraft(c); setTimeout(send, 10); }} className="ss-link"
              style={{ padding: "7px 12px", borderRadius: 99, border: `1px solid ${C.border}`, background: "#fff", fontSize: 12.5, fontFamily: FONT, color: C.text, cursor: "pointer" }}>
              {c}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px 16px", borderTop: `1px solid ${C.hairline}`, flexShrink: 0 }}>
        <button aria-label="Add attachment" className="ss-link" onClick={() => go("envscan")} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
          <Plus size={24} color={C.blue} />
        </button>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Best time to go outside?" className="ss-input"
          style={{ flex: 1, padding: "11px 14px", fontSize: 14.5, fontFamily: FONT, background: "#F2F4F8", border: "none", borderRadius: 20, outline: "none", color: C.text }} />
        <button onClick={send} aria-label="Send" className="ss-social"
          style={{ width: 34, height: 34, borderRadius: 99, border: "none", background: C.blue, display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0 }}>
          <Send size={16} color="#fff" />
        </button>
      </div>
    </Body>
  );
}

/* ═══════════════════════════════════════════════════════════════
   AWARDS — earned from logged habits and completed scans
   ═══════════════════════════════════════════════════════════════ */

function AwardEarned({ go, badgeId }) {
  const badge = badgeById(badgeId) || BADGES[0];
  const confetti = [
    [42, 30, "#FFC629"], [96, 18, "#1F7AE0"], [130, 44, "#F0576B"], [286, 22, "#F0576B"],
    [318, 52, "#4CAF50"], [58, 96, "#4CAF50"], [330, 110, "#FFC629"], [22, 128, "#1F7AE0"],
    [352, 140, "#F0576B"], [70, 158, "#FFC629"], [300, 168, "#4CAF50"], [110, 178, "#1F7AE0"],
  ];
  return (
    <Body style={{ padding: "0 22px 20px" }}>
      <p style={{ margin: "4px 0 10px", textAlign: "center", fontSize: 14, fontWeight: 700, color: C.text }}>Award Earned</p>
      <div style={{ position: "relative", height: 186 }}>
        <svg width="100%" height="186" viewBox="0 0 393 186" aria-hidden="true">
          {confetti.map(([x, y, c], i) => (
            <rect key={i} x={x} y={y} width="9" height="5" rx="2" fill={c} transform={`rotate(${(i * 47) % 360} ${x + 4} ${y + 2})`} />
          ))}
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 92 }}>{badge.emoji}</div>
      </div>
      <p style={{ margin: "10px 0 0", textAlign: "center", fontSize: 17, lineHeight: 1.5, color: C.text }}>
        Congratulations!<br />You have earned:
      </p>
      <p style={{ margin: "18px 0 0", textAlign: "center", fontSize: 25, fontWeight: 700, letterSpacing: -0.5, color: C.text }}>{badge.title}</p>
      <p style={{ margin: "20px 0 0", textAlign: "center", fontSize: 17, lineHeight: 1.5, color: C.text }}>
        Reason:<br />{badge.blurb}
      </p>
      <div style={{ flex: 1, minHeight: 26 }} />
      <Btn onClick={() => go("badges")} style={{ borderRadius: 12 }}>View Collection</Btn>
    </Body>
  );
}

function BadgeCollection({ go, state }) {
  const streak = currentStreak(state.days);
  return (
    <Body style={{ padding: "0 20px 20px" }}>
      <Header title="Badge Collection"
        sub={`${state.badges.length} of ${BADGES.length} earned${streak ? ` · ${streak} day streak` : ""}`} />
      <div style={{ display: "grid", gap: 12, marginTop: 8 }}>
        {BADGES.map((b) => {
          const earned = state.badges.includes(b.id);
          return (
            <Card key={b.id} fill={earned ? b.bg : "#F7F8FA"}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 14px", borderColor: earned ? C.blue : C.border, opacity: earned ? 1 : 0.72 }}>
              <span style={{ fontSize: 36, lineHeight: 1, filter: earned ? "none" : "grayscale(1)" }}>{earned ? b.emoji : "🔒"}</span>
              <div style={{ flex: 1, textAlign: "right" }}>
                <p style={{ margin: "0 0 2px", fontSize: 14.5, fontWeight: 600, color: C.text }}>{b.title}</p>
                <p style={{ margin: 0, fontSize: 14, color: earned ? C.text : C.muted }}>{b.blurb}</p>
              </div>
            </Card>
          );
        })}
      </div>
      <div style={{ flex: 1, minHeight: 22 }} />
      <Btn onClick={() => go("weekly")} style={{ borderRadius: 12 }}>Go to Weekly Progress</Btn>
    </Body>
  );
}

function WeeklyProgress({ go, state, conditions }) {
  const safe = daysSafeThisWeek(state.days);
  const rate = reminderRate(state.days);
  const streak = currentStreak(state.days);

  /* Chart uses the real forecast where available, and falls back to
     what the user actually logged. */
  const bars = [];
  for (let i = 6; i >= 0; i--) {
    const key = dayKey(-i);
    const d = state.days[key];
    const label = new Date(key).toLocaleDateString([], { weekday: "narrow" });
    const uv = conditions?.week?.[0] != null && i === 0 ? conditions.uvMaxToday : null;
    const actions = d ? [d.spf, d.shade, d.protected].filter(Boolean).length : 0;
    bars.push({ label, pct: (actions / 3) * 100, uv, logged: !!d });
  }

  return (
    <Body style={{ padding: "0 22px 20px" }}>
      <Header title="Your Weekly Protection" />
      <div style={{ display: "grid", placeItems: "center", marginTop: 4 }}>
        <div style={{ width: 128, height: 114, borderRadius: 16, background: C.panel, display: "grid", placeItems: "center", fontSize: 62 }}>
          {streak >= 7 ? "🏆" : streak >= 3 ? "🎖️" : "🌤️"}
        </div>
      </div>
      <p style={{ margin: "16px 0 0", textAlign: "center", fontSize: 18, fontWeight: 700, lineHeight: 1.45, color: C.text }}>
        Days Safe: {safe}/7<br />Sunscreen Reminders Followed: {rate}%
      </p>
      <p style={{ margin: "16px 0 12px", textAlign: "center", fontSize: 14.5, color: C.muted }}>Protective actions logged</p>

      <div style={{ border: "1.5px dashed #C9CDD4", borderRadius: 14, padding: "18px 16px", display: "grid", gap: 11 }}>
        {bars.map((b, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 14, fontSize: 11.5, color: C.muted, textAlign: "center" }}>{b.label}</span>
            <div style={{ flex: 1, height: 9, borderRadius: 99, background: C.track, overflow: "hidden" }}>
              <div className="ss-bar" style={{ width: `${b.pct}%`, height: "100%", borderRadius: 99, background: C.blue }} />
            </div>
          </div>
        ))}
      </div>

      {safe === 0 && (
        <p style={{ margin: "14px 0 0", fontSize: 13.5, color: C.muted, textAlign: "center", lineHeight: 1.5 }}>
          Nothing logged yet. Tick off habits on the dashboard and this fills in.
        </p>
      )}

      <div style={{ flex: 1, minHeight: 22 }} />
      <Btn onClick={() => go("envscan")} style={{ borderRadius: 12 }}>Environment Scan!</Btn>
    </Body>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SCAN FLOWS — real file input, real pixel analysis
   ═══════════════════════════════════════════════════════════════ */

function FilePicker({ accept, onFile, children, style }) {
  const ref = useRef(null);
  const [over, setOver] = useState(false);
  return (
    <>
      <input ref={ref} type="file" accept={accept} style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
      <div onClick={() => ref.current?.click()} role="button" tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && ref.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault(); setOver(false);
          const f = e.dataTransfer.files?.[0]; if (f) onFile(f);
        }}
        className="ss-row"
        style={{
          border: `1.5px solid ${over ? C.blueDeep : C.blue}`, borderRadius: 12,
          background: over ? C.blueSoft : "#fff", cursor: "pointer", fontFamily: FONT, ...style,
        }}>
        {children}
      </div>
    </>
  );
}

function CaptureButton({ label, emoji, accept, capture, onFile }) {
  const ref = useRef(null);
  return (
    <>
      <input ref={ref} type="file" accept={accept} capture={capture} style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
      <button onClick={() => ref.current?.click()} className="ss-row"
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          border: `1.5px solid ${C.blue}`, borderRadius: 12, background: "#fff",
          padding: "14px 16px", cursor: "pointer", fontFamily: FONT, fontSize: 14.5, color: C.text,
        }}>
        <span>{label}</span>
        <span style={{ fontSize: 30, lineHeight: 1 }}>{emoji}</span>
      </button>
    </>
  );
}

function EnvScan({ go, onFile, onLive, error }) {
  return (
    <Body style={{ padding: "0 20px 24px" }}>
      <h1 style={{ margin: "2px 0 14px", fontSize: 34, fontWeight: 500, letterSpacing: -1.2, color: C.text }}>Environment Scan</h1>
      <Card style={{ padding: "14px 16px", marginBottom: 14 }}>
        <p style={{ margin: 0, fontSize: 14.5, fontWeight: 700, lineHeight: 1.45, textAlign: "center", color: C.text }}>
          Upload a photo or video so we can analyze your surroundings and give personalized tips.
        </p>
      </Card>

      {error && (
        <Card style={{ borderColor: C.error, padding: "12px 14px", marginBottom: 14 }}>
          <p style={{ margin: 0, fontSize: 13.5, color: C.error }}>{error}</p>
        </Card>
      )}

      <FilePicker accept="image/*,video/*" onFile={onFile} style={{ padding: "34px 16px", textAlign: "center" }}>
        <Upload size={74} color={C.text} strokeWidth={2.4} />
        <p style={{ margin: "16px 0 0", fontSize: 14.5, fontWeight: 700, lineHeight: 1.45, color: C.text }}>
          Tap To Upload Photo or Video<br />or Drag and Drop
        </p>
      </FilePicker>

      <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
        <button onClick={onLive} className="ss-row"
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
            border: `1.5px solid ${C.blue}`, borderRadius: 12, background: C.blueSoft,
            padding: "14px 16px", cursor: "pointer", fontFamily: FONT, fontSize: 14.5, color: C.text,
          }}>
          <span style={{ textAlign: "left" }}>
            <strong>Live Scan</strong>
            <span style={{ display: "block", fontSize: 12.5, color: C.muted, marginTop: 2 }}>
              Point your camera and read surfaces in real time
            </span>
          </span>
          <Video size={26} color={C.blue} />
        </button>
        <CaptureButton label="Take a Photo" emoji="📷" accept="image/*" capture="environment" onFile={onFile} />
        <CaptureButton label="Record a Video" emoji="🎥" accept="video/*" capture="environment" onFile={onFile} />
      </div>

      <p style={{ margin: "16px 0 0", fontSize: 12.5, lineHeight: 1.5, color: C.muted, textAlign: "center" }}>
        Analysis runs on your device. Nothing is uploaded anywhere.
      </p>
      <div style={{ flex: 1, minHeight: 20 }} />
    </Body>
  );
}

function Analyzing({ go, pct, title, blurb, steps, fact, factEmoji, done, onView, backTo }) {
  return (
    <Body style={{ padding: "0 22px 24px" }}>
      <div style={{ position: "relative" }}>
        <button onClick={() => go(backTo)} aria-label="Back" className="ss-link"
          style={{ position: "absolute", left: -6, top: 0, background: "none", border: "none", cursor: "pointer", padding: 6 }}>
          <ChevronLeft size={24} color={C.blue} strokeWidth={2.6} />
        </button>
      </div>
      <h1 style={{ margin: "32px 0 4px", fontSize: 30, fontWeight: 500, letterSpacing: -1.1, textAlign: "center", color: C.text }}>{title}</h1>
      <p style={{ margin: "0 0 18px", fontSize: 14.5, fontWeight: 600, textAlign: "center", lineHeight: 1.4, color: C.text }}>{blurb}</p>

      <Ring pct={pct} size={152} />

      <div style={{ display: "grid", gap: 11, marginTop: 22 }}>
        {steps.map((s) => {
          const complete = pct >= s.at;
          return (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 14, opacity: complete ? 1 : 0.5 }}>
              <span style={{ fontSize: 24, width: 30, textAlign: "center", lineHeight: 1 }}>{s.emoji}</span>
              <span style={{ flex: 1, fontSize: 14.5, color: C.text }}>{s.label}</span>
              {complete ? <Check size={18} color={C.blue} strokeWidth={3} /> : <Spinner size={14} color={C.muted} />}
            </div>
          );
        })}
      </div>

      <div style={{ flex: 1, minHeight: 18 }} />
      <Card style={{ padding: "12px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 700, color: C.text }}>Did You Know?</p>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45, color: C.text }}>{fact}</p>
        </div>
        {factEmoji && <span style={{ fontSize: 30 }}>{factEmoji}</span>}
      </Card>
      <Btn onClick={onView} disabled={!done} style={{ borderRadius: 12 }}>
        {done ? "View Results" : "Analyzing…"}
      </Btn>
    </Body>
  );
}

/* Object recognition on a still scan. The model downloads on first
   use and then stays cached, so this is opt-in rather than
   automatic. Cloud description appears only if a proxy is set up. */
function ObjectPanel({ scan, conditions }) {
  const [objects, setObjects] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [err, setErr] = useState("");
  const [cloud, setCloud] = useState(null);
  const [cloudBusy, setCloudBusy] = useState(false);

  const run = async () => {
    if (!scan?.file) return;
    setBusy(true); setErr(""); setPct(0);
    try {
      await loadDetector(setPct);
      const img = new Image();
      img.src = URL.createObjectURL(scan.file);
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
      const found = await detectObjects(img, { minScore: 0.4, max: 12 });
      URL.revokeObjectURL(img.src);
      setObjects(summarize(found));
    } catch {
      setErr("Detection model couldn't load. Check your connection and try again.");
    }
    setBusy(false);
  };

  const runCloud = async () => {
    if (!scan?.file) return;
    setCloudBusy(true); setErr("");
    try {
      setCloud(await describeScene(scan.file, { analysis: scan.analysis, conditions }));
    } catch (e) {
      setErr(e.message);
    }
    setCloudBusy(false);
  };

  const advice = objects ? detectionAdvice(objects, conditions) : [];

  return (
    <div style={{ marginTop: 14 }}>
      {objects === null && (
        <Btn variant="outline" onClick={run} disabled={busy} style={{ borderRadius: 12 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
            <Zap size={15} />
            {busy ? `Loading model… ${pct}%` : "Identify objects in this photo"}
          </span>
        </Btn>
      )}

      {err && <p style={{ margin: "10px 0 0", fontSize: 13, color: C.error }}>{err}</p>}

      {objects && (
        <Card style={{ padding: "14px 14px", marginTop: 4 }}>
          <p style={{ margin: "0 0 10px", fontSize: 14.5, fontWeight: 700, color: C.text }}>
            Detected ({objects.length})
          </p>
          {!objects.length && (
            <p style={{ margin: 0, fontSize: 13.5, color: C.muted }}>
              Nothing recognisable in frame. The model knows 80 everyday object types, so open landscape often comes back empty.
            </p>
          )}
          <div style={{ display: "grid", gap: 8 }}>
            {objects.map((o) => (
              <div key={o.label} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <span style={{ fontSize: 20, lineHeight: 1.2, width: 24, textAlign: "center" }}>{o.icon}</span>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: C.text, textTransform: "capitalize" }}>
                    {o.label}{o.count > 1 ? ` ×${o.count}` : ""}
                    <span style={{ marginLeft: 6, fontSize: 11.5, fontWeight: 400, color: C.muted }}>
                      {Math.round(o.score * 100)}%
                    </span>
                  </p>
                  {o.note && <p style={{ margin: "2px 0 0", fontSize: 12.5, lineHeight: 1.4, color: kindColor(o.kind) }}>{o.note}</p>}
                </div>
              </div>
            ))}
          </div>

          {advice.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.hairline}`, display: "grid", gap: 8 }}>
              {advice.map((a, i) => (
                <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 16 }}>{a.icon}</span>
                  <p style={{ margin: 0, flex: 1, fontSize: 13, lineHeight: 1.45, color: C.text }}>{a.text}</p>
                </div>
              ))}
            </div>
          )}

          {cloudEnabled() && !cloud && (
            <div style={{ marginTop: 12 }}>
              <Btn variant="outline" onClick={runCloud} disabled={cloudBusy} style={{ borderRadius: 10, padding: "11px 0" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13.5 }}>
                  <Sparkles size={14} />
                  {cloudBusy ? "Describing scene…" : "Describe scene with AI"}
                </span>
              </Btn>
            </div>
          )}

          {cloud && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.hairline}` }}>
              <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 700, color: C.text }}>Scene description</p>
              <p style={{ margin: "0 0 8px", fontSize: 13, lineHeight: 1.5, color: C.text }}>{cloud.summary}</p>
              {cloud.shade && <p style={{ margin: "0 0 8px", fontSize: 12.5, color: C.muted }}>Shade: {cloud.shade}</p>}
              {cloud.risks.map((r, i) => (
                <p key={i} style={{ margin: "0 0 5px", fontSize: 12.5, lineHeight: 1.45, color: C.error }}>• {r}</p>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function EnvReport({ go, scan, conditions }) {
  if (!scan) return <Body style={{ padding: 24 }}><p style={{ color: C.muted }}>No scan yet.</p></Body>;
  const env = environmentScore(scan.analysis, conditions);
  const a = scan.analysis;

  const metrics = [
    { emoji: "☀️", label: "UV Index", value: conditions ? `${conditions.uv.toFixed(1)} ${uvCategory(conditions.uv).label}` : "—", strong: true },
    { emoji: "🍃", label: "Greenery", value: `${a.greenery}%` },
    { emoji: "🌤️", label: "Sky in View", value: `${a.skyShare}%` },
    { emoji: "⛱️", label: "Shade Cover", value: `${Math.round(a.shadeFraction * 100)}%` },
    { emoji: "🌡️", label: "Temperature", value: conditions ? `${conditions.temp} degrees F` : "—" },
    { emoji: "🧱", label: "Paved Surface", value: `${env.pavedPct}%` },
    { emoji: "💡", label: "Brightness", value: a.brightness > 0.62 ? "High glare" : a.brightness > 0.4 ? "Moderate" : "Low" },
  ];

  return (
    <Body style={{ padding: "0 20px 24px" }}>
      <Header title="Surroundings Report" onBack={() => go("envscan")} big />
      <p style={{ margin: "2px 0 12px", textAlign: "center", fontSize: 14.5, fontWeight: 600, color: C.text }}>Here's what we found!</p>

      <Card style={{ padding: "14px 16px 18px", marginBottom: 14 }}>
        <p style={{ margin: "0 0 8px", textAlign: "center", fontSize: 15, fontWeight: 700, color: C.text }}>Overall Environment Score</p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}>
          <div style={{ position: "relative" }}>
            <Ring pct={env.score} size={128} suffix="" />
            <p style={{ position: "absolute", left: 0, right: 0, bottom: 28, margin: 0, textAlign: "center", fontSize: 13.5, color: C.text }}>{env.label}</p>
          </div>
          {scan.analysis.thumbnail && (
            <img src={scan.analysis.thumbnail} alt="Your scan" style={{ width: 76, height: 76, objectFit: "cover", borderRadius: 12, border: `1px solid ${C.border}` }} />
          )}
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11 }}>
        {metrics.map((m) => (
          <Card key={m.label} style={{ display: "flex", alignItems: "center", gap: 9, padding: "12px 10px" }}>
            <span style={{ fontSize: 25, lineHeight: 1 }}>{m.emoji}</span>
            <div style={{ flex: 1, fontSize: 13, lineHeight: 1.35, color: C.text, fontWeight: m.strong ? 700 : 400 }}>
              {m.label}<br />{m.value}
            </div>
          </Card>
        ))}
      </div>

      <ObjectPanel scan={scan} conditions={conditions} />

      <div style={{ flex: 1, minHeight: 20 }} />
      <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
        <Btn onClick={() => go("envmap")} style={{ borderRadius: 12 }}>View Full Report</Btn>
        <Btn variant="secondary" onClick={() => go("envscan")} style={{ borderRadius: 12 }}>Scan Again</Btn>
      </div>
    </Body>
  );
}

function EnvReportMap({ go, scan, conditions, place }) {
  if (!scan) return <Body style={{ padding: 24 }}><p style={{ color: C.muted }}>No scan yet.</p></Body>;
  const env = environmentScore(scan.analysis, conditions);
  const found = insights(scan.analysis, conditions, env);
  return (
    <Body>
      <Header title="Surroundings Report" onBack={() => go("envreport")} />
      {place && <LiveMap lat={place.lat} lon={place.lon} height={300} zoom={14} grid={[]} />}
      <div style={{ flex: 1, padding: "0 14px 20px", marginTop: -14, display: "flex", flexDirection: "column" }}>
        <Card style={{ padding: "16px 14px" }}>
          <p style={{ margin: "0 0 8px", fontSize: 14.5, fontWeight: 600, letterSpacing: 0.2, color: C.text }}>KEY INSIGHTS:</p>
          {found.map((n, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < found.length - 1 ? "2px solid #1A1A1A" : "none" }}>
              <span style={{ fontSize: 28, lineHeight: 1 }}>{n.emoji}</span>
              <p style={{ margin: 0, flex: 1, textAlign: "center", fontSize: 13.5, lineHeight: 1.45, color: C.text }}>{n.text}</p>
            </div>
          ))}
        </Card>
        <div style={{ flex: 1, minHeight: 14 }} />
        <div style={{ marginTop: 14 }}>
          <Btn onClick={() => go("envtips")} style={{ borderRadius: 12 }}>Go to Tips</Btn>
        </div>
      </div>
    </Body>
  );
}

/* Tips are picked based on what the scan actually found. */
function EnvTips({ go, scan, conditions, state }) {
  const a = scan?.analysis;
  const uv = conditions?.uv ?? 0;
  const fitz = fitzpatrick(state.profile.burn, state.profile.tone);
  const spf = recommendSPF(fitz, conditions?.uvMaxToday ?? uv);
  const tips = [];

  if (uv >= 6) tips.push({ emoji: "☀️", title: "High UV Alert", body: `UV is ${uv.toFixed(1)}. Use SPF ${spf}+ sunscreen, wear a hat and sunglasses.`, bg: P.blush });
  else tips.push({ emoji: "🌤️", title: "Moderate UV", body: `UV is ${uv.toFixed(1)}. SPF ${spf} is still worth wearing.`, bg: P.blue });

  if (conditions?.temp >= 85) tips.push({ emoji: "💧", title: "Stay Hydrated", body: `It's ${conditions.temp}°F. Drink plenty of water.`, bg: P.green });

  if (a && a.shadeFraction < 0.2) tips.push({ emoji: "🌳", title: "Find More Shade", body: `Only ${Math.round(a.shadeFraction * 100)}% of the ground is shaded. Seek cover during peak sun hours.`, bg: P.purple });
  else if (a) tips.push({ emoji: "🌳", title: "Good Shade Nearby", body: `About ${Math.round(a.shadeFraction * 100)}% shade coverage. Use it during peak hours.`, bg: P.purple });

  if (a && a.greenery >= 25) tips.push({ emoji: "🍃", title: "Green Space Bonus", body: `${a.greenery}% greenery. Tree cover measurably lowers surrounding temperature.`, bg: P.mint });
  if (a && a.brightness > 0.62) tips.push({ emoji: "🕶️", title: "High Glare", body: "Bright reflective surfaces here. UV-blocking sunglasses matter more than usual.", bg: P.lemon });

  tips.push({ emoji: "🛡️", title: "Stay Safe, Stay Smart!", body: "Scan regularly to stay updated on your environment.", bg: P.mint });

  return (
    <Body style={{ padding: "0 20px 24px" }}>
      <Header title="Surroundings Report" onBack={() => go("envmap")} sub="Tips" />
      <div style={{ display: "grid", gap: 12, marginTop: 8 }}>
        {tips.map((t) => (
          <Card key={t.title} fill={t.bg} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 12px" }}>
            <span style={{ fontSize: 28, lineHeight: 1 }}>{t.emoji}</span>
            <div style={{ flex: 1, textAlign: "center" }}>
              <p style={{ margin: "0 0 2px", fontSize: 14.5, fontWeight: 700, color: C.text }}>{t.title}</p>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.4, color: C.text }}>{t.body}</p>
            </div>
          </Card>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 20 }} />
      <Btn onClick={() => go("surface")} style={{ borderRadius: 12 }}>Go to Surface Detector</Btn>
    </Body>
  );
}

function SurfaceDetector({ go, onFile, onLive, error }) {
  return (
    <Body style={{ padding: "0 20px 24px" }}>
      <Header title="Surface Detector" sub="Take a clear photo of the area around you." onBack={() => go("home")} />
      {error && (
        <Card style={{ borderColor: C.error, padding: "12px 14px", marginBottom: 14 }}>
          <p style={{ margin: 0, fontSize: 13.5, color: C.error }}>{error}</p>
        </Card>
      )}
      <FilePicker accept="image/*" onFile={onFile} style={{ padding: "34px 16px", textAlign: "center", marginTop: 6 }}>
        <Upload size={74} color={C.text} strokeWidth={2.4} />
        <p style={{ margin: "16px 0 0", fontSize: 14.5, fontWeight: 700, color: C.text }}>Tap To Upload Photo</p>
      </FilePicker>
      <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
        <button onClick={onLive} className="ss-row"
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
            border: `1.5px solid ${C.blue}`, borderRadius: 12, background: C.blueSoft,
            padding: "14px 16px", cursor: "pointer", fontFamily: FONT, fontSize: 14.5, color: C.text,
          }}>
          <span style={{ textAlign: "left" }}>
            <strong>Live Scan</strong>
            <span style={{ display: "block", fontSize: 12.5, color: C.muted, marginTop: 2 }}>
              Live surface temperatures as you point
            </span>
          </span>
          <Video size={26} color={C.blue} />
        </button>
        <CaptureButton label="Take a Photo" emoji="📸" accept="image/*" capture="environment" onFile={onFile} />
      </div>
      <Card style={{ padding: "14px 16px", marginTop: 14 }}>
        <p style={{ margin: 0, textAlign: "center", fontSize: 14, lineHeight: 1.55, color: C.text }}>
          <strong>Tips for best results:</strong><br />
          Try to include different surfaces<br />Avoid heavy shadows<br />Take in bright sunlight
        </p>
      </Card>
      <p style={{ margin: "16px 0 0", fontSize: 12.5, lineHeight: 1.5, color: C.muted, textAlign: "center" }}>
        Surface temperatures are estimated from the photo plus live air temperature and UV.
      </p>
      <div style={{ flex: 1, minHeight: 20 }} />
    </Body>
  );
}

function HeatBars({ n }) {
  return (
    <svg width="30" height="24" viewBox="0 0 30 24" aria-label={`Heat level ${n} of 4`}>
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={i * 7.6} y={20 - (i + 1) * 4.6} width="5.6" height={(i + 1) * 4.6} rx="1"
          fill={i < n ? "#1A1A1A" : "none"} stroke="#1A1A1A" strokeWidth="1" />
      ))}
    </svg>
  );
}

function SurfaceReport({ go, scan, conditions }) {
  if (!scan) return <Body style={{ padding: 24 }}><p style={{ color: C.muted }}>No scan yet.</p></Body>;
  const airTemp = conditions?.temp ?? 85;
  const rows = surfaceReport(scan.analysis, airTemp, conditions?.uv ?? 6);
  const hottest = rows.reduce((a, b) => (b.f > (a?.f ?? 0) ? b : a), null);
  const overall = hottest?.f >= 130 ? "HIGH" : hottest?.f >= 110 ? "MODERATE" : "LOW";
  const time = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return (
    <Body style={{ padding: "0 20px 20px" }}>
      <Header title="Surface Report" onBack={() => go("surface")} big />
      <p style={{ margin: "0 0 14px", textAlign: "center", fontSize: 14.5, fontWeight: 700, color: C.text }}>Today, {time}</p>

      <Card style={{ padding: "18px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: C.text }}>Overall Heat Index</p>
          <p style={{ margin: "0 0 4px", fontSize: 26, fontWeight: 500, letterSpacing: -0.5, color: C.text }}>{overall}</p>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: C.text }}>
            {hottest ? `${hottest.name} is reaching about ${hottest.f}°F in ${airTemp}°F air.` : "No surfaces detected."}
          </p>
        </div>
        {scan.analysis.thumbnail
          ? <img src={scan.analysis.thumbnail} alt="Your scan" style={{ width: 62, height: 62, objectFit: "cover", borderRadius: 10, border: `1px solid ${C.border}` }} />
          : <span style={{ fontSize: 40 }}>🌡️</span>}
      </Card>

      <p style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 700, color: C.text }}>Surface Analysis</p>
      <div style={{ display: "grid", gap: 11 }}>
        {rows.map((s) => (
          <Card key={s.key} style={{ display: "flex", alignItems: "center", gap: 11, padding: "12px" }}>
            <div style={{ width: 48, height: 38, borderRadius: 5, background: s.swatch, flexShrink: 0 }} />
            <div style={{ flex: 1.1, fontSize: 13, lineHeight: 1.35, color: C.text }}>
              {s.name}<br />{s.f} F / {s.c} C
              <span style={{ display: "block", fontSize: 11.5, color: C.muted }}>{s.share}% of frame</span>
            </div>
            <div style={{ flex: 1, fontSize: 13, lineHeight: 1.35, textAlign: "center", color: C.text }}>
              {s.verdict}<br />{s.advice}
            </div>
            <HeatBars n={s.bars} />
          </Card>
        ))}
      </div>

      <div style={{ flex: 1, minHeight: 16 }} />
      <Btn onClick={() => go("surftips")} style={{ borderRadius: 12, marginTop: 14 }}>Safety Tips</Btn>
    </Body>
  );
}

function SurfaceTips({ go, scan, conditions, saved, onSave }) {
  const airTemp = conditions?.temp ?? 85;
  const rows = scan ? surfaceReport(scan.analysis, airTemp, conditions?.uv ?? 6) : [];
  const veryHot = rows.filter((r) => r.bars >= 4);
  const tips = [];

  if (veryHot.length) {
    tips.push({ emoji: "👟", title: "Wear Shoes", body: `${veryHot.map((r) => r.name).join(" and ")} ${veryHot.length > 1 ? "are" : "is"} hot enough to burn bare feet.`, bg: P.blush });
  } else {
    tips.push({ emoji: "👟", title: "Wear Shoes", body: "Hot surfaces like asphalt, sand, and concrete can burn your feet.", bg: P.blush });
  }
  if (rows.some((r) => r.key === "metal")) {
    tips.push({ emoji: "🪑", title: "Check Before You Sit", body: "Metal benches and playground equipment can get very hot.", bg: P.green });
  }
  tips.push({ emoji: "🧴", title: "Protect Your Skin", body: "Use SPF 30+ sunscreen and wear protective clothing.", bg: P.lemon });
  if (airTemp >= 85) tips.push({ emoji: "💧", title: "Stay Hydrated", body: `It's ${airTemp}°F. Drink plenty of water in hot conditions.`, bg: P.jade });
  if (rows.some((r) => r.key === "grass" || r.key === "tree")) {
    tips.push({ emoji: "🌳", title: "Cooler Ground Nearby", body: "Grass in this frame runs far cooler than the pavement. Use it.", bg: P.mint });
  }

  return (
    <Body style={{ padding: "0 20px 20px" }}>
      <Header title="Safety Tips" onBack={() => go("surfreport")} />
      <div style={{ display: "grid", gap: 12, marginTop: 8 }}>
        {tips.map((t) => (
          <Card key={t.title} fill={t.bg} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 12px" }}>
            <span style={{ fontSize: 30, lineHeight: 1 }}>{t.emoji}</span>
            <div style={{ flex: 1, textAlign: "center" }}>
              <p style={{ margin: "0 0 2px", fontSize: 14.5, fontWeight: 700, color: C.text }}>{t.title}</p>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.4, color: C.text }}>{t.body}</p>
            </div>
          </Card>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 18 }} />
      <div style={{ display: "grid", gap: 11, marginTop: 16 }}>
        <Btn onClick={() => go("surface")} style={{ borderRadius: 12 }}>Scan Again</Btn>
        <Btn variant="secondary" onClick={onSave} disabled={saved} style={{ borderRadius: 12 }}>
          {saved ? "Report Saved ✓" : "Save Report"}
        </Btn>
      </div>
    </Body>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SETTINGS + HISTORY
   ═══════════════════════════════════════════════════════════════ */

function SettingsRow({ label, value, onClick }) {
  return (
    <button onClick={onClick} className="ss-row"
      style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "17px 20px", background: "transparent", border: "none",
        borderBottom: `1px solid ${C.hairline}`, fontFamily: FONT, fontSize: 15,
        color: C.text, cursor: "pointer", textAlign: "left",
      }}>
      <span>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 10, color: C.muted, fontSize: 14 }}>
        {value && <span>{value}</span>}
        <ChevronRight size={17} color="#B9BEC5" strokeWidth={2.2} />
      </span>
    </button>
  );
}

function Settings({ state, go, place, dark, setDark, onReset }) {
  const name = state.profile.name.trim() || "Your Profile";
  const handle = "@" + (state.profile.name.trim().toLowerCase().replace(/\s+/g, "") || "sunshield");
  const fitz = state.profile.burn && state.profile.tone ? fitzLabel(fitzpatrick(state.profile.burn, state.profile.tone)) : null;
  const [confirm, setConfirm] = useState(false);

  return (
    <Body>
      <Header title="Settings" />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 0 18px" }}>
        <div style={{ position: "relative" }}>
          <div style={{ width: 86, height: 86, borderRadius: 26, background: C.avatarBg, overflow: "hidden" }}>
            <svg width="86" height="86" viewBox="0 0 86 86" aria-hidden="true">
              <circle cx="43" cy="33" r="14" fill={C.avatarFg} />
              <path d="M17 86c0-16 12-26 26-26s26 10 26 26H17Z" fill={C.avatarFg} />
            </svg>
          </div>
          <button aria-label="Change photo" className="ss-social" onClick={() => go("profile_edit")}
            style={{ position: "absolute", right: -4, bottom: 2, width: 27, height: 27, borderRadius: 99, border: "2.5px solid #fff", background: C.blue, display: "grid", placeItems: "center", cursor: "pointer", padding: 0 }}>
            <Pencil size={12} color="#fff" strokeWidth={2.6} />
          </button>
        </div>
        <p style={{ margin: "16px 0 3px", fontSize: 19, fontWeight: 800, color: C.text, letterSpacing: -0.3 }}>{name}</p>
        <p style={{ margin: 0, fontSize: 14, color: C.muted }}>{handle}</p>
        {fitz && <p style={{ margin: "6px 0 0", fontSize: 13, color: C.blue, fontWeight: 600 }}>Fitzpatrick {fitz}</p>}
      </div>

      <div style={{ borderTop: `1px solid ${C.hairline}` }}>
        <SettingsRow label="Name/Profile" value={state.profile.name || "Not set"} onClick={() => go("profile_edit")} />
        <SettingsRow label="Skin Type" value={state.profile.skin || "Not set"} onClick={() => go("skintype_edit")} />
        <SettingsRow label="Burn & Tone" value={state.profile.tone || "Not set"} onClick={() => go("burntone_edit")} />
        <SettingsRow label="Location" value={place?.name || "Not set"} onClick={() => go("place")} />
        <SettingsRow label="Notification Settings" onClick={() => go("notifications")} />
        <button onClick={() => setDark(!dark)} className="ss-row"
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "17px 20px", background: "transparent", border: "none", borderBottom: `1px solid ${C.hairline}`, fontFamily: FONT, fontSize: 15, color: C.text, cursor: "pointer", textAlign: "left" }}>
          <span>Light/Dark Mode</span>
          <span style={{
            width: 44, height: 26, borderRadius: 99, background: dark ? C.blue : C.track,
            display: "flex", alignItems: "center", padding: 3, transition: "background .18s",
          }}>
            <span style={{
              width: 20, height: 20, borderRadius: 99, background: "#fff",
              transform: dark ? "translateX(18px)" : "none", transition: "transform .18s",
              boxShadow: "0 1px 3px rgba(0,0,0,.25)",
            }} />
          </span>
        </button>
      </div>

      <div style={{ height: 9, background: "#F5F6F8", borderTop: `1px solid ${C.hairline}`, borderBottom: `1px solid ${C.hairline}` }} />

      <div>
        <SettingsRow label="Scan History" value={`${state.scans.length}`} onClick={() => go("history")} />
        <SettingsRow label="Contact Support" onClick={() => go("ai")} />
        <SettingsRow label="Language" value="English" />
        <SettingsRow label="Privacy & Security" onClick={() => go("privacy")} />
      </div>

      <div style={{ padding: "20px", marginTop: "auto" }}>
        {confirm ? (
          <div style={{ display: "grid", gap: 9 }}>
            <p style={{ margin: 0, fontSize: 13.5, color: C.error, textAlign: "center" }}>
              This erases your profile, streaks, and scan history.
            </p>
            <Btn onClick={() => { onReset(); setConfirm(false); }} style={{ borderRadius: 12, background: C.error }}>Yes, erase everything</Btn>
            <Btn variant="outline" onClick={() => setConfirm(false)} style={{ borderRadius: 12 }}>Cancel</Btn>
          </div>
        ) : (
          <Btn variant="outline" onClick={() => setConfirm(true)} style={{ borderRadius: 12, color: C.error, borderColor: C.error }}>
            Reset all data
          </Btn>
        )}
      </div>
    </Body>
  );
}

function Privacy({ go }) {
  return (
    <Body style={{ padding: "0 22px 24px" }}>
      <Header title="Privacy & Security" onBack={() => go("settings")} />
      <div style={{ display: "grid", gap: 14, marginTop: 10 }}>
        <Card style={{ padding: "16px 14px" }}>
          <p style={{ margin: "0 0 6px", fontSize: 14.5, fontWeight: 700, color: C.text }}>Photos never leave your device</p>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: C.text }}>
            Scans are processed in your browser using canvas pixel data. No image is uploaded to any server.
          </p>
        </Card>
        <Card style={{ padding: "16px 14px" }}>
          <p style={{ margin: "0 0 6px", fontSize: 14.5, fontWeight: 700, color: C.text }}>Your profile stays local</p>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: C.text }}>
            Name, skin profile, streaks, and history are saved in your browser's local storage. There's no account and no backend.
          </p>
        </Card>
        <Card style={{ padding: "16px 14px" }}>
          <p style={{ margin: "0 0 6px", fontSize: 14.5, fontWeight: 700, color: C.text }}>What does get sent</p>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: C.text }}>
            Only coordinates, and only to Open-Meteo, to fetch UV and temperature. If you search a city instead of sharing location, your device location is never read.
          </p>
        </Card>
      </div>
      <div style={{ flex: 1, minHeight: 20 }} />
    </Body>
  );
}

function History({ go, state, conditions }) {
  return (
    <Body style={{ padding: "0 20px 24px" }}>
      <Header title="Scan History" onBack={() => go("settings")} sub={`${state.scans.length} saved`} />
      {!state.scans.length && (
        <p style={{ margin: "30px 0", textAlign: "center", fontSize: 14, color: C.muted, lineHeight: 1.6 }}>
          No scans yet.<br />Run an environment or surface scan and it lands here.
        </p>
      )}
      <div style={{ display: "grid", gap: 11, marginTop: 8 }}>
        {state.scans.map((s) => (
          <Card key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: 12 }}>
            {s.thumbnail && <img src={s.thumbnail} alt="" style={{ width: 54, height: 54, objectFit: "cover", borderRadius: 9, border: `1px solid ${C.border}` }} />}
            <div style={{ flex: 1, fontSize: 13.5, lineHeight: 1.45, color: C.text }}>
              <strong>{s.kind === "surface" ? "Surface scan" : "Environment scan"}</strong><br />
              <span style={{ color: C.muted }}>
                {new Date(s.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </span>
            </div>
            <div style={{ textAlign: "right", fontSize: 13, color: C.text }}>
              {s.score != null && <>Score {s.score}<br /></>}
              {s.greenery != null && <span style={{ color: C.muted }}>{s.greenery}% green</span>}
            </div>
          </Card>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 20 }} />
    </Body>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ROUTER + APP SHELL
   ═══════════════════════════════════════════════════════════════ */

const ROUTES = {
  login:        { tab: null,     name: "1 · Login" },
  profile:      { tab: null,     name: "2 · Create Profile" },
  skintype:     { tab: null,     name: "3 · Skin Type" },
  burntone:     { tab: null,     name: "4 · Burn & Tone" },
  results:      { tab: null,     name: "5 · Results" },
  home:         { tab: "home",   name: "6 · Dashboard" },
  notifications:{ tab: "home",   name: "7 · Notifications" },
  tips:         { tab: "home",   name: "8 · Protection Tips" },
  map:          { tab: "map",    name: "9 · UV Map" },
  ai:           { tab: "ai",     name: "10 · Sunny Chat" },
  awardearned:  { tab: "awards", name: "11 · Award Earned" },
  badges:       { tab: "awards", name: "12 · Badge Collection" },
  weekly:       { tab: "awards", name: "13 · Weekly Progress" },
  envscan:      { tab: "home",   name: "14 · Environment Scan" },
  envanalyze:   { tab: null,     name: "15 · Analyzing Env." },
  envreport:    { tab: "home",   name: "16 · Surroundings Report" },
  envmap:       { tab: "home",   name: "17 · Report Map" },
  envtips:      { tab: "home",   name: "18 · Report Tips" },
  live:         { tab: null,     name: "+ Live Camera Scan" },
  surface:      { tab: "home",   name: "19 · Surface Detector" },
  surfanalyze:  { tab: null,     name: "20 · Analyzing Surfaces" },
  surfreport:   { tab: "home",   name: "21 · Surface Report" },
  surftips:     { tab: "home",   name: "22 · Surface Safety Tips" },
  settings:     { tab: "profile",name: "23 · Settings" },
  place:        { tab: "home",   name: "+ Location" },
  history:      { tab: "profile",name: "+ Scan History" },
  privacy:      { tab: "profile",name: "+ Privacy" },
  profile_edit: { tab: "profile",name: "+ Edit Profile" },
  skintype_edit:{ tab: "profile",name: "+ Edit Skin Type" },
  burntone_edit:{ tab: "profile",name: "+ Edit Burn & Tone" },
};

const TAB_ROOT = { home: "home", map: "map", ai: "ai", awards: "badges", profile: "settings" };

export default function SunShield() {
  const [state, setState] = useState(() => load());
  const [screen, setScreen] = useState(() => (load().profile.name ? "home" : "login"));
  const [place, setPlaceRaw] = useState(() => load().place || FALLBACK_PLACE);
  const [conditions, setConditions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [wxError, setWxError] = useState(false);
  const [dark, setDark] = useState(false);
  const [grid, setGrid] = useState([]);
  const [gridLoading, setGridLoading] = useState(false);
  const [gridError, setGridError] = useState(false);

  const [scanPct, setScanPct] = useState(0);
  const [scanDone, setScanDone] = useState(false);
  const [scan, setScan] = useState(null);
  const [scanError, setScanError] = useState("");
  const [saved, setSaved] = useState(false);
  const [freshBadge, setFreshBadge] = useState(null);
  const [liveKind, setLiveKind] = useState("env");

  const go = useCallback((s) => setScreen(s), []);

  /* Every state change persists, so a refresh doesn't lose anything. */
  const commit = useCallback((updater) => {
    setState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : { ...prev, ...updater };
      save(next);
      return next;
    });
  }, []);

  const patchProfile = useCallback((fields) => {
    commit((prev) => ({ ...prev, profile: { ...prev.profile, ...fields } }));
  }, [commit]);

  const setPlace = useCallback((p) => {
    setPlaceRaw(p);
    commit((prev) => ({ ...prev, place: p }));
  }, [commit]);

  /* ── Live conditions ──────────────────────────────────────── */
  const refresh = useCallback(async () => {
    if (!place) return;
    setLoading(true); setWxError(false);
    try {
      setConditions(await fetchConditions(place.lat, place.lon));
    } catch {
      setWxError(true);
    }
    setLoading(false);
  }, [place]);

  useEffect(() => { refresh(); }, [refresh]);

  /* Area readings for the map. Fetched on demand, since it's a
     bigger request than the single-point forecast. */
  const loadGrid = useCallback(async () => {
    if (!place) return;
    setGridLoading(true); setGridError(false);
    try {
      setGrid(await fetchUVGrid(place.lat, place.lon));
    } catch {
      setGridError(true);
      setGrid([]);
    }
    setGridLoading(false);
  }, [place]);

  useEffect(() => { setGrid([]); }, [place]);

  /* Ask for location once, the first time someone reaches the
     dashboard with nothing saved. Declining just leaves the
     fallback city in place, and the picker is always available. */
  const askedRef = useRef(false);
  useEffect(() => {
    if (askedRef.current) return;
    if (screen !== "home" && screen !== "results") return;
    if (state.place) { askedRef.current = true; return; }
    askedRef.current = true;
    (async () => {
      const p = await locate();
      if (!p) return;
      const label = await nameForCoords(p.lat, p.lon);
      setPlace({ ...p, name: label || "Your location" });
    })();
  }, [screen, state.place, setPlace]);

  useEffect(() => {
    if (screen === "map" && !grid.length && !gridLoading && !gridError) loadGrid();
  }, [screen, grid.length, gridLoading, gridError, loadGrid]);

  /* Refresh when the tab regains focus and the data is over 15 min old. */
  useEffect(() => {
    const onFocus = () => {
      if (conditions && Date.now() - conditions.fetchedAt > 900000) refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [conditions, refresh]);

  const useMyLocation = useCallback(async () => {
    const p = await locate();
    if (!p) { setPlace(FALLBACK_PLACE); go("home"); return; }
    const label = await nameForCoords(p.lat, p.lon);
    setPlace({ ...p, name: label || "Your location" });
    go("home");
  }, [setPlace, go]);

  /* ── Habits and badges ────────────────────────────────────── */
  const toggleHabit = useCallback((key) => {
    commit((prev) => {
      const k = today();
      const day = { ...(prev.days[k] || {}) };
      day[key] = !day[key];
      const next = { ...prev, days: { ...prev.days, [k]: day } };
      const { earned, fresh } = evaluateBadges(next);
      next.badges = earned;
      if (fresh.length) setFreshBadge(fresh[0]);
      return next;
    });
  }, [commit]);

  useEffect(() => {
    if (freshBadge) {
      const id = setTimeout(() => { go("awardearned"); setFreshBadge(null); }, 420);
      return () => clearTimeout(id);
    }
  }, [freshBadge, go]);

  /* ── Scanning ─────────────────────────────────────────────── */
  const runScan = useCallback(async (file, kind) => {
    setScanError(""); setScanPct(0); setScanDone(false); setScan(null); setSaved(false);
    go(kind === "surface" ? "surfanalyze" : "envanalyze");
    try {
      const analysis = await analyzeImage(file, setScanPct);
      const result = { kind, analysis, file, at: Date.now(), id: `${Date.now()}` };
      setScan(result);
      setScanDone(true);

      commit((prev) => {
        const env = environmentScore(analysis, conditions);
        const entry = {
          id: result.id, kind, at: result.at,
          thumbnail: analysis.thumbnail,
          greenery: analysis.greenery,
          score: kind === "surface" ? null : env.score,
        };
        const k = today();
        const day = { ...(prev.days[k] || {}) };
        day.scans = (day.scans || 0) + 1;
        const next = {
          ...prev,
          scans: [entry, ...prev.scans].slice(0, 20),
          days: { ...prev.days, [k]: day },
        };
        const { earned, fresh } = evaluateBadges(next);
        next.badges = earned;
        if (fresh.length) setFreshBadge(fresh[0]);
        return next;
      });
    } catch (e) {
      setScanError(e.message || "That file couldn't be analyzed. Try a different photo.");
      go(kind === "surface" ? "surface" : "envscan");
    }
  }, [go, commit, conditions]);

  const onReset = useCallback(() => {
    reset();
    const fresh = { ...load() };
    setState(fresh);
    setScan(null);
    setPlaceRaw(FALLBACK_PLACE);
    go("login");
  }, [go]);

  const route = ROUTES[screen] || ROUTES.login;
  const ctx = { state, conditions, place };

  const ENV_STEPS = [
    { emoji: "🖼️", label: "Reading image data", at: 25 },
    { emoji: "🍃", label: "Detecting greenery", at: 50 },
    { emoji: "⛱️", label: "Measuring shade", at: 70 },
    { emoji: "☀️", label: "Matching live UV", at: 88 },
    { emoji: "📊", label: "Scoring environment", at: 99 },
  ];

  const SURF_STEPS = [
    { emoji: "🔍", label: "Detecting Surfaces", at: 30 },
    { emoji: "🎨", label: "Reading surface color", at: 55 },
    { emoji: "🌡️", label: "Estimating Heat Levels", at: 80 },
    { emoji: "⚠️", label: "Calculating Risk", at: 99 },
  ];

  const view = {
    login: <Login go={go} profile={state.profile} patch={patchProfile} />,
    profile: <CreateProfile go={go} profile={state.profile} patch={patchProfile} />,
    profile_edit: <CreateProfile go={go} profile={state.profile} patch={patchProfile} editing />,
    skintype: <SkinType go={go} profile={state.profile} patch={patchProfile} />,
    skintype_edit: <SkinType go={go} profile={state.profile} patch={patchProfile} editing />,
    burntone: <BurnTone go={go} profile={state.profile} patch={patchProfile} />,
    burntone_edit: <BurnTone go={go} profile={state.profile} patch={patchProfile} editing />,
    results: <Results go={go} profile={state.profile} conditions={conditions} loading={loading} />,
    home: <Dashboard go={go} state={state} conditions={conditions} loading={loading}
      error={wxError} refresh={refresh} toggleHabit={toggleHabit} place={place} />,
    place: <PlacePicker go={go} place={place} setPlace={setPlace} useMyLocation={useMyLocation} />,
    notifications: <Notifications go={go} conditions={conditions} state={state} />,
    tips: <ProtectionTips go={go} conditions={conditions} state={state} />,
    map: <UVMap go={go} conditions={conditions} place={place} state={state}
      grid={grid} gridLoading={gridLoading} gridError={gridError} loadGrid={loadGrid} />,
    ai: <AIChat go={go} state={state} conditions={conditions} />,
    awardearned: <AwardEarned go={go} badgeId={state.badges[state.badges.length - 1]} />,
    badges: <BadgeCollection go={go} state={state} />,
    weekly: <WeeklyProgress go={go} state={state} conditions={conditions} />,
    envscan: <EnvScan go={go} onFile={(f) => runScan(f, "env")}
      onLive={() => { setLiveKind("env"); go("live"); }} error={scanError} />,
    live: <LiveScan conditions={conditions} onClose={() => go(liveKind === "surface" ? "surface" : "envscan")}
      onCapture={(f) => runScan(f, liveKind)} />,
    envanalyze: <Analyzing go={go} pct={scanPct} done={scanDone} backTo="envscan"
      onView={() => go("envreport")} title="Analyzing Environment"
      blurb="Reading your photo on this device to evaluate your surroundings."
      steps={ENV_STEPS} factEmoji="🍃"
      fact="Green spaces and shade can lower nearby surface temperature by tens of degrees." />,
    envreport: <EnvReport go={go} scan={scan} conditions={conditions} />,
    envmap: <EnvReportMap go={go} scan={scan} conditions={conditions} place={place} />,
    envtips: <EnvTips go={go} scan={scan} conditions={conditions} state={state} />,
    surface: <SurfaceDetector go={go} onFile={(f) => runScan(f, "surface")}
      onLive={() => { setLiveKind("surface"); go("live"); }} error={scanError} />,
    surfanalyze: <Analyzing go={go} pct={scanPct} done={scanDone} backTo="surface"
      onView={() => go("surfreport")} title="Analyzing Surfaces"
      blurb="Estimating surface heat from your photo, live air temperature, and UV."
      steps={SURF_STEPS} factEmoji="🌞"
      fact="Dark asphalt can sit 50 to 60 degrees above the air temperature in direct sun." />,
    surfreport: <SurfaceReport go={go} scan={scan} conditions={conditions} />,
    surftips: <SurfaceTips go={go} scan={scan} conditions={conditions} saved={saved} onSave={() => setSaved(true)} />,
    settings: <Settings state={state} go={go} place={place} dark={dark} setDark={setDark} onReset={onReset} />,
    privacy: <Privacy go={go} />,
    history: <History go={go} state={state} conditions={conditions} />,
  }[screen];

  return (
    <div style={{
      minHeight: "100vh", background: "#EDEFF2", display: "flex", alignItems: "center",
      justifyContent: "center", gap: 26, padding: 24, fontFamily: FONT, flexWrap: "wrap",
    }}>
      <style>{`
        .ss-input::placeholder { color: #A8ADB4; }
        .ss-pill { transition: transform .12s ease, background .12s ease; }
        .ss-pill:active:not(:disabled) { transform: scale(.985); background: ${C.blueDeep}; }
        .ss-option, .ss-row, .ss-social, .ss-link { transition: background .12s ease, opacity .12s ease; }
        .ss-row:active, .ss-option:active { background: #F4F6F8; }
        .ss-social:active, .ss-link:active { opacity: .6; }
        .ss-bar { transition: width .4s cubic-bezier(.4,0,.2,1); }
        .ss-scroll::-webkit-scrollbar { width: 0; }
        .leaflet-container { font-family: ${FONT}; background: #E8E9ED; }
        /* The dark-mode filter inverts the whole frame; undo it on
           map tiles so streets stay legible instead of neon. */
        ${dark ? ".leaflet-container { filter: invert(1) hue-rotate(180deg); }" : ""}
        .leaflet-control-attribution { font-size: 9px; }
        .leaflet-control-zoom a { border-radius: 6px !important; }
        .ss-spin { animation: ssrot .9s linear infinite; }
        @keyframes ssrot { to { transform: rotate(360deg); } }
        button:focus-visible, input:focus-visible { outline: 2px solid ${C.blue}; outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) { *, .ss-spin { animation: none !important; transition: none !important; } }
      `}</style>

      {/* Screen index — a review tool. Delete this <nav> before shipping. */}
      <nav aria-label="Screen index" className="ss-scroll" style={{ width: 190, maxHeight: 852, overflowY: "auto", fontSize: 12.5 }}>
        <p style={{ margin: "0 0 8px", fontWeight: 700, color: C.muted, letterSpacing: 0.4, fontSize: 11 }}>ALL SCREENS</p>
        {Object.entries(ROUTES).map(([id, r]) => (
          <button key={id} onClick={() => go(id)}
            style={{
              display: "block", width: "100%", textAlign: "left", padding: "6px 9px", marginBottom: 2,
              borderRadius: 7, border: "none", cursor: "pointer", fontFamily: FONT, fontSize: 12.5,
              background: screen === id ? C.blue : "transparent",
              color: screen === id ? "#fff" : "#5B6069",
              fontWeight: screen === id ? 700 : 400,
            }}>{r.name}</button>
        ))}
      </nav>

      <div style={{
        width: 393, maxWidth: "100%", height: 852, background: "#fff", borderRadius: 42,
        overflow: "hidden", display: "flex", flexDirection: "column",
        boxShadow: "0 30px 70px -20px rgba(16,24,40,.35)",
        filter: dark ? "invert(1) hue-rotate(180deg)" : "none",
      }}>
        <StatusBar bg={screen === "login" ? C.panel : "#fff"} />
        {view}
        {route.tab && <TabBar active={route.tab} go={(t) => go(TAB_ROOT[t])} />}
      </div>
    </div>
  );
}
