const DEMO_BASE = import.meta.env.BASE_URL + "demo";

let manifestCache = null;

async function loadManifest() {
  if (!manifestCache) {
    const res = await fetch(`${DEMO_BASE}/manifest.json`);
    manifestCache = await res.json();
  }
  return manifestCache;
}

export class DemoApi {
  constructor() {
    this.listeners = new Set();
    this.liveListeners = new Set();
    this.status = null;
    this._booted = false;
    this._boot();
  }

  async _boot() {
    const res = await fetch(`${DEMO_BASE}/status.json`);
    this.status = await res.json();
    this._booted = true;
    for (const fn of this.listeners) fn(this.status);
  }

  connect() {}

  onStatus(fn) {
    this.listeners.add(fn);
    if (this.status) fn(this.status);
    else {
      const poll = setInterval(() => {
        if (this.status) {
          clearInterval(poll);
          fn(this.status);
        }
      }, 50);
    }
    return () => this.listeners.delete(fn);
  }

  onLive(fn) {
    this.liveListeners.add(fn);
    return () => this.liveListeners.delete(fn);
  }

  onReplay() {
    return () => {};
  }

  async fetchStatus() {
    if (!this.status) await this._boot();
    return this.status;
  }

  async fetchReplays() {
    const res = await fetch(`${DEMO_BASE}/replays.json`);
    return res.json();
  }

  async fetchReplay(id) {
    const res = await fetch(`${DEMO_BASE}/replay-${id}.json`);
    if (!res.ok) return null;
    return res.json();
  }

  async rollback() {
    return { ok: false, error: "Unavailable in demo mode" };
  }

  async resetBrains() {
    return { ok: false };
  }

  async zeroBrains() {
    return { ok: false };
  }

  async fetchCheckpoints() {
    const res = await fetch(`${DEMO_BASE}/checkpoints.json`);
    return res.json();
  }

  async compareGenerations(genA, genB) {
    const { compareCheckpointsClient } = await import("./demo-compare.js");
    return compareCheckpointsClient(genA, genB, this.status?.history ?? []);
  }

  async fetchBrains() {
    const manifest = await loadManifest();
    const replay = await this.fetchReplay(manifest.featuredReplayId);
    return {
      blue: replay?.blueBrain,
      red: replay?.redBrain,
      blueGeneration: this.status?.blueGeneration ?? 0,
      redGeneration: this.status?.redGeneration ?? 0,
      architecture: this.status?.architecture,
      summary: {
        blue: this.status?.blueBrainSummary,
        red: this.status?.redBrainSummary,
      },
    };
  }
}

export { formatKillTime, formatPct, formatDuration } from "./api.js";
