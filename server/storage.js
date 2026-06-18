import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { CHECKPOINT_MAX } from "../shared/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(__dirname, "..", "data");

const PATHS = {
  state: path.join(DATA_DIR, "state.json"),
  replays: path.join(DATA_DIR, "replays.json"),
  meta: path.join(DATA_DIR, "meta.json"),
  checkpoints: path.join(DATA_DIR, "checkpoints"),
};

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(file, fallback) {
  ensureDir();
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    console.warn(`[storage] Failed to read ${path.basename(file)}: ${err.message}`);
    return fallback;
  }
}

function writeJson(file, data) {
  ensureDir();
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

export function loadState() {
  return readJson(PATHS.state, null);
}

export function saveState(state) {
  writeJson(PATHS.state, state);
}

export function loadReplays() {
  return readJson(PATHS.replays, []);
}

export function saveReplays(replays) {
  writeJson(PATHS.replays, replays);
}

export function loadMeta() {
  return readJson(PATHS.meta, {
    totalGames: 0,
    championGames: 0,
    evalGames: 0,
    blueWins: 0,
    redWins: 0,
    draws: 0,
    bestKillTimeMs: Infinity,
    nextReplayId: 1,
    parallelGames: 48,
    history: [],
  });
}

export function saveMeta(meta) {
  writeJson(PATHS.meta, meta);
}

export function addReplay(replay) {
  const replays = loadReplays();
  replays.unshift(replay);
  replays.sort((a, b) => a.killTimeMs - b.killTimeMs);
  if (replays.length > 50) replays.length = 50;
  saveReplays(replays);
  return replays;
}

export function getReplay(id) {
  return loadReplays().find((r) => r.id === id) ?? null;
}

export function clearCheckpoints() {
  if (!fs.existsSync(PATHS.checkpoints)) return;
  for (const name of fs.readdirSync(PATHS.checkpoints)) {
    fs.unlinkSync(path.join(PATHS.checkpoints, name));
  }
}

export function resetAll() {
  for (const file of Object.values(PATHS)) {
    if (file === PATHS.checkpoints) {
      clearCheckpoints();
      continue;
    }
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}

export function saveCheckpoint(payload) {
  ensureDir();
  if (!fs.existsSync(PATHS.checkpoints)) {
    fs.mkdirSync(PATHS.checkpoints, { recursive: true });
  }
  const file = path.join(PATHS.checkpoints, `gen-${payload.generation}.json`);
  writeJson(file, payload);
  const files = fs
    .readdirSync(PATHS.checkpoints)
    .filter((f) => f.startsWith("gen-"))
    .sort((a, b) => {
      const ga = Number(a.match(/\d+/)?.[0] ?? 0);
      const gb = Number(b.match(/\d+/)?.[0] ?? 0);
      return ga - gb;
    });
  const maxKeep = CHECKPOINT_MAX;
  while (files.length > maxKeep) {
    const old = files.shift();
    fs.unlinkSync(path.join(PATHS.checkpoints, old));
  }
  return file;
}

export function listCheckpoints() {
  if (!fs.existsSync(PATHS.checkpoints)) return [];
  return fs
    .readdirSync(PATHS.checkpoints)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const gen = Number(f.match(/\d+/)?.[0] ?? 0);
      const stat = fs.statSync(path.join(PATHS.checkpoints, f));
      return { generation: gen, file: f, savedAt: stat.mtimeMs };
    })
    .sort((a, b) => b.generation - a.generation);
}

export function loadCheckpoint(generation) {
  const file = path.join(PATHS.checkpoints, `gen-${generation}.json`);
  return readJson(file, null);
}
