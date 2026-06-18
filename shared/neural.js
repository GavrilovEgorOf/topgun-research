/**
 * Feed-forward MLP with tanh hidden layers and sigmoid outputs.
 * Trained via Evolution Strategies (elite selection, crossover, Gaussian mutation).
 */
import { NN_INPUT, NN_OUTPUT, NN_HIDDEN } from "./config.js";

function xavierScale(fanIn, fanOut) {
  return Math.sqrt(2 / (fanIn + fanOut));
}

function randomWeights(rows, cols, rng = Math.random) {
  const scale = xavierScale(rows, cols);
  const w = new Float32Array(rows * cols);
  for (let i = 0; i < w.length; i++) w[i] = (rng() * 2 - 1) * scale;
  return w;
}

export class NeuralNetwork {
  constructor(layers = null, rng = Math.random) {
    if (layers) {
      this.layers = layers;
      return;
    }
    const sizes = [NN_INPUT, ...NN_HIDDEN, NN_OUTPUT];
    this.layers = [];
    for (let i = 0; i < sizes.length - 1; i++) {
      this.layers.push({
        weights: randomWeights(sizes[i + 1], sizes[i], rng),
        biases: new Float32Array(sizes[i + 1]),
        inSize: sizes[i],
        outSize: sizes[i + 1],
      });
    }
  }

  static fromJSON(json) {
    if (!json?.layers?.length) {
      throw new Error("Invalid network JSON: missing layers");
    }
    const sizes = [NN_INPUT, ...NN_HIDDEN, NN_OUTPUT];
    if (json.layers.length !== sizes.length - 1) {
      throw new Error(`Invalid network JSON: expected ${sizes.length - 1} layers`);
    }
    const net = new NeuralNetwork();
    net.layers = json.layers.map((l, i) => {
      const expectedIn = sizes[i];
      const expectedOut = sizes[i + 1];
      if (l.inSize !== expectedIn || l.outSize !== expectedOut) {
        throw new Error(
          `Invalid layer ${i}: expected ${expectedIn}→${expectedOut}, got ${l.inSize}→${l.outSize}`
        );
      }
      if (!Array.isArray(l.weights) || l.weights.length !== expectedIn * expectedOut) {
        throw new Error(`Invalid layer ${i}: weight count mismatch`);
      }
      if (!Array.isArray(l.biases) || l.biases.length !== expectedOut) {
        throw new Error(`Invalid layer ${i}: bias count mismatch`);
      }
      return {
        weights: new Float32Array(l.weights),
        biases: new Float32Array(l.biases),
        inSize: l.inSize,
        outSize: l.outSize,
      };
    });
    return net;
  }

  static zero() {
    const net = new NeuralNetwork();
    for (const layer of net.layers) {
      layer.weights.fill(0);
      layer.biases.fill(0);
    }
    return net;
  }

  toJSON() {
    return {
      layers: this.layers.map((l) => ({
        weights: Array.from(l.weights),
        biases: Array.from(l.biases),
        inSize: l.inSize,
        outSize: l.outSize,
      })),
    };
  }

  clone() {
    return NeuralNetwork.fromJSON(this.toJSON());
  }

  forward(input) {
    let activations = input instanceof Float32Array ? input : new Float32Array(input);
    const cache = [activations];

    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i];
      const out = new Float32Array(layer.outSize);
      for (let o = 0; o < layer.outSize; o++) {
        let sum = layer.biases[o];
        const row = o * layer.inSize;
        for (let j = 0; j < layer.inSize; j++) {
          sum += layer.weights[row + j] * activations[j];
        }
        if (i < this.layers.length - 1) {
          out[o] = Math.tanh(sum);
        } else {
          out[o] = 1 / (1 + Math.exp(-sum));
        }
      }
      activations = out;
      cache.push(activations);
    }

    return { output: activations, cache };
  }

  predict(input) {
    return this.forward(input).output;
  }

  mutate(sigma, rng = Math.random) {
    const child = this.clone();
    for (const layer of child.layers) {
      for (let i = 0; i < layer.weights.length; i++) {
        if (rng() < 0.85) layer.weights[i] += gaussian(rng) * sigma;
      }
      for (let i = 0; i < layer.biases.length; i++) {
        if (rng() < 0.85) layer.biases[i] += gaussian(rng) * sigma;
      }
    }
    return child;
  }

  crossover(other, rng = Math.random) {
    const child = this.clone();
    for (let l = 0; l < child.layers.length; l++) {
      const a = this.layers[l];
      const b = other.layers[l];
      for (let i = 0; i < a.weights.length; i++) {
        child.layers[l].weights[i] = rng() < 0.5 ? a.weights[i] : b.weights[i];
      }
      for (let i = 0; i < a.biases.length; i++) {
        child.layers[l].biases[i] = rng() < 0.5 ? a.biases[i] : b.biases[i];
      }
    }
    return child;
  }
}

function gaussian(rng) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export class EvolutionTrainer {
  constructor(side, options = {}) {
    this.side = side;
    this.populationSize = options.populationSize ?? 48;
    this.eliteCount = options.eliteCount ?? 8;
    this.mutation = options.mutation ?? 0.12;
    this.minMutation = options.minMutation ?? 0.03;
    this.mutationDecay = options.mutationDecay ?? 0.995;
    this.generation = 0;
    this.champion = new NeuralNetwork();
    this.population = [this.champion];
    while (this.population.length < this.populationSize) {
      this.population.push(this.champion.mutate(this.mutation));
    }
  }

  static fromState(state) {
    const trainer = new EvolutionTrainer(state.side, {
      populationSize: state.population.length,
      eliteCount: state.eliteCount,
      mutation: state.mutation,
    });
    trainer.generation = state.generation;
    trainer.champion = NeuralNetwork.fromJSON(state.champion);
    trainer.population = state.population.map((g) => NeuralNetwork.fromJSON(g));
    trainer.mutation = state.mutation;
    return trainer;
  }

  toState() {
    return {
      side: this.side,
      generation: this.generation,
      mutation: this.mutation,
      eliteCount: this.eliteCount,
      champion: this.champion.toJSON(),
      population: this.population.map((g) => g.toJSON()),
    };
  }

  setChampion(net) {
    this.champion = net.clone();
    this.population[0] = this.champion.clone();
  }

  resetToZero() {
    this.generation = 0;
    this.mutation = 0.12;
    this.champion = NeuralNetwork.zero();
    this.population = [this.champion.clone()];
    while (this.population.length < this.populationSize) {
      this.population.push(NeuralNetwork.zero());
    }
  }

  evolve(scored) {
    const ranked = scored
      .map((s, i) => ({ fitness: s, genome: this.population[i] }))
      .sort((a, b) => b.fitness - a.fitness);

    this.champion = ranked[0].genome.clone();
    const next = [this.champion.clone()];

    for (let i = 1; i < this.eliteCount && i < ranked.length; i++) {
      next.push(ranked[i].genome.clone());
    }

    while (next.length < this.populationSize) {
      const a = ranked[Math.floor(Math.random() * this.eliteCount)].genome;
      const b = ranked[Math.floor(Math.random() * this.eliteCount)].genome;
      next.push(a.crossover(b).mutate(this.mutation));
    }

    this.population = next;
    this.generation++;
    this.mutation = Math.max(this.minMutation, this.mutation * this.mutationDecay);
    return this.champion;
  }
}
