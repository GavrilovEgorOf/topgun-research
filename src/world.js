import * as THREE from "three";
import {
  MAP_SIZE,
  CELL_SIZE,
  MAP_WORLD_SIZE,
  WALL_HEIGHT,
  WALL_THICKNESS,
  WALL_EDGE_WIDTH,
  COLORS,
  WORLD_SEED,
} from "./config.js";
import { createSeededRandom, gridToWorld } from "./utils.js";

function isWallCell(gx, gz, grid) {
  if (gx < 0 || gz < 0 || gx >= MAP_SIZE || gz >= MAP_SIZE) return true;
  return grid[gz][gx] === 1;
}

function countWallNeighbors(gx, gz, grid) {
  const sides = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  return sides.filter(([dx, dz]) => isWallCell(gx + dx, gz + dz, grid)).length;
}

function wouldViolateWallRules(gx, gz, grid) {
  if (grid[gz][gx] === 1) return false;
  const test = grid.map((row) => [...row]);
  test[gz][gx] = 1;

  for (const [cx, cz] of [
    [gx, gz], [gx, gz - 1], [gx, gz + 1], [gx - 1, gz], [gx + 1, gz],
  ]) {
    if (cx < 0 || cz < 0 || cx >= MAP_SIZE || cz >= MAP_SIZE) continue;
    if (countWallNeighbors(cx, cz, test) >= 4) return true;
  }
  return false;
}

export function buildWorldGrid(seed = WORLD_SEED) {
  const grid = Array.from({ length: MAP_SIZE }, () => Array(MAP_SIZE).fill(0));
  const reserved = new Set([
    "1,1", "1,2", "2,1",
    `${MAP_SIZE - 2},${MAP_SIZE - 2}`,
    `${MAP_SIZE - 3},${MAP_SIZE - 2}`,
    `${MAP_SIZE - 2},${MAP_SIZE - 3}`,
    "5,5", "6,8", "8,3", "3,9", "9,6",
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

function stdMat(color, roughness = 0.82, metalness = 0.04) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

const FLOOR_TILE_GEO = new THREE.BoxGeometry(CELL_SIZE * 0.96, 0.18, CELL_SIZE * 0.96);
const FLOOR_SHINE_GEO = new THREE.PlaneGeometry(CELL_SIZE * 0.72, CELL_SIZE * 0.72);
const FLOOR_MAT_A = stdMat(COLORS.floor, 0.88, 0.03);
const FLOOR_MAT_B = stdMat(COLORS.floorAlt, 0.88, 0.03);
const FLOOR_SHINE_MAT = new THREE.MeshBasicMaterial({
  color: 0xffffff, transparent: true, opacity: 0.045, depthWrite: false,
});
const PIT_GEO = new THREE.BoxGeometry(CELL_SIZE * 0.94, 0.08, CELL_SIZE * 0.94);
const PIT_MAT = stdMat(COLORS.floorPit, 0.95, 0);
const WALL_MAT = stdMat(COLORS.wall, 0.72, 0.08);
const WALL_TOP_MAT = stdMat(COLORS.wallTop, 0.52, 0.12);
const WALL_EDGE_MAT = stdMat(COLORS.wallEdge, 0.78, 0.06);
const WALL_CAP_GEO = new THREE.BoxGeometry(1, 0.12, 1);

function createFloorTile(x, z, scene, checker) {
  const mesh = new THREE.Mesh(FLOOR_TILE_GEO, checker ? FLOOR_MAT_B : FLOOR_MAT_A);
  mesh.position.set(x, -0.09, z);
  mesh.receiveShadow = true;
  scene.add(mesh);

  const shine = new THREE.Mesh(FLOOR_SHINE_GEO, FLOOR_SHINE_MAT);
  shine.rotation.x = -Math.PI / 2;
  shine.position.set(x, 0.015, z);
  scene.add(shine);
}

function createWallPit(x, z, scene) {
  const pit = new THREE.Mesh(PIT_GEO, PIT_MAT);
  pit.position.set(x, -0.12, z);
  pit.receiveShadow = true;
  scene.add(pit);
}

function createWallSegment(px, pz, sx, sz, scene) {
  const body = new THREE.Mesh(new THREE.BoxGeometry(sx, WALL_HEIGHT, sz), WALL_MAT);
  body.position.set(px, WALL_HEIGHT / 2, pz);
  body.castShadow = true;
  body.receiveShadow = true;
  scene.add(body);

  const cap = new THREE.Mesh(WALL_CAP_GEO, WALL_TOP_MAT);
  cap.scale.set(sx * 1.03, 1, sz * 1.03);
  cap.position.set(px, WALL_HEIGHT + 0.05, pz);
  cap.castShadow = true;
  scene.add(cap);

  return {
    minX: px - sx / 2, maxX: px + sx / 2,
    minZ: pz - sz / 2, maxZ: pz + sz / 2,
  };
}
function createInteriorWalls(grid, scene, colliders) {
  const half = CELL_SIZE / 2;
  const t = WALL_EDGE_WIDTH;

  for (let gz = 0; gz < MAP_SIZE; gz++) {
    for (let gx = 0; gx < MAP_SIZE; gx++) {
      if (grid[gz][gx] !== 1) continue;
      const { x, z } = gridToWorld(gx, gz, MAP_SIZE, CELL_SIZE);
      createWallPit(x, z, scene);

      colliders.push({
        minX: x - half + 0.1, maxX: x + half - 0.1,
        minZ: z - half + 0.1, maxZ: z + half - 0.1,
      });

      if (gz > 0 && grid[gz - 1][gx] === 0)
        colliders.push(createWallSegment(x, z - half, CELL_SIZE, t, scene));
      if (gz < MAP_SIZE - 1 && grid[gz + 1][gx] === 0)
        colliders.push(createWallSegment(x, z + half, CELL_SIZE, t, scene));
      if (gx > 0 && grid[gz][gx - 1] === 0)
        colliders.push(createWallSegment(x - half, z, t, CELL_SIZE, scene));
      if (gx < MAP_SIZE - 1 && grid[gz][gx + 1] === 0)
        colliders.push(createWallSegment(x + half, z, t, CELL_SIZE, scene));
    }
  }
}

function createBoundaryWalls(scene, colliders) {
  const half = MAP_WORLD_SIZE / 2;
  const h = WALL_HEIGHT + 0.4;
  const t = WALL_THICKNESS;
  const len = MAP_WORLD_SIZE + t * 2;
  const mat = WALL_EDGE_MAT;

  for (const w of [
    { x: 0, z: -half - t / 2, sx: len, sz: t },
    { x: 0, z: half + t / 2, sx: len, sz: t },
    { x: -half - t / 2, z: 0, sx: t, sz: len },
    { x: half + t / 2, z: 0, sx: t, sz: len },
  ]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w.sx, h, w.sz), mat);
    mesh.position.set(w.x, h / 2, w.z);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    scene.add(mesh);
    colliders.push({
      minX: w.x - w.sx / 2, maxX: w.x + w.sx / 2,
      minZ: w.z - w.sz / 2, maxZ: w.z + w.sz / 2,
    });
  }
}

export function createWorld(scene, seed = WORLD_SEED) {
  const grid = buildWorldGrid(seed);
  const colliders = [];

  for (let gz = 0; gz < MAP_SIZE; gz++) {
    for (let gx = 0; gx < MAP_SIZE; gx++) {
      if (grid[gz][gx] !== 0) continue;
      if (countWallNeighbors(gx, gz, grid) >= 4) continue;
      const { x, z } = gridToWorld(gx, gz, MAP_SIZE, CELL_SIZE);
      createFloorTile(x, z, scene, (gx + gz) % 2 === 0);
    }
  }

  createInteriorWalls(grid, scene, colliders);
  createBoundaryWalls(scene, colliders);
  return { grid, colliders };
}

export function setupLighting(scene) {
  scene.fog = new THREE.Fog(0xb0b8c8, 38, 92);
  scene.add(new THREE.AmbientLight(0xe8eeff, 0.52));
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8898b8, 0.48));

  const main = new THREE.DirectionalLight(0xfff8f0, 1.3);
  main.position.set(14, 32, 10);
  main.castShadow = true;
  main.shadow.mapSize.set(1536, 1536);
  main.shadow.camera.near = 1;
  main.shadow.camera.far = 90;
  const r = MAP_WORLD_SIZE / 2 + 8;
  main.shadow.camera.left = -r;
  main.shadow.camera.right = r;
  main.shadow.camera.top = r;
  main.shadow.camera.bottom = -r;
  main.shadow.bias = -0.0006;
  main.shadow.normalBias = 0.02;
  scene.add(main);

  const fill = new THREE.DirectionalLight(0xa8c0ff, 0.38);
  fill.position.set(-16, 20, -10);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffe8d0, 0.22);
  rim.position.set(0, 12, -22);
  scene.add(rim);

  scene.background = new THREE.Color(0xb0b8c8);
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
