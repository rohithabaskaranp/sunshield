import React from "react";
import { createRoot } from "react-dom/client";
import SunShield from "./SunShield.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <SunShield />
  </React.StrictMode>
);
