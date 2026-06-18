import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "../shared/simulation.js";
import { NeuralNetwork } from "../shared/neural.js";
import { buildObservation, decodeActions } from "../shared/observations.js";
import { OBS_SIZE, NN_INPUT, NN_OUTPUT, WORLD_SEED } from "../shared/config.js";
import { randomMapSeed } from "../shared/utils.js";

describe("simulation", () => {
  it("is deterministic for the same seed and networks", () => {
    const netA = new NeuralNetwork();
    const netB = new NeuralNetwork();
    const sim1 = new Simulation(12345);
    const sim2 = new Simulation(12345);
    sim1.runToEnd(netA, netB);
    sim2.runToEnd(netA, netB);
    const r1 = sim1.getResult();
    const r2 = sim2.getResult();
    assert.equal(r1.reason, r2.reason);
    assert.equal(r1.winner, r2.winner);
    assert.equal(r1.blueFitness, r2.blueFitness);
    assert.equal(r1.redFitness, r2.redFitness);
  });

  it("produces different colliders for different seeds", () => {
    const a = new Simulation(1);
    const b = new Simulation(99999);
    assert.notDeepEqual(a.colliders, b.colliders);
  });

  it("observation vector has correct size", () => {
    const sim = new Simulation(WORLD_SEED);
    const blue = sim.getPlayer("blue");
    const red = sim.getPlayer("red");
    const obs = buildObservation(blue, red, sim.weapons, sim.colliders);
    assert.equal(obs.length, OBS_SIZE);
    assert.equal(obs.length, NN_INPUT);
  });

  it("decodeActions respects thresholds", () => {
    const out = new Float32Array([0.9, 0.1, 0.1, 0.1, 0.9]);
    const actions = decodeActions(out);
    assert.equal(actions.up, true);
    assert.equal(actions.shoot, true);
    assert.equal(actions.down, false);
  });

  it("decodeActions ignores backward movement", () => {
    const actions = decodeActions(new Float32Array([0, 0.99, 0, 0, 0]));
    assert.equal(actions.down, false);
  });

  it("projectiles receive unique ids in snapshots", () => {
    const net = new NeuralNetwork();
    const sim = new Simulation(WORLD_SEED);
    for (let i = 0; i < 300 && !sim.done; i++) {
      sim.step(net, net);
    }
    const ids = sim.snapshotFrame().projectiles.map((p) => p.id);
    if (ids.length > 1) {
      assert.equal(new Set(ids).size, ids.length);
    }
  });
});

describe("neural", () => {
  it("fromJSON rejects invalid architecture", () => {
    assert.throws(() => NeuralNetwork.fromJSON({ layers: [] }));
    assert.throws(() =>
      NeuralNetwork.fromJSON({
        layers: [{ inSize: 1, outSize: 1, weights: [0], biases: [0] }],
      })
    );
  });

  it("round-trips through JSON", () => {
    const net = new NeuralNetwork();
    const clone = NeuralNetwork.fromJSON(net.toJSON());
    const input = new Float32Array(NN_INPUT).fill(0.5);
    const a = net.predict(input);
    const b = clone.predict(input);
    for (let i = 0; i < NN_OUTPUT; i++) {
      assert.ok(Math.abs(a[i] - b[i]) < 1e-6);
    }
  });
});

describe("randomMapSeed", () => {
  it("returns integers in valid range", () => {
    for (let i = 0; i < 20; i++) {
      const s = randomMapSeed();
      assert.ok(s >= 1 && s <= 0x7fffffff);
    }
  });
});
