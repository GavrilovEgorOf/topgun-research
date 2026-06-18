import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  rayAabbHit,
  rayCircleHit,
  isInFov,
  hasLineOfSight,
  meleeArcHit,
  pointInAabb,
  wallRayDist,
  computeDrawPenalty,
} from "../shared/combat.js";
import { buildColliders } from "../shared/world.js";
import { WORLD_SEED, DRAW_PENALTY_BASE, DRAW_ESCALATE_FROM_SEC } from "../shared/config.js";

describe("combat geometry", () => {
  it("rayAabbHit finds intersection along forward axis", () => {
    const box = { minX: 2, maxX: 4, minZ: -1, maxZ: 1 };
    const t = rayAabbHit(0, 0, 1, 0, box, 10);
    assert.ok(t !== null);
    assert.ok(Math.abs(t - 2) < 0.01);
  });

  it("rayCircleHit returns null when ray misses", () => {
    const t = rayCircleHit(0, 0, 1, 0, 0, 5, 0.5, 10);
    assert.equal(t, null);
  });

  it("rayCircleHit finds circle along ray", () => {
    const t = rayCircleHit(0, 0, 1, 0, 3, 0, 0.5, 10);
    assert.ok(t !== null);
    assert.ok(Math.abs(t - 2.5) < 0.01);
  });

  it("isInFov respects half-angle", () => {
    const half = Math.PI / 4;
    assert.equal(isInFov(0, 0.2, half), true);
    assert.equal(isInFov(0, Math.PI, half), false);
  });

  it("meleeArcHit requires target in front arc", () => {
    const hit = meleeArcHit(0, 0, 0, 2, Math.PI / 2, 0, 1.5);
    const miss = meleeArcHit(0, 0, 0, 2, Math.PI / 2, 0, -1.5);
    assert.equal(hit, true);
    assert.equal(miss, false);
  });

  it("pointInAabb detects interior point", () => {
    const box = { minX: 0, maxX: 2, minZ: 0, maxZ: 2 };
    assert.equal(pointInAabb(1, 1, box), true);
    assert.equal(pointInAabb(3, 1, box), false);
  });

  it("wallRayDist is normalized to [0, 1]", () => {
    const colliders = buildColliders(WORLD_SEED);
    const dist = wallRayDist(0, 0, 0, colliders, 26);
    assert.ok(dist >= 0 && dist <= 1);
  });

  it("hasLineOfSight is blocked by walls", () => {
    const colliders = buildColliders(WORLD_SEED);
    const blocked = hasLineOfSight(0, 0, 20, 20, colliders, 40);
    assert.equal(blocked, false);
  });

  it("computeDrawPenalty escalates after threshold", () => {
    const early = computeDrawPenalty(5);
    const late = computeDrawPenalty(DRAW_ESCALATE_FROM_SEC + 5);
    assert.equal(early, DRAW_PENALTY_BASE);
    assert.ok(late < early);
  });
});
