export function createSeededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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

export function worldToGrid(x, z, mapSize, cellSize) {
  const half = (mapSize * cellSize) / 2;
  const gx = Math.floor((x + half) / cellSize);
  const gz = Math.floor((z + half) / cellSize);
  return { gx, gz };
}

export function cellKey(x, z, mapSize, cellSize) {
  const { gx, gz } = worldToGrid(x, z, mapSize, cellSize);
  return `${gx},${gz}`;
}

export function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Random map generation seed (1 … 2³¹−1) */
export function randomMapSeed(rng = Math.random) {
  return Math.floor(rng() * 0x7fffffff) + 1;
}
