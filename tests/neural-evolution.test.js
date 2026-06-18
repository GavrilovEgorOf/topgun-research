import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NeuralNetwork, EvolutionTrainer } from "../shared/neural.js";
import { createSeededRandom } from "../shared/utils.js";
import { NN_INPUT, NN_OUTPUT } from "../shared/config.js";

describe("NeuralNetwork operators", () => {
  it("mutate produces different weights with high probability", () => {
    const rng = createSeededRandom(7);
    const parent = new NeuralNetwork(null, rng);
    const child = parent.mutate(0.5, rng);
    let diff = 0;
    for (let l = 0; l < parent.layers.length; l++) {
      for (let i = 0; i < parent.layers[l].weights.length; i++) {
        if (parent.layers[l].weights[i] !== child.layers[l].weights[i]) diff++;
      }
    }
    assert.ok(diff > 0);
  });

  it("crossover blends parent genomes", () => {
    const rng = createSeededRandom(11);
    const a = new NeuralNetwork(null, rng);
    const b = new NeuralNetwork(null, rng);
    const child = a.crossover(b, rng);
    assert.equal(child.layers.length, a.layers.length);
    const input = new Float32Array(NN_INPUT).fill(0.3);
    const out = child.predict(input);
    assert.equal(out.length, NN_OUTPUT);
  });

  it("zero network outputs sigmoid-saturated values", () => {
    const net = NeuralNetwork.zero();
    const out = net.predict(new Float32Array(NN_INPUT).fill(1));
    for (let i = 0; i < NN_OUTPUT; i++) {
      assert.ok(Math.abs(out[i] - 0.5) < 1e-6);
    }
  });
});

describe("EvolutionTrainer", () => {
  it("keeps population size after evolve", () => {
    const trainer = new EvolutionTrainer("blue", { populationSize: 12, eliteCount: 3 });
    const scored = trainer.population.map((_, i) => i);
    trainer.evolve(scored);
    assert.equal(trainer.population.length, 12);
    assert.equal(trainer.generation, 1);
  });

  it("selects highest fitness as champion", () => {
    const trainer = new EvolutionTrainer("red", { populationSize: 8, eliteCount: 2 });
    const bestIdx = 3;
    const scored = trainer.population.map((_, i) => (i === bestIdx ? 100 : i));
    const bestGenome = trainer.population[bestIdx].toJSON();
    trainer.evolve(scored);
    assert.deepEqual(trainer.champion.toJSON(), bestGenome);
    assert.deepEqual(trainer.champion.toJSON(), trainer.population[0].toJSON());
  });

  it("decays mutation rate", () => {
    const trainer = new EvolutionTrainer("blue", { populationSize: 4, eliteCount: 2, mutation: 0.2 });
    const before = trainer.mutation;
    trainer.evolve([3, 2, 1, 0]);
    assert.ok(trainer.mutation < before);
  });

  it("round-trips trainer state", () => {
    const trainer = new EvolutionTrainer("blue", { populationSize: 6, eliteCount: 2 });
    trainer.evolve([5, 4, 3, 2, 1, 0]);
    const restored = EvolutionTrainer.fromState(trainer.toState());
    assert.equal(restored.generation, trainer.generation);
    assert.equal(restored.side, "blue");
    assert.equal(restored.population.length, 6);
  });
});
