import { Simulation } from "../shared/simulation.js";
import { FIXED_DT } from "../shared/config.js";
import { randomMapSeed } from "../shared/utils.js";
import { inspectFromSimulation } from "../shared/brain-inspect.js";

const TICK_MS = 1000 / 60;
const RESTART_DELAY = 1.4;

export class LiveBroadcaster {
  constructor(getChampions, send) {
    this.getChampions = getChampions;
    this.send = send;
    this.running = false;
    this.sim = null;
    this.restartLeft = 0;
    this.timer = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.scheduleNext(0);
  }

  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  scheduleNext(delayMs) {
    if (!this.running) return;
    this.timer = setTimeout(() => this.tick(), delayMs);
  }

  startMatch() {
    const { blue, red } = this.getChampions();
    const seed = randomMapSeed();
    this.sim = new Simulation(seed);
    this.matchSeed = seed;
    this.blueNet = blue;
    this.redNet = red;
    this.restartLeft = 0;
    this.send({
      type: "liveStart",
      seed,
      frame: this.sim.snapshotFrame(),
    });
  }

  tick() {
    if (!this.running) return;

    if (this.restartLeft > 0) {
      this.restartLeft -= FIXED_DT;
      if (this.restartLeft <= 0) this.startMatch();
      this.scheduleNext(TICK_MS);
      return;
    }

    if (!this.sim) {
      this.startMatch();
      this.scheduleNext(TICK_MS);
      return;
    }

    if (!this.sim.done) {
      this.sim.step(this.blueNet, this.redNet);
      const brain = inspectFromSimulation(this.sim, this.blueNet, this.redNet);
      this.send({
        type: "liveFrame",
        seed: this.matchSeed,
        t: this.sim.time,
        frame: this.sim.snapshotFrame(),
        brain,
        done: false,
        winner: null,
        reason: null,
      });
      this.scheduleNext(TICK_MS);
      return;
    }

    const brain = inspectFromSimulation(this.sim, this.blueNet, this.redNet);
    this.send({
      type: "liveFrame",
      seed: this.matchSeed,
      t: this.sim.time,
      frame: this.sim.snapshotFrame(),
      brain,
      done: true,
      winner: this.sim.winner,
      reason: this.sim.reason,
    });
    this.restartLeft = RESTART_DELAY;
    this.sim = null;
    this.scheduleNext(TICK_MS);
  }
}
