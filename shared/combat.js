import { PLAYER_RADIUS, WEAPON_HIT_RADIUS, FPS_FOV_DEG, VISION_RANGE, DRAW_PENALTY_BASE, DRAW_ESCALATE_FROM_SEC, DRAW_ESCALATE_PER_SEC } from "./config.js";
import { clamp, normalizeAngle } from "./utils.js";

export function rayCircleHit(ox, oz, dx, dz, cx, cz, radius, maxDist) {
  const fx = ox - cx;
  const fz = oz - cz;
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - radius * radius;
  let disc = b * b - 4 * c;
  if (disc < 0) return null;
  disc = Math.sqrt(disc);
  const t1 = (-b - disc) / 2;
  const t2 = (-b + disc) / 2;
  const t = t1 >= 0 ? t1 : t2 >= 0 ? t2 : null;
  if (t === null || t > maxDist) return null;
  return t;
}

export function rayAabbHit(ox, oz, dx, dz, box, maxDist) {
  let tmin = 0;
  let tmax = maxDist;

  for (const a of [
    { o: ox, d: dx, min: box.minX, max: box.maxX },
    { o: oz, d: dz, min: box.minZ, max: box.maxZ },
  ]) {
    if (Math.abs(a.d) < 1e-8) {
      if (a.o < a.min || a.o > a.max) return null;
      continue;
    }
    const inv = 1 / a.d;
    let t1 = (a.min - a.o) * inv;
    let t2 = (a.max - a.o) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }

  return tmin >= 0 && tmin <= maxDist ? tmin : null;
}

export function isInFov(rotation, targetAngle, halfFovRad) {
  const diff = normalizeAngle(targetAngle - rotation);
  return Math.abs(diff) <= halfFovRad;
}

export function hasLineOfSight(ox, oz, tx, tz, colliders, maxRange) {
  const dx = tx - ox;
  const dz = tz - oz;
  const dist = Math.hypot(dx, dz);
  if (dist > maxRange) return false;
  if (dist < 0.05) return true;

  const ndx = dx / dist;
  const ndz = dz / dist;
  let wallDist = dist;
  for (const c of colliders) {
    const t = rayAabbHit(ox, oz, ndx, ndz, c, wallDist);
    if (t !== null && t < wallDist) wallDist = t;
  }
  return wallDist >= dist - 0.2;
}

export function findNearestVisibleWeapon(ox, oz, rotation, weapons, colliders, maxRange = VISION_RANGE) {
  const halfFov = ((FPS_FOV_DEG * Math.PI) / 180) / 2;
  let best = null;
  let bestDist = Infinity;

  for (const w of weapons) {
    if (!w.active) continue;
    const dist = Math.hypot(w.x - ox, w.z - oz);
    if (dist > maxRange) continue;
    const angle = Math.atan2(w.x - ox, w.z - oz);
    if (!isInFov(rotation, angle, halfFov)) continue;
    if (!hasLineOfSight(ox, oz, w.x, w.z, colliders, maxRange)) continue;
    if (dist < bestDist) {
      bestDist = dist;
      best = w;
    }
  }

  return best ? { weapon: best, dist: bestDist } : null;
}

export function castVisionRay(ox, oz, rotation, maxRange, players, weapons, ownerId, colliders = []) {
  const dx = Math.sin(rotation);
  const dz = Math.cos(rotation);
  let dist = maxRange;
  let hitType = "none";

  for (const c of colliders) {
    const t = rayAabbHit(ox, oz, dx, dz, c, dist);
    if (t !== null && t < dist) {
      dist = t;
      hitType = "wall";
    }
  }

  for (const p of players) {
    if (p.id === ownerId || p.hp <= 0) continue;
    const t = rayCircleHit(ox, oz, dx, dz, p.x, p.z, PLAYER_RADIUS + 0.12, dist);
    if (t !== null && t < dist) {
      dist = t;
      hitType = "enemy";
    }
  }

  for (const w of weapons) {
    if (!w.active) continue;
    const t = rayCircleHit(ox, oz, dx, dz, w.x, w.z, WEAPON_HIT_RADIUS, dist);
    if (t !== null && t < dist) {
      dist = t;
      hitType = "weapon";
    }
  }

  return { dist, hitType, dx, dz };
}

/** FOV cone polygon clipped by walls (rendering / debug). */
export function computeFovPolygon(ox, oz, rotation, halfFov, maxRange, colliders, segments = 32) {
  const local = [{ x: 0, z: 0 }];

  for (let i = 0; i <= segments; i++) {
    const offset = -halfFov + ((2 * halfFov) * i) / segments;
    const angle = rotation + offset;
    const dx = Math.sin(angle);
    const dz = Math.cos(angle);

    let dist = maxRange;
    for (const c of colliders) {
      const t = rayAabbHit(ox, oz, dx, dz, c, dist);
      if (t !== null && t < dist) dist = t;
    }

    local.push({
      x: Math.sin(offset) * dist,
      z: Math.cos(offset) * dist,
    });
  }

  return local;
}

export function meleeArcHit(ox, oz, rotation, range, arcHalf, tx, tz, targetRadius = PLAYER_RADIUS) {
  const dx = tx - ox;
  const dz = tz - oz;
  const distSq = dx * dx + dz * dz;
  const maxDist = range + targetRadius;
  if (distSq > maxDist * maxDist) return false;
  if (distSq < 0.05) return true;

  const dist = Math.sqrt(distSq);
  const fwdX = Math.sin(rotation);
  const fwdZ = Math.cos(rotation);
  const dot = (dx * fwdX + dz * fwdZ) / dist;
  if (dot < 0.15) return false;

  return Math.acos(clamp(dot, -1, 1)) <= arcHalf;
}

export function pointInAabb(x, z, box) {
  return x > box.minX && x < box.maxX && z > box.minZ && z < box.maxZ;
}

export function wallRayDist(ox, oz, angle, colliders, maxRange) {
  const dx = Math.sin(angle);
  const dz = Math.cos(angle);
  let dist = maxRange;
  for (const c of colliders) {
    const t = rayAabbHit(ox, oz, dx, dz, c, dist);
    if (t !== null && t < dist) dist = t;
  }
  return dist / maxRange;
}

/** How many forward rays hit a wall at close range (corner/junction) */
export function countCloseForwardWalls(ox, oz, rotation, colliders, maxRange) {
  let n = 0;
  for (const offset of [-0.55, -0.28, 0, 0.28, 0.55]) {
    const angle = rotation + offset * (Math.PI / 2);
    if (wallRayDist(ox, oz, angle, colliders, maxRange) < 0.22) n++;
  }
  return n;
}

export function computeDrawPenalty(timeSec) {
  const extra = Math.max(0, timeSec - DRAW_ESCALATE_FROM_SEC) * DRAW_ESCALATE_PER_SEC;
  return DRAW_PENALTY_BASE - extra;
}
