/**
 * Egocentric observation builder and action decoder.
 * Vector layout is documented in docs/ARCHITECTURE.md.
 */
import {
  MAP_WORLD_SIZE,
  PLAYER_MAX_HP,
  VISION_RANGE,
  WEAPON_INDEX,
  OBS_SIZE,
  SHOOT_THRESHOLD,
  FPS_FOV_DEG,
} from "./config.js";
import {
  castVisionRay,
  wallRayDist,
  hasLineOfSight,
  isInFov,
  findNearestVisibleWeapon,
} from "./combat.js";
import { clamp, normalizeAngle } from "./utils.js";

function weaponToIndex(type) {
  return WEAPON_INDEX[type] ?? 0;
}

export function isEnemyVisible(self, enemy, colliders) {
  if (enemy.hp <= 0) return false;
  const edx = enemy.x - self.x;
  const edz = enemy.z - self.z;
  const edist = Math.hypot(edx, edz);
  if (edist > VISION_RANGE) return false;
  const enemyAngle = Math.atan2(edx, edz);
  const halfFov = ((FPS_FOV_DEG * Math.PI) / 180) / 2;
  if (!isInFov(self.rotation, enemyAngle, halfFov)) return false;
  return hasLineOfSight(self.x, self.z, enemy.x, enemy.z, colliders, VISION_RANGE);
}

export function buildObservation(self, enemy, weapons, colliders) {
  const half = MAP_WORLD_SIZE / 2;
  const obs = new Float32Array(OBS_SIZE);
  let i = 0;

  obs[i++] = self.x / half;
  obs[i++] = self.z / half;
  obs[i++] = Math.sin(self.rotation);
  obs[i++] = Math.cos(self.rotation);
  obs[i++] = self.hp / PLAYER_MAX_HP;
  obs[i++] = weaponToIndex(self.weapon) / 3;
  obs[i++] = clamp(1 - self.cooldown / 1.2, 0, 1);

  const edx = enemy.x - self.x;
  const edz = enemy.z - self.z;
  const edist = Math.hypot(edx, edz);
  const enemyAngle = Math.atan2(edx, edz);
  const relAngle = normalizeAngle(enemyAngle - self.rotation);

  const seesEnemy = isEnemyVisible(self, enemy, colliders);

  const laser = castVisionRay(
    self.x,
    self.z,
    self.rotation,
    VISION_RANGE,
    [self, enemy],
    weapons,
    self.id,
    colliders
  );

  obs[i++] = seesEnemy ? 1 : 0;
  obs[i++] = seesEnemy ? clamp(edist / MAP_WORLD_SIZE, 0, 1) : 1;
  obs[i++] = seesEnemy ? Math.sin(relAngle) : 0;
  obs[i++] = seesEnemy ? Math.cos(relAngle) : 1;
  obs[i++] = seesEnemy ? enemy.hp / PLAYER_MAX_HP : 0;
  obs[i++] = seesEnemy ? weaponToIndex(enemy.weapon) / 3 : 0;

  const near = findNearestVisibleWeapon(self.x, self.z, self.rotation, weapons, colliders);
  if (near) {
    const wAngle = Math.atan2(near.weapon.x - self.x, near.weapon.z - self.z);
    const wRel = normalizeAngle(wAngle - self.rotation);
    obs[i++] = 1;
    obs[i++] = weaponToIndex(near.weapon.type) / 3;
    obs[i++] = clamp(near.dist / MAP_WORLD_SIZE, 0, 1);
    obs[i++] = Math.sin(wRel);
    obs[i++] = Math.cos(wRel);
  } else {
    obs[i++] = 0;
    obs[i++] = 0;
    obs[i++] = 1;
    obs[i++] = 0;
    obs[i++] = 1;
  }

  obs[i++] = clamp(laser.dist / VISION_RANGE, 0, 1);
  obs[i++] =
    laser.hitType === "enemy" ? 1 : laser.hitType === "weapon" ? 0.5 : laser.hitType === "wall" ? 0.25 : 0;

  for (let r = 0; r < 8; r++) {
    const angle = self.rotation + (r / 8) * Math.PI * 2;
    obs[i++] = wallRayDist(self.x, self.z, angle, colliders, VISION_RANGE);
  }

  return obs;
}

export function decodeActions(outputs) {
  return {
    up: outputs[0] > 0.35,
    down: false,
    left: outputs[2] > 0.35,
    right: outputs[3] > 0.35,
    shoot: outputs[4] > SHOOT_THRESHOLD,
  };
}

export function actionLabels(input) {
  const parts = [];
  if (input.up) parts.push("forward");
  if (input.down) parts.push("back");
  if (input.left) parts.push("left");
  if (input.right) parts.push("right");
  if (input.shoot) parts.push("fire");
  return parts.length ? parts.join(", ") : "—";
}
