import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.VITE_BASE || "/",
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        research: "research.html",
        demo: "demo.html",
        theory: "theory_for_uni/index.html",
      },
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three")) return "three";
          if (id.includes("node_modules/chart.js") || id.includes("chartjs-chart-matrix")) {
            return "charts";
          }
        },
      },
    },
  },
  server: {
    host: true,
    port: 8080,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
      "/ws": {
        target: "http://127.0.0.1:3001",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
