import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base must match your repo name for GitHub Pages:
// https://rohithabaskaranp.github.io/sunshield/
export default defineConfig({
  plugins: [react()],
  base: "/sunshield/",
  build: {
    /* TensorFlow.js is large but dynamically imported, so it lands
       in its own chunk and only downloads when someone turns on
       object detection. The warning would flag it every build. */
    chunkSizeWarningLimit: 1600,
  },
});
