import os from "os";
import { Worker } from "worker_threads";
import path from "path";
import { fileURLToPath } from "url";
import { Simulation, isImprovingKill } from "../shared/simulation.js";
import { EvolutionTrainer, NeuralNetwork } from "../shared/neural.js";
import { WORLD_SEED, HISTORY_MAX, BLIND_TRAINING_GENS, BLIND_EXPLORATION_MULT, CHECKPOINT_EVERY_GENS, DOMINANCE_WIN_THRESHOLD, DOMINANCE_MUTATION_BOOST, DOMINANCE_MUTATION_CAP } from "../shared/config.js";
import { actionLabels } from "../shared/observations.js";
import { randomMapSeed } from "../shared/utils.js";
import {
  loadState,
  saveState,
  loadMeta,
  saveMeta,
  addReplay,
  loadReplays,
  saveReplays,
  getReplay,
  saveCheckpoint,
  listCheckpoints,
  loadCheckpoint,
  clearCheckpoints,
} from "./storage.js";
import { getArchitectureSummary, summarizeBrain } from "../shared/brain-inspect.js";
import { getRewardsPayload, describeFitnessExample, FITNESS_MODEL } from "../shared/rewards.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_FILE = path.join(__dirname, "worker.js");
const WORKER_TIMEOUT_MS = 120_000;

function migrateMeta(meta) {
  if (meta.statsMigrated) return meta;
  if (meta.championGames == null) {
    console.warn(
      "[training] Migrating session stats: win counters reset (old totalGames mixed eval + champion)."
    );
    meta.championGames = 0;
    meta.evalGames = 0;
    meta.totalGames = 0;
    meta.blueWins = 0;
    meta.redWins = 0;
    meta.draws = 0;
    meta.sumKillTimeMs = 0;
    meta.killCount = 0;
  }
  meta.championGames = meta.championGames ?? 0;
  meta.evalGames = meta.evalGames ?? 0;
  meta.totalGames = meta.championGames;
  meta.statsMigrated = true;
  return meta;
}

export class TrainingEngine {
  constructor(options = {}) {
    this.parallelGames = options.parallelGames ?? 48;
    this.workerCount = options.workerCount ?? Math.max(2, os.cpus().length - 2);
    this.listeners = new Set();
    this.running = false;
    this.meta = migrateMeta(loadMeta());
    if (!this.meta.statsMigrated) saveMeta(this.meta);
    this.parallelGames = this.meta.parallelGames ?? this.parallelGames;
    this.checkpointsCount = listCheckpoints().length;

    const saved = loadState();
    if (saved) {
      this.blueTrainer = EvolutionTrainer.fromState(saved.blue);
      this.redTrainer = EvolutionTrainer.fromState(saved.red);
    } else {
      this.blueTrainer = new EvolutionTrainer("blue");
      this.redTrainer = new EvolutionTrainer("red");
    }

    this.workers = [];
    this.pendingBatches = new Map();
    this.batchId = 0;
    this.liveSim = null;
    this.liveFrame = 0;
    this.meta.history = this.meta.history ?? [];
    this.meta.sumKillTimeMs = this.meta.sumKillTimeMs ?? 0;
    this.meta.killCount = this.meta.killCount ?? 0;
    this.meta.sessionStartedAt = this.meta.sessionStartedAt ?? Date.now();
    this.lastGenStats = null;
    this.lastChampion = null;
    this.status = this.buildStatus();
  }

  getChampions() {
    return {
      blue: this.blueTrainer.champion,
      red: this.redTrainer.champion,
    };
  }

  onUpdate(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    this.status = this.buildStatus();
    for (const fn of this.listeners) fn(this.status);
  }

  getExplorationMult() {
    const gen = Math.min(this.blueTrainer.generation, this.redTrainer.generation);
    if (gen < BLIND_TRAINING_GENS) return BLIND_EXPLORATION_MULT;
    if (this.lastGenStats) {
      const avgPickup =
        (this.lastGenStats.blue.pickupPct + this.lastGenStats.red.pickupPct) / 2;
      if (avgPickup < 35) return BLIND_EXPLORATION_MULT;
    }
    return 1;
  }

  applyDominanceMutation() {
    const decisive = this.meta.blueWins + this.meta.redWins;
    if (decisive < 80) return;
    const blueRate = this.meta.blueWins / decisive;
    const redRate = this.meta.redWins / decisive;
    if (blueRate > DOMINANCE_WIN_THRESHOLD) {
      this.redTrainer.mutation = Math.min(
        DOMINANCE_MUTATION_CAP,
        this.redTrainer.mutation * DOMINANCE_MUTATION_BOOST
      );
    } else if (redRate > DOMINANCE_WIN_THRESHOLD) {
      this.blueTrainer.mutation = Math.min(
        DOMINANCE_MUTATION_CAP,
        this.blueTrainer.mutation * DOMINANCE_MUTATION_BOOST
      );
    }
  }

  maybeSaveCheckpoint() {
    const gen = this.blueTrainer.generation;
    if (!gen || gen % CHECKPOINT_EVERY_GENS !== 0) return;
    saveCheckpoint({
      generation: gen,
      savedAt: Date.now(),
      blue: this.blueTrainer.toState(),
      red: this.redTrainer.toState(),
      meta: { ...this.meta, history: undefined },
    });
    this.checkpointsCount = listCheckpoints().length;
  }

  buildLastGenSnapshot() {
    if (this.lastGenStats) {
      const b = this.lastGenStats.blue;
      const r = this.lastGenStats.red;
      return {
        blueFitness: b.avgFitness,
        redFitness: r.avgFitness,
        bluePickupPct: b.pickupPct,
        redPickupPct: r.pickupPct,
        blueKillRate: b.killRate,
        redKillRate: r.killRate,
      };
    }
    const h = this.meta.history ?? [];
    return h[h.length - 1] ?? null;
  }

  buildStatus() {
    const replays = loadReplays();
    const championGames = this.meta.championGames ?? 0;
    const h = this.meta.history ?? [];
    const lastGen = this.buildLastGenSnapshot();
    const generation = Math.min(this.blueTrainer.generation, this.redTrainer.generation);
    const kills = this.meta.blueWins + this.meta.redWins;

    return {
      championGames,
      evalGames: this.meta.evalGames ?? 0,
      totalGames: championGames,
      blueWins: this.meta.blueWins,
      redWins: this.meta.redWins,
      draws: this.meta.draws,
      kills,
      killRate: championGames ? (kills / championGames) * 100 : 0,
      winRateBlue: championGames ? (this.meta.blueWins / championGames) * 100 : 0,
      winRateRed: championGames ? (this.meta.redWins / championGames) * 100 : 0,
      drawRate: championGames ? (this.meta.draws / championGames) * 100 : 0,
      avgKillTimeMs: this.meta.killCount
        ? Math.round(this.meta.sumKillTimeMs / this.meta.killCount)
        : null,
      bestKillTimeMs: Number.isFinite(this.meta.bestKillTimeMs) ? this.meta.bestKillTimeMs : null,
      blueGeneration: this.blueTrainer.generation,
      redGeneration: this.redTrainer.generation,
      generation,
      blueMutation: this.blueTrainer.mutation,
      redMutation: this.redTrainer.mutation,
      parallelGames: this.parallelGames,
      workerCount: this.workerCount,
      blueActions: this.status?.blueActions ?? "—",
      redActions: this.status?.redActions ?? "—",
      replaysCount: replays.length,
      replays: replays.map((r) => ({
        id: r.id,
        killTimeMs: r.killTimeMs,
        winner: r.winner,
        seed: r.seed,
      })),
      activeReplayId: this.activeReplayId ?? null,
      training: this.running,
      history: h,
      lastGen,
      lastChampion: this.lastChampion,
      sessionUptimeMs: Date.now() - (this.meta.sessionStartedAt ?? Date.now()),
      generationsTotal: generation,
      explorationMult: this.getExplorationMult(),
      blindTrainingActive: this.getExplorationMult() > 1,
      checkpointsCount: this.checkpointsCount,
      visibleKillRate: this.meta.visibleKillRate ?? 0,
      weaponSightRate: this.meta.weaponSightRate ?? 0,
      architecture: getArchitectureSummary(),
      blueBrainSummary: summarizeBrain(this.blueTrainer.champion),
      redBrainSummary: summarizeBrain(this.redTrainer.champion),
      lastChampionBreakdown: this.lastChampion
        ? describeFitnessExample({
            time: this.lastChampion.time,
            winner: this.lastChampion.winner,
            stats: this.lastChampion.stats,
            reason: this.lastChampion.reason,
          })
        : null,
    };
  }

  async restartWorkers() {
    for (const worker of this.workers) {
      await worker.terminate().catch(() => {});
    }
    this.workers = [];
    this.pendingBatches.clear();
    await this.initWorkers();
  }

  async initWorkers() {
    if (this.workers.length) return;
    const ready = [];
    for (let i = 0; i < this.workerCount; i++) {
      const worker = new Worker(WORKER_FILE, { workerData: { warmup: true } });
      const p = new Promise((resolve) => {
        worker.once("message", (msg) => {
          if (msg.type === "ready") resolve();
        });
      });
      worker.on("message", (msg) => this.handleWorkerMessage(worker, msg));
      this.workers.push(worker);
      ready.push(p);
    }
    await Promise.all(ready);
  }

  handleWorkerMessage(worker, msg) {
    if (msg.type === "error") {
      const batch = this.pendingBatches.get(msg.batchId);
      if (batch) {
        this.pendingBatches.delete(msg.batchId);
        batch.reject?.(new Error(msg.error));
      }
      return;
    }
    if (msg.type !== "results") return;
    const batch = this.pendingBatches.get(msg.batchId);
    if (!batch) return;
    batch.results.push(...msg.results);
    if (batch.results.length >= batch.expected) {
      this.pendingBatches.delete(msg.batchId);
      batch.resolve(batch.results);
    }
  }

  dispatchJobs(jobs) {
    const batchId = ++this.batchId;
    const perWorker = Math.ceil(jobs.length / this.workerCount);
    const expected = jobs.length;
    const results = [];

    const batchPromise = new Promise((resolve, reject) => {
      this.pendingBatches.set(batchId, { expected, results, resolve, reject });
      for (let w = 0; w < this.workerCount; w++) {
        const slice = jobs.slice(w * perWorker, (w + 1) * perWorker);
        if (!slice.length) continue;
        this.workers[w].postMessage({ type: "evaluate", batchId, jobs: slice });
      }
    });

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Worker batch ${batchId} timed out`)), WORKER_TIMEOUT_MS);
    });

    return Promise.race([batchPromise, timeoutPromise]);
  }

  async evaluatePopulation(side, opponentChampion) {
    const trainer = side === "blue" ? this.blueTrainer : this.redTrainer;
    const explorationMult = this.getExplorationMult();
    const jobs = trainer.population.map((genome, genomeIndex) => ({
      jobId: `${side}-${genomeIndex}`,
      side,
      genomeIndex,
      seed: randomMapSeed(),
      recordReplay: false,
      explorationMult,
      blueGenome: side === "blue" ? genome.toJSON() : opponentChampion.toJSON(),
      redGenome: side === "red" ? genome.toJSON() : opponentChampion.toJSON(),
    }));

    const chunkSize = this.parallelGames;
    const allResults = [];
    for (let i = 0; i < jobs.length; i += chunkSize) {
      const chunk = jobs.slice(i, i + chunkSize);
      try {
        const res = await this.dispatchJobs(chunk);
        allResults.push(...res);
      } catch (err) {
        console.error("Worker batch failed, restarting workers:", err.message);
        await this.restartWorkers();
        const res = await this.dispatchJobs(chunk);
        allResults.push(...res);
      }
    }

    const fitness = new Array(trainer.population.length).fill(0);
    const counts = new Array(trainer.population.length).fill(0);
    let pickups = 0;
    let damage = 0;
    let cells = 0;
    let kills = 0;
    let killTimeSum = 0;
    let timeouts = 0;
    let games = 0;
    let visibleKills = 0;
    let weaponSights = 0;

    for (const r of allResults) {
      fitness[r.genomeIndex] += r.fitness;
      counts[r.genomeIndex]++;
      this.recordEvalGame();
      games++;
      const st = r.result.stats ?? {};
      if (r.result.reason === "kill") {
        kills++;
        killTimeSum += r.result.killTimeMs;
        if (r.result.stats?.visibleKill) visibleKills++;
      } else if (r.result.reason === "timeout") {
        timeouts++;
      }
      if (side === "blue") {
        if (st.bluePickup) pickups++;
        if (st.blueSawWeapon) weaponSights++;
        damage += st.blueDamage ?? 0;
        cells += st.blueNewCells ?? 0;
      } else {
        if (st.redPickup) pickups++;
        if (st.redSawWeapon) weaponSights++;
        damage += st.redDamage ?? 0;
        cells += st.redNewCells ?? 0;
      }
    }
    for (let i = 0; i < fitness.length; i++) {
      fitness[i] = counts[i] ? fitness[i] / counts[i] : -10;
    }

    const avgFitness = fitness.reduce((a, b) => a + b, 0) / fitness.length;
    const bestFitness = Math.max(...fitness);
    return {
      fitness,
      pickupPct: games ? (pickups / games) * 100 : 0,
      avgDamage: games ? damage / games : 0,
      avgCells: games ? cells / games : 0,
      avgFitness,
      bestFitness,
      killRate: games ? (kills / games) * 100 : 0,
      visibleKillRate: kills ? (visibleKills / kills) * 100 : 0,
      weaponSightRate: games ? (weaponSights / games) * 100 : 0,
      timeoutRate: games ? (timeouts / games) * 100 : 0,
      avgKillTimeMs: kills ? Math.round(killTimeSum / kills) : null,
      games,
    };
  }

  recordEvalGame() {
    this.meta.evalGames = (this.meta.evalGames ?? 0) + 1;
  }

  recordChampionResult(result) {
    this.meta.championGames = (this.meta.championGames ?? 0) + 1;
    this.meta.totalGames = this.meta.championGames;
    if (result.reason === "kill") {
      if (result.winner === "blue") this.meta.blueWins++;
      else this.meta.redWins++;
      this.meta.killCount = (this.meta.killCount ?? 0) + 1;
      this.meta.sumKillTimeMs = (this.meta.sumKillTimeMs ?? 0) + result.killTimeMs;
    } else {
      this.meta.draws++;
    }
  }

  recordGameResult(result) {
    this.recordChampionResult(result);
  }

  saveBestReplay(result, blueBrain, redBrain) {
    const replays = loadReplays();
    const exists = replays.some(
      (r) =>
        r.killTimeMs === result.killTimeMs &&
        r.winner === result.winner &&
        r.seed === result.seed
    );
    if (exists) return;

    const id = this.meta.nextReplayId++;
    const replay = {
      id,
      killTimeMs: result.killTimeMs,
      winner: result.winner,
      seed: result.seed,
      time: result.time,
      blueBrain: blueBrain ?? this.blueTrainer.champion.toJSON(),
      redBrain: redBrain ?? this.redTrainer.champion.toJSON(),
      frames: result.replayFrames,
    };
    addReplay(replay);
  }

  async runChampionMatch(record = true) {
    const seed = randomMapSeed();
    const sim = new Simulation(seed, {
      recordReplay: record,
      explorationMult: this.getExplorationMult(),
    });
    const blueNet = this.blueTrainer.champion;
    const redNet = this.redTrainer.champion;
    sim.runToEnd(blueNet, redNet);
    const result = sim.getResult();

    this.status.blueActions = actionLabels(result.lastActions.blue);
    this.status.redActions = actionLabels(result.lastActions.red);

    if (record) {
      if (
        result.reason === "kill" &&
        isImprovingKill(result, this.meta.bestKillTimeMs)
      ) {
        this.meta.bestKillTimeMs = result.killTimeMs;
        this.saveBestReplay(result, blueNet.toJSON(), redNet.toJSON());
      }
      this.recordChampionResult(result);
    }

    this.lastChampion = {
      reason: result.reason,
      winner: result.winner,
      time: result.time,
      killTimeMs: result.killTimeMs,
      blueFitness: result.blueFitness,
      redFitness: result.redFitness,
      stats: result.stats,
    };

    return { result, sim };
  }

  persist() {
    saveState({
      blue: this.blueTrainer.toState(),
      red: this.redTrainer.toState(),
    });
    saveMeta(this.meta);
  }

  recordHistory(blueEval, redEval, championResult) {
    const st = championResult?.stats ?? {};
    const entry = {
      gen: this.blueTrainer.generation,
      blueFitness: blueEval.avgFitness,
      redFitness: redEval.avgFitness,
      blueBestFitness: blueEval.bestFitness,
      redBestFitness: redEval.bestFitness,
      bluePickupPct: blueEval.pickupPct,
      redPickupPct: redEval.pickupPct,
      pickupPct: (blueEval.pickupPct + redEval.pickupPct) / 2,
      blueAvgCells: blueEval.avgCells,
      redAvgCells: redEval.avgCells,
      avgDamage: (blueEval.avgDamage + redEval.avgDamage) / 2,
      blueKillRate: blueEval.killRate,
      redKillRate: redEval.killRate,
      visibleKillRate: (blueEval.visibleKillRate + redEval.visibleKillRate) / 2,
      weaponSightRate: (blueEval.weaponSightRate + redEval.weaponSightRate) / 2,
      champPickupPct: (st.bluePickup ? 50 : 0) + (st.redPickup ? 50 : 0),
      champDamage: (st.blueDamage ?? 0) + (st.redDamage ?? 0),
      champBlueFitness: championResult?.blueFitness ?? 0,
      champRedFitness: championResult?.redFitness ?? 0,
    };
    this.meta.history.push(entry);
    this.lastGenStats = { blue: blueEval, red: redEval };
    this.meta.visibleKillRate = (blueEval.visibleKillRate + redEval.visibleKillRate) / 2;
    this.meta.weaponSightRate = (blueEval.weaponSightRate + redEval.weaponSightRate) / 2;
    if (this.meta.history.length > HISTORY_MAX) {
      this.meta.history.splice(0, this.meta.history.length - HISTORY_MAX);
    }
  }

  async trainingStep() {
    const blueEval = await this.evaluatePopulation("blue", this.redTrainer.champion);
    this.blueTrainer.evolve(blueEval.fitness);

    const redEval = await this.evaluatePopulation("red", this.blueTrainer.champion);
    this.redTrainer.evolve(redEval.fitness);

    this.applyDominanceMutation();

    const { result } = await this.runChampionMatch(true);
    this.recordHistory(blueEval, redEval, result);
    this.maybeSaveCheckpoint();
    this.persist();
    this.emit();
  }

  async start() {
    if (this.running) return;
    this.running = true;
    await this.initWorkers();
    this.emit();

    while (this.running) {
      try {
        await this.trainingStep();
      } catch (err) {
        console.error("Training error:", err);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  stop() {
    this.running = false;
  }

  async shutdown() {
    this.stop();
    for (const worker of this.workers) {
      await worker.terminate().catch(() => {});
    }
    this.workers = [];
    this.persist();
  }

  rollbackToReplay(replayId) {
    const replay = getReplay(replayId);
    if (!replay) return false;

    this.blueTrainer.setChampion(NeuralNetwork.fromJSON(replay.blueBrain));
    this.redTrainer.setChampion(NeuralNetwork.fromJSON(replay.redBrain));

    while (this.blueTrainer.population.length < this.blueTrainer.populationSize) {
      this.blueTrainer.population.push(
        this.blueTrainer.champion.mutate(this.blueTrainer.mutation)
      );
    }
    while (this.redTrainer.population.length < this.redTrainer.populationSize) {
      this.redTrainer.population.push(
        this.redTrainer.champion.mutate(this.redTrainer.mutation)
      );
    }

    this.activeReplayId = replayId;
    this.persist();
    this.emit();
    return replay;
  }

  zeroBrains() {
    this.blueTrainer.resetToZero();
    this.redTrainer.resetToZero();
    clearCheckpoints();
    this.checkpointsCount = 0;
    this.meta = {
      totalGames: 0,
      championGames: 0,
      evalGames: 0,
      blueWins: 0,
      redWins: 0,
      draws: 0,
      bestKillTimeMs: Infinity,
      nextReplayId: 1,
      parallelGames: this.parallelGames,
      history: [],
      sumKillTimeMs: 0,
      killCount: 0,
      visibleKillRate: 0,
      weaponSightRate: 0,
      sessionStartedAt: Date.now(),
      statsMigrated: true,
    };
    this.lastGenStats = null;
    this.lastChampion = null;
    saveMeta(this.meta);
    saveReplays([]);
    saveState({
      blue: this.blueTrainer.toState(),
      red: this.redTrainer.toState(),
    });
    this.emit();
  }

  resetBrains() {
    this.blueTrainer = new EvolutionTrainer("blue");
    this.redTrainer = new EvolutionTrainer("red");
    clearCheckpoints();
    this.checkpointsCount = 0;
    this.meta = {
      totalGames: 0,
      championGames: 0,
      evalGames: 0,
      blueWins: 0,
      redWins: 0,
      draws: 0,
      bestKillTimeMs: Infinity,
      nextReplayId: 1,
      parallelGames: this.parallelGames,
      history: [],
      sumKillTimeMs: 0,
      killCount: 0,
      visibleKillRate: 0,
      weaponSightRate: 0,
      sessionStartedAt: Date.now(),
      statsMigrated: true,
    };
    this.lastGenStats = null;
    this.lastChampion = null;
    saveMeta(this.meta);
    saveReplays([]);
    saveState({
      blue: this.blueTrainer.toState(),
      red: this.redTrainer.toState(),
    });
    this.emit();
  }

  compareCheckpoints(genA, genB) {
    const cpA = loadCheckpoint(genA);
    const cpB = loadCheckpoint(genB);
    if (!cpA || !cpB) return null;

    const histA = (this.meta.history ?? []).find((h) => h.gen === genA) ?? null;
    const histB = (this.meta.history ?? []).find((h) => h.gen === genB) ?? null;

    const netA = NeuralNetwork.fromJSON(cpA.blue.champion);
    const netB = NeuralNetwork.fromJSON(cpB.blue.champion);

    const sim = new Simulation(WORLD_SEED, { recordReplay: true });
    sim.runToEnd(netA, netB);
    const result = sim.getResult();

    return {
      genA,
      genB,
      histA,
      histB,
      match: {
        label: `Синий G${genA} vs Синий G${genB}`,
        winner: result.winner,
        reason: result.reason,
        time: result.time,
        killTimeMs: result.killTimeMs,
        blueFitness: result.blueFitness,
        redFitness: result.redFitness,
        stats: result.stats,
        seed: WORLD_SEED,
        frames: result.replayFrames,
        blueBrain: cpA.blue.champion,
        redBrain: cpB.blue.champion,
      },
      brainA: summarizeBrain(netA),
      brainB: summarizeBrain(netB),
      checkpointA: {
        generation: cpA.generation,
        blueMutation: cpA.blue?.mutation,
        redMutation: cpA.red?.mutation,
      },
      checkpointB: {
        generation: cpB.generation,
        blueMutation: cpB.blue?.mutation,
        redMutation: cpB.red?.mutation,
      },
    };
  }

  getBrains() {
    return {
      blue: this.blueTrainer.champion.toJSON(),
      red: this.redTrainer.champion.toJSON(),
      blueGeneration: this.blueTrainer.generation,
      redGeneration: this.redTrainer.generation,
      architecture: getArchitectureSummary(),
      summary: {
        blue: summarizeBrain(this.blueTrainer.champion),
        red: summarizeBrain(this.redTrainer.champion),
      },
    };
  }
}

export async function benchmarkParallel() {
  const cpus = os.cpus().length;
  const workerCount = Math.max(2, cpus - 2);
  const workers = [];
  const ready = [];

  for (let i = 0; i < workerCount; i++) {
    const worker = new Worker(WORKER_FILE, { workerData: { warmup: true } });
    ready.push(
      new Promise((resolve) => {
        worker.once("message", (msg) => {
          if (msg.type === "ready") resolve();
        });
      })
    );
    workers.push(worker);
  }
  await Promise.all(ready);

  const { NeuralNetwork } = await import("../shared/neural.js");

  const testCounts = [32, 64, 96, 128, 160];
  let best = 64;
  let bestThroughput = 0;

  for (const count of testCounts) {
    const jobs = Array.from({ length: count }, (_, i) => ({
      jobId: `b-${i}`,
      side: "blue",
      genomeIndex: 0,
      seed: WORLD_SEED,
      recordReplay: false,
      blueGenome: new NeuralNetwork().toJSON(),
      redGenome: new NeuralNetwork().toJSON(),
    }));

    const perWorker = Math.ceil(count / workerCount);
    const t0 = performance.now();

    await Promise.all(
      workers.map(
        (worker, w) =>
          new Promise((resolve) => {
            const slice = jobs.slice(w * perWorker, (w + 1) * perWorker);
            if (!slice.length) return resolve([]);
            const handler = (msg) => {
              if (msg.type === "results") {
                worker.off("message", handler);
                resolve(msg.results);
              }
            };
            worker.on("message", handler);
            worker.postMessage({ type: "evaluate", batchId: count, jobs: slice });
          })
      )
    );

    const elapsed = (performance.now() - t0) / 1000;
    const throughput = count / elapsed;
    if (throughput > bestThroughput) {
      bestThroughput = throughput;
      best = count;
    }
  }

  for (const w of workers) await w.terminate();

  const parallelGames = Math.min(160, Math.max(48, Math.round(best / 8) * 8));
  return { workerCount, parallelGames, bestThroughput, cpus };
}
