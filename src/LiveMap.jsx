/* ═══════════════════════════════════════════════════════════════
   LiveMap.jsx — real map tiles with a live UV overlay.

   Leaflet plus OpenStreetMap needs no API key and no billing
   account, which matters because this app is served as static files
   with no backend to hide a token behind. Mapbox and Google both
   require a key that would end up readable in the page source.

   Leaflet is imperative, so it lives behind a ref and effects
   rather than being wrapped in React components.
   ═══════════════════════════════════════════════════════════════ */

import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const UV_COLOR = (uv) =>
  uv == null ? "#8B9096"
    : uv < 3 ? "#4CAF50"
    : uv < 6 ? "#FFCC33"
    : uv < 8 ? "#FF9F2E"
    : uv < 11 ? "#F4573F"
    : "#B33FD1";

const UV_LABEL = (uv) =>
  uv == null ? "Unknown"
    : uv < 3 ? "Low" : uv < 6 ? "Moderate" : uv < 8 ? "High"
    : uv < 11 ? "Very High" : "Extreme";

export default function LiveMap({
  lat, lon, height = 340, grid = [], onPointSelect, interactive = true, zoom = 11,
}) {
  const hostRef = useRef(null);
  const mapRef = useRef(null);
  const overlayRef = useRef(null);
  const markerRef = useRef(null);
  const [ready, setReady] = useState(false);

  /* Create the map once. */
  useEffect(() => {
    if (!hostRef.current || mapRef.current) return;

    const map = L.map(hostRef.current, {
      center: [lat, lon],
      zoom,
      zoomControl: interactive,
      dragging: interactive,
      scrollWheelZoom: false,
      doubleClickZoom: interactive,
      touchZoom: interactive,
      attributionControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    overlayRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    setReady(true);

    /* Leaflet measures its container on creation. Inside a screen
       that just mounted, that measurement can land at zero height
       and leave grey tiles, so remeasure on the next frames and on
       any resize. */
    const settle = () => map.invalidateSize({ animate: false });
    const t1 = setTimeout(settle, 60);
    const t2 = setTimeout(settle, 320);
    window.addEventListener("resize", settle);

    return () => {
      clearTimeout(t1); clearTimeout(t2);
      window.removeEventListener("resize", settle);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  /* Recentre when the location changes. */
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setView([lat, lon], zoom, { animate: true });

    if (markerRef.current) markerRef.current.remove();
    markerRef.current = L.marker([lat, lon], {
      icon: L.divIcon({
        className: "",
        html: `<div style="width:20px;height:20px;border-radius:50%;background:#0A6CFF;border:3px solid #fff;box-shadow:0 0 0 2px rgba(10,108,255,.35), 0 2px 6px rgba(0,0,0,.3)"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      }),
      keyboard: false,
    }).addTo(mapRef.current);
  }, [lat, lon, zoom, ready]);

  /* Redraw the UV overlay whenever new grid readings arrive. */
  useEffect(() => {
    const layer = overlayRef.current;
    if (!layer || !mapRef.current) return;
    layer.clearLayers();
    if (!grid.length) return;

    grid.forEach((p) => {
      const color = UV_COLOR(p.uv);
      const circle = L.circle([p.lat, p.lon], {
        radius: 4200,
        color,
        weight: 1,
        opacity: 0.5,
        fillColor: color,
        fillOpacity: 0.26,
      });
      circle.bindTooltip(
        `UV ${p.uv.toFixed(1)} · ${UV_LABEL(p.uv)}<br>${p.temp}°F · ${p.cloud}% cloud`,
        { direction: "top", offset: [0, -4] }
      );
      if (onPointSelect) circle.on("click", () => onPointSelect(p));
      circle.addTo(layer);
    });

    const bounds = L.latLngBounds(grid.map((p) => [p.lat, p.lon]));
    mapRef.current.fitBounds(bounds, { padding: [24, 24], maxZoom: 11 });
  }, [grid, onPointSelect]);

  return (
    <div style={{ position: "relative", height, flexShrink: 0 }}>
      <div ref={hostRef} style={{ height: "100%", width: "100%", background: "#E8E9ED" }} />
    </div>
  );
}
