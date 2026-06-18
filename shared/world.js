import {
  MAP_SIZE,
  CELL_SIZE,
  MAP_WORLD_SIZE,
  WALL_HEIGHT,
  WALL_THICKNESS,
  WALL_EDGE_WIDTH,
} from "./config.js";
import { createSeededRandom, gridToWorld } from "./utils.js";

function isWallCell(gx, gz, grid) {
  if (gx < 0 || gz < 0 || gx >= MAP_SIZE || gz >= MAP_SIZE) return true;
  return grid[gz][gx] === 1;
}

function countWallNeighbors(gx, gz, grid) {
  const sides = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ];
  return sides.filter(([dx, dz]) => isWallCell(gx + dx, gz + dz, grid)).length;
}

function wouldViolateWallRules(gx, gz, grid) {
  if (grid[gz][gx] === 1) return false;
  const test = grid.map((row) => [...row]);
  test[gz][gx] = 1;

  for (const [cx, cz] of [
    [gx, gz],
    [gx, gz - 1],
    [gx, gz + 1],
    [gx - 1, gz],
    [gx + 1, gz],
  ]) {
    if (cx < 0 || cz < 0 || cx >= MAP_SIZE || cz >= MAP_SIZE) continue;
    if (countWallNeighbors(cx, cz, test) >= 4) return true;
  }
  return false;
}

export function buildWorldGrid(seed) {
  const grid = Array.from({ length: MAP_SIZE }, () => Array(MAP_SIZE).fill(0));
  const reserved = new Set([
    "1,1",
    "1,2",
    "2,1",
    `${MAP_SIZE - 2},${MAP_SIZE - 2}`,
    `${MAP_SIZE - 3},${MAP_SIZE - 2}`,
    `${MAP_SIZE - 2},${MAP_SIZE - 3}`,
    "5,5",
    "6,8",
    "8,3",
    "3,9",
    "9,6",
  ]);

  const rand = createSeededRandom(seed);
  let placed = 0;
  let attempts = 0;
  while (placed < 18 && attempts < 1200) {
    attempts++;
    const gx = 1 + Math.floor(rand() * (MAP_SIZE - 2));
    const gz = 1 + Math.floor(rand() * (MAP_SIZE - 2));
    if (reserved.has(`${gx},${gz}`) || grid[gz][gx] === 1) continue;
    if (wouldViolateWallRules(gx, gz, grid)) continue;
    grid[gz][gx] = 1;
    placed++;
  }
  return grid;
}

function createWallSegment(px, pz, sx, sz) {
  return {
    minX: px - sx / 2,
    maxX: px + sx / 2,
    minZ: pz - sz / 2,
    maxZ: pz + sz / 2,
  };
}

function createInteriorColliders(grid) {
  const half = CELL_SIZE / 2;
  const t = WALL_EDGE_WIDTH;
  const colliders = [];

  for (let gz = 0; gz < MAP_SIZE; gz++) {
    for (let gx = 0; gx < MAP_SIZE; gx++) {
      if (grid[gz][gx] !== 1) continue;
      const { x, z } = gridToWorld(gx, gz, MAP_SIZE, CELL_SIZE);

      colliders.push({
        minX: x - half + 0.1,
        maxX: x + half - 0.1,
        minZ: z - half + 0.1,
        maxZ: z + half - 0.1,
      });

      if (gz > 0 && grid[gz - 1][gx] === 0)
        colliders.push(createWallSegment(x, z - half, CELL_SIZE, t));
      if (gz < MAP_SIZE - 1 && grid[gz + 1][gx] === 0)
        colliders.push(createWallSegment(x, z + half, CELL_SIZE, t));
      if (gx > 0 && grid[gz][gx - 1] === 0)
        colliders.push(createWallSegment(x - half, z, t, CELL_SIZE));
      if (gx < MAP_SIZE - 1 && grid[gz][gx + 1] === 0)
        colliders.push(createWallSegment(x + half, z, t, CELL_SIZE));
    }
  }
  return colliders;
}

function createBoundaryColliders() {
  const half = MAP_WORLD_SIZE / 2;
  const t = WALL_THICKNESS;
  const len = MAP_WORLD_SIZE + t * 2;
  const colliders = [];

  for (const w of [
    { x: 0, z: -half - t / 2, sx: len, sz: t },
    { x: 0, z: half + t / 2, sx: len, sz: t },
    { x: -half - t / 2, z: 0, sx: t, sz: len },
    { x: half + t / 2, z: 0, sx: t, sz: len },
  ]) {
    colliders.push({
      minX: w.x - w.sx / 2,
      maxX: w.x + w.sx / 2,
      minZ: w.z - w.sz / 2,
      maxZ: w.z + w.sz / 2,
    });
  }
  return colliders;
}

export function buildColliders(seed) {
  const grid = buildWorldGrid(seed);
  return [...createInteriorColliders(grid), ...createBoundaryColliders()];
}

export function getWeaponSpawnPositions() {
  return [
    { gx: 5, gz: 5, type: "pistol" },
    { gx: 6, gz: 8, type: "bow" },
    { gx: 8, gz: 3, type: "katana" },
    { gx: 3, gz: 9, type: "pistol" },
    { gx: 9, gz: 6, type: "bow" },
    { gx: 4, gz: 3, type: "katana" },
  ].map((p) => {
    const { x, z } = gridToWorld(p.gx, p.gz, MAP_SIZE, CELL_SIZE);
    return { x, z, type: p.type, gx: p.gx, gz: p.gz };
  });
}

export function getPlayerSpawnPositions() {
  return {
    blue: gridToWorld(1, 1, MAP_SIZE, CELL_SIZE),
    red: gridToWorld(MAP_SIZE - 2, MAP_SIZE - 2, MAP_SIZE, CELL_SIZE),
  };
}
