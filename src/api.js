const API_BASE = "/api";
const WS_URL = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;

export class TrainingApi {
  constructor() {
    this.listeners = new Set();
    this.liveListeners = new Set();
    this.status = null;
    this.ws = null;
    this.connect();
  }

  connect() {
    try {
      this.ws = new WebSocket(WS_URL);
      this.ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === "status") {
          this.status = msg.data;
          for (const fn of this.listeners) fn(this.status);
        }
        if (msg.type === "replay") {
          for (const fn of this.replayListeners ?? []) fn(msg.data);
        }
        if (msg.type === "liveStart" || msg.type === "liveFrame") {
          for (const fn of this.liveListeners) fn(msg);
        }
      };
      this.ws.onclose = () => {
        setTimeout(() => this.connect(), 2000);
      };
    } catch {
      setTimeout(() => this.connect(), 2000);
    }
  }

  onStatus(fn) {
    this.listeners.add(fn);
    if (this.status) fn(this.status);
    return () => this.listeners.delete(fn);
  }

  onLive(fn) {
    this.liveListeners.add(fn);
    return () => this.liveListeners.delete(fn);
  }

  onReplay(fn) {
    if (!this.replayListeners) this.replayListeners = new Set();
    this.replayListeners.add(fn);
    return () => this.replayListeners.delete(fn);
  }

  async fetchStatus() {
    const res = await fetch(`${API_BASE}/status`);
    return res.json();
  }

  async fetchReplays() {
    const res = await fetch(`${API_BASE}/replays`);
    return res.json();
  }

  async fetchReplay(id) {
    const res = await fetch(`${API_BASE}/replays/${id}`);
    if (!res.ok) return null;
    return res.json();
  }

  async rollback(id) {
    const res = await fetch(`${API_BASE}/replays/${id}/rollback`, { method: "POST" });
    return res.json();
  }

  async resetBrains() {
    const res = await fetch(`${API_BASE}/reset`, { method: "POST" });
    return res.json();
  }

  async zeroBrains() {
    const res = await fetch(`${API_BASE}/zero`, { method: "POST" });
    return res.json();
  }

  async fetchCheckpoints() {
    const res = await fetch(`${API_BASE}/checkpoints`);
    return res.json();
  }

  async compareGenerations(genA, genB) {
    const res = await fetch(`${API_BASE}/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ genA, genB }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? res.statusText);
    }
    return res.json();
  }

  async fetchBrains() {
    const res = await fetch(`${API_BASE}/brains`);
    return res.json();
  }
}

export function formatKillTime(ms) {
  if (!ms && ms !== 0) return "—";
  const sec = Math.floor(ms / 1000);
  const rem = ms % 1000;
  return `${sec}.${String(rem).padStart(3, "0")} с`;
}

export function formatPct(v) {
  if (v == null || Number.isNaN(v)) return "—";
  return `${v.toFixed(1)}%`;
}

export function formatDuration(ms) {
  if (!ms) return "0 с";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} с`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m} м ${rs} с`;
  const h = Math.floor(m / 60);
  return `${h} ч ${m % 60} м`;
}
