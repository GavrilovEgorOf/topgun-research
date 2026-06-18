import { defineConfig } from "vite";

/** Prefix root-absolute page hrefs with Vite base (GitHub Pages subpath). */
function htmlBaseLinkPlugin(base) {
  const isPagePath = (path) =>
    path === "" ||
    path === "demo.html" ||
    path === "research.html" ||
    path === "index.html" ||
    path.startsWith("theory_for_uni/");

  return {
    name: "html-base-link",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        if (!base || base === "/") return html;
        const prefix = base.endsWith("/") ? base.slice(0, -1) : base;
        return html.replace(/\bhref="\/([^"]*)"/g, (full, path) => {
          if (!isPagePath(path)) return full;
          return `href="${prefix}/${path}"`;
        });
      },
    },
  };
}

const base = process.env.VITE_BASE || "/";

export default defineConfig({
  base,
  plugins: [htmlBaseLinkPlugin(base)],
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
