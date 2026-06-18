import { NN_INPUT, NN_HIDDEN, NN_OUTPUT, SHOOT_THRESHOLD, PLAYER_MAX_HP } from "./config.js";
import { buildObservation, decodeActions } from "./observations.js";
import { OBS_LABELS, OUTPUT_LABELS } from "./obs-labels.js";
import { buildColliders } from "./world.js";

export { OBS_LABELS, OUTPUT_LABELS };

export function getArchitectureSummary() {
  const sizes = [NN_INPUT, ...NN_HIDDEN, NN_OUTPUT];
  let params = 0;
  for (let i = 0; i < sizes.length - 1; i++) {
    params += sizes[i] * sizes[i + 1] + sizes[i + 1];
  }
  return {
    layers: sizes,
    hidden: NN_HIDDEN,
    input: NN_INPUT,
    output: NN_OUTPUT,
    parameters: params,
    actionThreshold: SHOOT_THRESHOLD,
    moveThreshold: 0.35,
  };
}

function playerFromFrame(fp) {
  return {
    id: fp.id,
    x: fp.x,
    z: fp.z,
    rotation: fp.rotation,
    hp: fp.hp,
    weapon: fp.weapon,
    cooldown: 0,
    maxHp: PLAYER_MAX_HP,
  };
}

function weaponsFromFrame(frame) {
  return (frame.weapons ?? [])
    .filter((w) => w.active !== false)
    .map((w) => ({ type: w.type, x: w.x, z: w.z, active: true }));
}

export function inspectFromSimulation(sim, blueNet, redNet) {
  const blue = sim.getPlayer("blue");
  const red = sim.getPlayer("red");
  return {
    blue: inspectAgent(blueNet, blue, red, sim.weapons, sim.colliders),
    red: inspectAgent(redNet, red, blue, sim.weapons, sim.colliders),
  };
}

export function inspectFromFrame(frame, seed, blueNet, redNet) {
  const colliders = buildColliders(seed);
  const blue = playerFromFrame(frame.players.find((p) => p.id === "blue"));
  const red = playerFromFrame(frame.players.find((p) => p.id === "red"));
  const weapons = weaponsFromFrame(frame);
  return {
    blue: inspectAgent(blueNet, blue, red, weapons, colliders),
    red: inspectAgent(redNet, red, blue, weapons, colliders),
  };
}

export function inspectAgent(net, self, enemy, weapons, colliders) {
  const obs = buildObservation(self, enemy, weapons, colliders);
  const { output, cache } = net.forward(obs);
  const actions = decodeActions(output);

  return {
    observations: Array.from(obs),
    activations: cache.map((a) => Array.from(a)),
    outputs: Array.from(output),
    actions,
    actionLabels: formatActionLabels(actions, output),
    layers: net.layers.map((l, idx) => ({
      index: idx,
      inSize: l.inSize,
      outSize: l.outSize,
      weights: Array.from(l.weights),
      weightStats: weightStats(l.weights),
    })),
  };
}

function weightStats(weights) {
  let sum = 0;
  let sumSq = 0;
  let max = 0;
  for (let i = 0; i < weights.length; i++) {
    const v = Math.abs(weights[i]);
    sum += v;
    sumSq += weights[i] * weights[i];
    if (v > max) max = v;
  }
  const n = weights.length || 1;
  return {
    meanAbs: sum / n,
    rms: Math.sqrt(sumSq / n),
    maxAbs: max,
  };
}

function formatActionLabels(actions, outputs) {
  const parts = [];
  const keys = ["up", "down", "left", "right", "shoot"];
  const labels = OUTPUT_LABELS;
  keys.forEach((k, i) => {
    const thr = k === "shoot" ? SHOOT_THRESHOLD : 0.35;
    if (actions[k]) {
      parts.push(`${labels[i]} (${outputs[i].toFixed(2)} ≥ ${thr})`);
    }
  });
  return parts.length ? parts.join(", ") : `нет (${outputs.map((v) => v.toFixed(2)).join(", ")})`;
}

export function summarizeBrain(net) {
  const arch = getArchitectureSummary();
  const layerStats = net.layers.map((l, i) => ({
    layer: i,
    in: l.inSize,
    out: l.outSize,
    ...weightStats(l.weights),
  }));
  return { architecture: arch, layerStats };
}
