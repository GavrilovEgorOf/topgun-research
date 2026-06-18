export function createSeededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function worldToGrid(x, z, mapSize, cellSize) {
  const half = (mapSize * cellSize) / 2;
  const gx = Math.floor((x + half) / cellSize);
  const gz = Math.floor((z + half) / cellSize);
  return { gx, gz };
}

export function gridToWorld(gx, gz, mapSize, cellSize) {
  const half = (mapSize * cellSize) / 2;
  return {
    x: gx * cellSize - half + cellSize / 2,
    z: gz * cellSize - half + cellSize / 2,
  };
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}
