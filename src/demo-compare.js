import { Simulation } from "../shared/simulation.js";
import { NeuralNetwork } from "../shared/neural.js";
import { WORLD_SEED } from "../shared/config.js";
import { summarizeBrain } from "../shared/brain-inspect.js";

const DEMO_BASE = import.meta.env.BASE_URL + "demo";

async function loadCheckpoint(gen) {
  const res = await fetch(`${DEMO_BASE}/checkpoints/gen-${gen}.json`);
  if (!res.ok) return null;
  return res.json();
}

export async function compareCheckpointsClient(genA, genB, history = []) {
  const cpA = await loadCheckpoint(genA);
  const cpB = await loadCheckpoint(genB);
  if (!cpA || !cpB) return null;

  const histA = history.find((h) => h.gen === genA) ?? null;
  const histB = history.find((h) => h.gen === genB) ?? null;

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
      label: `Blue G${genA} vs Blue G${genB}`,
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
