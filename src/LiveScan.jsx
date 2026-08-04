/* ═══════════════════════════════════════════════════════════════
   LiveScan.jsx — real-time camera analysis.

   getUserMedia gives a live stream, frames get pulled onto a canvas
   on an interval, and the same pixel classifier used by the photo
   scans runs on each one. Object detection runs on a slower cadence
   because it's the expensive part.

   Camera access needs HTTPS. GitHub Pages is HTTPS, and localhost
   is treated as secure during development, so both work.
   ═══════════════════════════════════════════════════════════════ */

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Camera, CameraOff, Zap, ZapOff, RefreshCw, X } from "lucide-react";
import { SURFACE_CLASS, surfaceTemp, heatVerdict } from "./lib/vision.js";
import { detectObjects, summarize, loadDetector, kindColor } from "./lib/detect.js";

const C = {
  blue: "#0A6CFF", text: "#15171A", muted: "#8B9096",
  error: "#F0576B", border: "#DFE3E8",
};
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif';

/* Same HSL rules as the still-photo scanner, kept in sync by
   importing the class table rather than duplicating thresholds. */
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

/* Reads the centre band of the frame — what the camera is actually
   pointed at — rather than averaging the whole view. */
function readFrame(video, canvas) {
  const w = 120;
  const h = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * w));
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, w, h);

  const horizon = Math.floor(h * 0.45);
  const { data } = ctx.getImageData(0, horizon, w, h - horizon);
  const counts = {};
  let sumL = 0;
  const px = data.length / 4;

  for (let i = 0; i < data.length; i += 4) {
    const [hu, sa, li] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    const cls = classify(hu, sa, li);
    counts[cls] = (counts[cls] || 0) + 1;
    sumL += li;
  }

  const ranked = Object.entries(counts)
    .filter(([k]) => k !== "sky")
    .map(([k, n]) => ({ key: k, share: (n / px) * 100 }))
    .sort((a, b) => b.share - a.share);

  return { ranked, brightness: sumL / px };
}

export default function LiveScan({ conditions, onClose, onCapture }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const lastDetect = useRef(0);

  const [status, setStatus] = useState("starting"); // starting | live | denied | unsupported | error
  const [surfaces, setSurfaces] = useState([]);
  const [objects, setObjects] = useState([]);
  const [detectOn, setDetectOn] = useState(false);
  const [modelPct, setModelPct] = useState(0);
  const [modelReady, setModelReady] = useState(false);
  const [facing, setFacing] = useState("environment");

  const airTemp = conditions?.temp ?? 85;
  const uv = conditions?.uv ?? 6;

  /* ── Camera ─────────────────────────────────────────────────── */
  const start = useCallback(async (mode) => {
    setStatus("starting");
    try {
      if (!navigator.mediaDevices?.getUserMedia) { setStatus("unsupported"); return; }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: mode }, width: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStatus("live");
    } catch (e) {
      setStatus(e.name === "NotAllowedError" ? "denied" : "error");
    }
  }, []);

  useEffect(() => {
    start(facing);
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      cancelAnimationFrame(rafRef.current);
    };
  }, [facing, start]);

  /* ── Analysis loop ──────────────────────────────────────────── */
  useEffect(() => {
    if (status !== "live") return;
    let alive = true;
    let lastPixel = 0;

    const tick = async (now) => {
      if (!alive) return;
      const v = videoRef.current;
      const c = canvasRef.current;

      if (v?.videoWidth && c) {
        /* Pixel pass is cheap: run it a few times a second. */
        if (now - lastPixel > 280) {
          lastPixel = now;
          try {
            const { ranked } = readFrame(v, c);
            setSurfaces(ranked.filter((s) => s.share >= 6).slice(0, 3));
          } catch { /* frame not ready */ }
        }

        /* Object detection is the expensive part, so it runs about
           once a second and only when switched on. */
        if (detectOn && modelReady && now - lastDetect.current > 1000) {
          lastDetect.current = now;
          try {
            const found = await detectObjects(v, { minScore: 0.5, max: 8 });
            if (alive) setObjects(summarize(found));
          } catch { /* skip this frame */ }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(rafRef.current); };
  }, [status, detectOn, modelReady]);

  /* ── Model loading, only on demand ──────────────────────────── */
  const enableDetection = useCallback(async () => {
    if (detectOn) { setDetectOn(false); setObjects([]); return; }
    setDetectOn(true);
    if (modelReady) return;
    try {
      await loadDetector(setModelPct);
      setModelReady(true);
    } catch {
      setDetectOn(false);
      setModelPct(0);
    }
  }, [detectOn, modelReady]);

  const capture = () => {
    const v = videoRef.current;
    if (!v?.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    c.toBlob((blob) => {
      if (blob) onCapture(new File([blob], "live-capture.jpg", { type: "image/jpeg" }));
    }, "image/jpeg", 0.9);
  };

  const rows = surfaces.map((s) => {
    const meta = SURFACE_CLASS[s.key] || SURFACE_CLASS.concrete;
    const f = surfaceTemp(s.key, airTemp, uv);
    const v = heatVerdict(f);
    return { ...s, name: meta.name, swatch: meta.swatch, f, verdict: v.label, bars: v.bars, advice: meta.advice };
  });

  const hottest = rows.reduce((a, b) => (b.f > (a?.f ?? -999) ? b : a), null);

  return (
    <div style={{ position: "relative", flex: 1, background: "#000", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <video ref={videoRef} playsInline muted
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      <canvas ref={canvasRef} style={{ display: "none" }} />

      {/* Top bar */}
      <div style={{ position: "relative", zIndex: 3, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "linear-gradient(rgba(0,0,0,.55), transparent)" }}>
        <button onClick={onClose} aria-label="Close camera"
          style={{ background: "rgba(0,0,0,.4)", border: "none", borderRadius: 99, width: 34, height: 34, display: "grid", placeItems: "center", cursor: "pointer" }}>
          <X size={18} color="#fff" />
        </button>
        <span style={{ color: "#fff", fontSize: 13.5, fontWeight: 700, fontFamily: FONT, textShadow: "0 1px 3px rgba(0,0,0,.6)" }}>
          Live Scan {conditions ? `· UV ${uv.toFixed(1)} · ${airTemp}°F` : ""}
        </span>
        <button onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))} aria-label="Flip camera"
          style={{ background: "rgba(0,0,0,.4)", border: "none", borderRadius: 99, width: 34, height: 34, display: "grid", placeItems: "center", cursor: "pointer" }}>
          <RefreshCw size={16} color="#fff" />
        </button>
      </div>

      {/* Permission and failure states */}
      {status !== "live" && (
        <div style={{ position: "relative", zIndex: 3, flex: 1, display: "grid", placeItems: "center", padding: 28, textAlign: "center" }}>
          <div>
            {status === "starting" && <p style={{ color: "#fff", fontFamily: FONT, fontSize: 15 }}>Starting camera…</p>}
            {status === "denied" && (
              <>
                <CameraOff size={40} color="#fff" />
                <p style={{ color: "#fff", fontFamily: FONT, fontSize: 15, lineHeight: 1.6, marginTop: 14 }}>
                  Camera access was blocked.<br />
                  Allow it in your browser's site settings, then reopen this screen.
                </p>
              </>
            )}
            {status === "unsupported" && (
              <p style={{ color: "#fff", fontFamily: FONT, fontSize: 15, lineHeight: 1.6 }}>
                This browser can't open a camera stream.<br />Use the photo upload instead.
              </p>
            )}
            {status === "error" && (
              <p style={{ color: "#fff", fontFamily: FONT, fontSize: 15, lineHeight: 1.6 }}>
                Couldn't start the camera.<br />Another app may be using it.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Centre reticle showing which part of the frame is measured */}
      {status === "live" && (
        <div style={{ position: "absolute", left: "50%", top: "62%", transform: "translate(-50%,-50%)", zIndex: 2, pointerEvents: "none" }}>
          <div style={{ width: 132, height: 92, border: "2px solid rgba(255,255,255,.85)", borderRadius: 12, boxShadow: "0 0 0 9999px rgba(0,0,0,.14)" }} />
          <p style={{ margin: "7px 0 0", textAlign: "center", color: "#fff", fontSize: 11, fontFamily: FONT, textShadow: "0 1px 3px rgba(0,0,0,.8)" }}>
            Point at the ground
          </p>
        </div>
      )}

      {/* Object boxes */}
      {status === "live" && detectOn && objects.length > 0 && (
        <div style={{ position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none" }}>
          {objects.map((o, i) => {
            const v = videoRef.current;
            if (!v?.videoWidth) return null;
            const sx = v.clientWidth / v.videoWidth;
            const sy = v.clientHeight / v.videoHeight;
            const scale = Math.max(sx, sy);
            const offX = (v.clientWidth - v.videoWidth * scale) / 2;
            const offY = (v.clientHeight - v.videoHeight * scale) / 2;
            const [x, y, w, h] = o.bbox;
            const col = kindColor(o.kind);
            return (
              <div key={i} style={{
                position: "absolute",
                left: offX + x * scale, top: offY + y * scale,
                width: w * scale, height: h * scale,
                border: `2px solid ${col}`, borderRadius: 6,
              }}>
                <span style={{
                  position: "absolute", top: -21, left: -2, background: col, color: "#fff",
                  fontSize: 10.5, fontWeight: 700, fontFamily: FONT, padding: "2px 6px",
                  borderRadius: 5, whiteSpace: "nowrap",
                }}>{o.icon} {o.label}{o.count > 1 ? ` ×${o.count}` : ""}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Readout */}
      {status === "live" && (
        <div style={{ position: "relative", zIndex: 3, marginTop: "auto", background: "linear-gradient(transparent, rgba(0,0,0,.82) 22%)", padding: "34px 14px 14px" }}>
          {hottest && (
            <p style={{ margin: "0 0 9px", color: "#fff", fontSize: 15, fontWeight: 700, fontFamily: FONT }}>
              {hottest.name} · about {hottest.f}°F · {hottest.verdict}
            </p>
          )}

          <div style={{ display: "grid", gap: 6, marginBottom: 11 }}>
            {rows.map((s) => (
              <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ width: 13, height: 13, borderRadius: 3, background: s.swatch, flexShrink: 0 }} />
                <span style={{ flex: 1, color: "#fff", fontSize: 12.5, fontFamily: FONT }}>{s.name}</span>
                <span style={{ color: "rgba(255,255,255,.75)", fontSize: 12, fontFamily: FONT }}>{Math.round(s.share)}%</span>
                <span style={{ color: "#fff", fontSize: 12.5, fontWeight: 700, fontFamily: FONT, width: 44, textAlign: "right" }}>{s.f}°F</span>
              </div>
            ))}
            {!rows.length && <p style={{ margin: 0, color: "rgba(255,255,255,.7)", fontSize: 12.5, fontFamily: FONT }}>Reading surfaces…</p>}
          </div>

          {detectOn && !modelReady && (
            <div style={{ marginBottom: 10 }}>
              <p style={{ margin: "0 0 5px", color: "rgba(255,255,255,.85)", fontSize: 11.5, fontFamily: FONT }}>
                Loading detection model… {modelPct}%
              </p>
              <div style={{ height: 4, borderRadius: 99, background: "rgba(255,255,255,.25)", overflow: "hidden" }}>
                <div style={{ width: `${modelPct}%`, height: "100%", background: C.blue, transition: "width .3s" }} />
              </div>
            </div>
          )}

          {detectOn && modelReady && objects.filter((o) => o.note).length > 0 && (
            <p style={{ margin: "0 0 10px", color: "rgba(255,255,255,.9)", fontSize: 12, lineHeight: 1.45, fontFamily: FONT }}>
              {objects.find((o) => o.note)?.note}
            </p>
          )}

          <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
            <button onClick={enableDetection}
              style={{
                flex: 1, padding: "11px 0", borderRadius: 10, border: "none", cursor: "pointer",
                background: detectOn ? C.blue : "rgba(255,255,255,.18)", color: "#fff",
                fontSize: 13, fontWeight: 700, fontFamily: FONT,
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}>
              {detectOn ? <Zap size={15} /> : <ZapOff size={15} />}
              {detectOn ? "Detection on" : "Detect objects"}
            </button>
            <button onClick={capture}
              style={{
                width: 54, height: 54, borderRadius: 99, border: "4px solid #fff",
                background: "rgba(255,255,255,.25)", cursor: "pointer", flexShrink: 0,
                display: "grid", placeItems: "center",
              }} aria-label="Capture and run full analysis">
              <Camera size={20} color="#fff" />
            </button>
          </div>

          <p style={{ margin: "9px 0 0", color: "rgba(255,255,255,.55)", fontSize: 10.5, fontFamily: FONT, textAlign: "center" }}>
            Everything runs on your device. No frames are uploaded.
          </p>
        </div>
      )}
    </div>
  );
}
