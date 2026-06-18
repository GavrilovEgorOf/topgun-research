import { loadMeta } from "./storage.js";
import { getArchitectureSummary } from "../shared/brain-inspect.js";
import {
  WORLD_SEED,
  MATCH_TIMEOUT,
  ES_POPULATION,
  ES_ELITE,
  ES_MUTATION,
  NN_INPUT,
  NN_HIDDEN,
  NN_OUTPUT,
  MAP_SIZE,
  FIXED_DT,
} from "../shared/config.js";
import { FITNESS_MODEL } from "../shared/rewards.js";

export function historyToCsv(history) {
  if (!history?.length) return "gen\n";
  const keys = Object.keys(history[0]);
  const esc = (v) => {
    if (v == null) return "";
    const s = String(v);
    return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [keys.join(",")];
  for (const row of history) {
    lines.push(keys.map((k) => esc(row[k])).join(","));
  }
  return lines.join("\n");
}

export function buildExperimentProtocol(meta, engine) {
  const status = engine?.buildStatus?.() ?? {};
  return {
    exportedAt: new Date().toISOString(),
    project: "TopGun Research",
    algorithm: "Эволюционные стратегии (элита + кроссовер + гауссова мутация)",
    environment: {
      mapSize: MAP_SIZE,
      matchTimeoutSec: MATCH_TIMEOUT,
      worldSeed: WORLD_SEED,
      mapSeedPolicy: "random per evaluation and champion match; fixed for checkpoint compare",
      fixedDt: FIXED_DT,
    },
    neuralNetwork: getArchitectureSummary(),
    evolution: {
      population: ES_POPULATION,
      elite: ES_ELITE,
      initialMutation: ES_MUTATION,
    },
    fitnessModel: FITNESS_MODEL,
    session: {
      championGames: meta.championGames ?? meta.totalGames ?? 0,
      evalGames: meta.evalGames ?? 0,
      totalGames: meta.championGames ?? meta.totalGames ?? 0,
      blueWins: meta.blueWins ?? 0,
      redWins: meta.redWins ?? 0,
      draws: meta.draws ?? 0,
      blueGeneration: status.blueGeneration ?? 0,
      redGeneration: status.redGeneration ?? 0,
      parallelGames: status.parallelGames ?? meta.parallelGames,
      workerCount: status.workerCount,
      bestKillTimeMs: meta.bestKillTimeMs,
      sessionUptimeMs: status.sessionUptimeMs,
    },
    historyPoints: meta.history?.length ?? 0,
  };
}

export function buildMetaExport(meta, engine) {
  return {
    protocol: buildExperimentProtocol(meta, engine),
    meta,
    history: meta.history ?? [],
  };
}

export function downloadText(filename, text, mime = "text/plain") {
  return { filename, text, mime };
}

export function metaSummaryRows(meta) {
  const championGames = meta.championGames ?? meta.totalGames ?? 0;
  const total = championGames || 1;
  const kills = (meta.blueWins ?? 0) + (meta.redWins ?? 0);
  return {
    championGames,
    evalGames: meta.evalGames ?? 0,
    totalGames: championGames,
    killRate: (kills / total) * 100,
    drawRate: ((meta.draws ?? 0) / total) * 100,
    winRateBlue: ((meta.blueWins ?? 0) / total) * 100,
    winRateRed: ((meta.redWins ?? 0) / total) * 100,
    visibleKillRate: meta.visibleKillRate ?? 0,
    weaponSightRate: meta.weaponSightRate ?? 0,
    historyLength: meta.history?.length ?? 0,
  };
}
