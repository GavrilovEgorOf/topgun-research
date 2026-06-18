/**
 * Export a static demo bundle to public/demo/ for GitHub Pages / offline replay.
 * Run: node scripts/export-demo.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { summarizeBrain, getArchitectureSummary } from "../shared/brain-inspect.js";
import { NeuralNetwork } from "../shared/neural.js";
import { describeFitnessExample } from "../shared/rewards.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "public", "demo");
const DATA = path.join(ROOT, "data");

function readJson(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data), "utf8");
}

function trimCheckpoint(cp) {
  return {
    generation: cp.generation,
    savedAt: cp.savedAt,
    blue: {
      generation: cp.blue?.generation,
      mutation: cp.blue?.mutation,
      champion: cp.blue?.champion,
    },
    red: {
      generation: cp.red?.generation,
      mutation: cp.red?.mutation,
      champion: cp.red?.champion,
    },
  };
}

function main() {
  const meta = readJson(path.join(DATA, "meta.json"));
  const state = readJson(path.join(DATA, "state.json"));
  const replays = readJson(path.join(DATA, "replays.json"), []);

  if (!meta || !state || !replays.length) {
    console.error("Missing data/. Run training first or copy sample data.");
    process.exit(1);
  }

  const best = [...replays].sort((a, b) => a.killTimeMs - b.killTimeMs)[0];
  const replayOut = {
    id: best.id,
    killTimeMs: best.killTimeMs,
    winner: best.winner,
    seed: best.seed,
    time: best.time,
    frames: best.frames,
    blueBrain: best.blueBrain,
    redBrain: best.redBrain,
  };

  const blueNet = NeuralNetwork.fromJSON(state.blue.champion);
  const redNet = NeuralNetwork.fromJSON(state.red.champion);
  const championGames = meta.championGames ?? meta.totalGames ?? 0;
  const kills = (meta.blueWins ?? 0) + (meta.redWins ?? 0);
  const history = (meta.history ?? []).slice(-80);
  const lastGen = history[history.length - 1] ?? null;

  const status = {
    demo: true,
    championGames,
    evalGames: meta.evalGames ?? 0,
    totalGames: championGames,
    blueWins: meta.blueWins ?? 0,
    redWins: meta.redWins ?? 0,
    draws: meta.draws ?? 0,
    kills,
    killRate: championGames ? (kills / championGames) * 100 : 0,
    drawRate: championGames ? ((meta.draws ?? 0) / championGames) * 100 : 0,
    avgKillTimeMs: meta.killCount ? Math.round(meta.sumKillTimeMs / meta.killCount) : null,
    bestKillTimeMs: meta.bestKillTimeMs ?? null,
    blueGeneration: state.blue.generation,
    redGeneration: state.red.generation,
    generation: Math.min(state.blue.generation, state.red.generation),
    blueMutation: state.blue.mutation,
    redMutation: state.red.mutation,
    parallelGames: meta.parallelGames ?? 48,
    workerCount: 4,
    blueActions: "—",
    redActions: "—",
    replaysCount: replays.length,
    replays: replays.map((r) => ({
      id: r.id,
      killTimeMs: r.killTimeMs,
      winner: r.winner,
      seed: r.seed,
    })),
    training: false,
    history,
    lastGen,
    sessionUptimeMs: 0,
    generationsTotal: Math.min(state.blue.generation, state.red.generation),
    checkpointsCount: 2,
    visibleKillRate: meta.visibleKillRate ?? 0,
    weaponSightRate: meta.weaponSightRate ?? 0,
    architecture: getArchitectureSummary(),
    blueBrainSummary: summarizeBrain(blueNet),
    redBrainSummary: summarizeBrain(redNet),
    lastChampionBreakdown: best
      ? describeFitnessExample({
          time: best.time,
          winner: best.winner,
          stats: best.stats,
          reason: "kill",
        })
      : null,
  };

  const cpGens = [100, 400];
  const checkpoints = [];
  for (const gen of cpGens) {
    const cp = readJson(path.join(DATA, "checkpoints", `gen-${gen}.json`));
    if (!cp) {
      console.warn(`Checkpoint gen-${gen}.json not found, skipping`);
      continue;
    }
    writeJson(path.join(OUT, "checkpoints", `gen-${gen}.json`), trimCheckpoint(cp));
    checkpoints.push({ generation: gen, savedAt: cp.savedAt });
  }

  writeJson(path.join(OUT, "status.json"), status);
  writeJson(path.join(OUT, "replays.json"), status.replays);
  writeJson(path.join(OUT, `replay-${best.id}.json`), replayOut);
  writeJson(path.join(OUT, "checkpoints.json"), checkpoints);
  writeJson(path.join(OUT, "manifest.json"), {
    version: 1,
    exportedAt: new Date().toISOString(),
    featuredReplayId: best.id,
    checkpointGenerations: checkpoints.map((c) => c.generation),
    note: "Static demo bundle — no training server required",
  });

  const replayKb = (fs.statSync(path.join(OUT, `replay-${best.id}.json`)).size / 1024).toFixed(1);
  console.log(`Demo exported to public/demo/ (featured replay #${best.id}, ${replayKb} KB)`);
}

main();
