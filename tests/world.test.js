import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildWorldGrid, buildColliders, getPlayerSpawnPositions } from "../shared/world.js";
import { MAP_SIZE } from "../shared/config.js";
import { createSeededRandom, cellKey } from "../shared/utils.js";

describe("world generation", () => {
  it("buildWorldGrid is deterministic per seed", () => {
    const a = buildWorldGrid(42);
    const b = buildWorldGrid(42);
    assert.deepEqual(a, b);
  });

  it("buildWorldGrid varies with seed", () => {
    const a = buildWorldGrid(1);
    const b = buildWorldGrid(2);
    assert.notDeepEqual(a, b);
  });

  it("grid has correct dimensions", () => {
    const grid = buildWorldGrid(100);
    assert.equal(grid.length, MAP_SIZE);
    assert.equal(grid[0].length, MAP_SIZE);
  });

  it("spawn positions are in opposite corners", () => {
    const { blue, red } = getPlayerSpawnPositions();
    assert.ok(blue.x < 0 && blue.z < 0);
    assert.ok(red.x > 0 && red.z > 0);
  });

  it("buildColliders returns non-empty AABB list", () => {
    const colliders = buildColliders(42);
    assert.ok(colliders.length > 4);
    for (const c of colliders) {
      assert.ok(c.maxX > c.minX);
      assert.ok(c.maxZ > c.minZ);
    }
  });
});

describe("utils", () => {
  it("createSeededRandom is reproducible", () => {
    const a = createSeededRandom(99);
    const b = createSeededRandom(99);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    assert.deepEqual(seqA, seqB);
  });

  it("cellKey maps nearby points to same cell", () => {
    const k1 = cellKey(0.1, 0.1, 12, 4);
    const k2 = cellKey(0.2, 0.2, 12, 4);
    assert.equal(k1, k2);
  });
});
