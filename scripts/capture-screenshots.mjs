/**
 * Capture README screenshots from the live GitHub Pages deployment.
 * Usage: node scripts/capture-screenshots.mjs
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "docs", "screenshots");
const base = "https://gavrilovegorof.github.io/topgun-research";

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  await page.goto(`${base}/`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: join(outDir, "landing-hero.png"),
    clip: { x: 0, y: 0, width: 1440, height: 900 },
  });
  console.log("Saved landing-hero.png");

  await page.goto(`${base}/demo.html`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForSelector("#game-canvas", { timeout: 30_000 });
  await page.waitForTimeout(4000);

  const game = page.locator("#game-container");
  await game.screenshot({ path: join(outDir, "demo-replay.png") });
  console.log("Saved demo-replay.png");

  const panel = page.locator("#settings-panel");
  await panel.screenshot({ path: join(outDir, "demo-chart.png") });
  console.log("Saved demo-chart.png");
} finally {
  await browser.close();
}
