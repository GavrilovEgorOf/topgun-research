import * as THREE from "three";
import {
  PLAYER_RADIUS,
  PICKUP_RADIUS,
  MOVE_SPEED,
  TURN_SPEED,
  WEAPON_CONFIG,
  WEAPON_TYPES,
  MAP_WORLD_SIZE,
  PLAYER_MAX_HP,
  VISION_RANGE,
  FPS_FOV_DEG,
} from "./config.js";
import { clamp, damp } from "./utils.js";
import { castVisionRay, computeFovPolygon, meleeArcHit, pointInAabb } from "../shared/combat.js";
import {
  createCharacterModel,
  createGroundWeaponModel,
  createWeaponModel,
  createProjectileModel,
  createSlashEffect,
  placeSlashEffect,
  createMuzzleFlash,
  createBulletTrail,
  createShellCasing,
  createLaserSight,
  updateLaserSight,
  createFovMesh,
  updateFovMesh,
} from "./models.js";

const trailPool = [];

export class Player {
  constructor(id, mainColor, lightColor, darkColor, spawnX, spawnZ) {
    this.id = id;
    this.spawnX = spawnX;
    this.spawnZ = spawnZ;
    this.mainColor = mainColor;
    this.x = spawnX;
    this.z = spawnZ;
    this.rotation = 0;
    this.weapon = null;
    this.cooldown = 0;
    this.animTime = 0;
    this.isMoving = false;
    this.shootAnim = 0;
    this.shootAnimMax = 0.25;
    this.hitFlash = 0;
    this.aimBlend = 0;
    this.hp = PLAYER_MAX_HP;
    this.maxHp = PLAYER_MAX_HP;
    this.laserGroup = null;
    this.fovMesh = null;
    this.scene = null;
    this.fovColor = mainColor;

    this.mesh = createCharacterModel(mainColor, lightColor, darkColor);
    this.mesh.position.set(spawnX, 0, spawnZ);
    this.parts = this.mesh.userData.parts;
    this.weaponMesh = null;
  }

  initVisuals(scene) {
    this.scene = scene;
    this.laserGroup = createLaserSight();
    scene.add(this.laserGroup);
    this.fovMesh = createFovMesh(this.fovColor);
    scene.add(this.fovMesh);
  }

  reset() {
    this.x = this.spawnX;
    this.z = this.spawnZ;
    this.rotation = 0;
    this.weapon = null;
    this.cooldown = 0;
    this.hp = this.maxHp;
    this.hitFlash = 0;
    this.shootAnim = 0;
    this.mesh.visible = true;
    this.mesh.position.set(this.spawnX, 0, this.spawnZ);
    this.mesh.rotation.y = 0;
    if (this.weaponMesh) {
      this.parts.weaponHolder.remove(this.weaponMesh);
      this.weaponMesh = null;
    }
    if (this.laserGroup) this.laserGroup.visible = true;
    if (this.fovMesh) this.fovMesh.visible = true;
    this.updateHpRing();
  }

  attachWeapon(type) {
    if (this.weaponMesh) this.parts.weaponHolder.remove(this.weaponMesh);
    this.weapon = type;
    this.weaponMesh = createWeaponModel(type);
    this.parts.weaponHolder.add(this.weaponMesh);
  }

  updateHpRing() {
    const ratio = clamp(this.hp / this.maxHp, 0, 1);
    const { hpFill, hpTrack, hpInner, hpOuter } = this.parts;
    hpFill.geometry.dispose();

    if (ratio <= 0) {
      hpFill.visible = false;
      hpTrack.material.opacity = 0.55;
      return;
    }

    hpFill.visible = true;
    hpFill.geometry = new THREE.RingGeometry(
      hpInner, hpOuter, 48, 1, Math.PI / 2, Math.max(0.05, ratio * Math.PI * 2)
    );
    hpFill.rotation.x = -Math.PI / 2;
    hpTrack.material.opacity = ratio < 1 ? 0.55 : 0.38;
  }

  updateAnim(dt) {
    this.animTime += dt;
    const t = this.animTime;
    const p = this.parts;
    const stepSpeed = 13;

    if (this.isMoving) {
      const phase = Math.sin(t * stepSpeed);
      const lift = Math.max(0, phase);

      p.leftLeg.rotation.x = -phase * 0.55;
      p.rightLeg.rotation.x = phase * 0.55;
      p.leftLeg.position.z = 0.04 + phase * 0.1;
      p.rightLeg.position.z = 0.04 - phase * 0.1;
      p.leftLeg.position.y = 0.15 + Math.max(0, -phase) * 0.05;
      p.rightLeg.position.y = 0.15 + Math.max(0, phase) * 0.05;

      p.leftArm.rotation.x = phase * 0.35;
      p.rightArm.rotation.x = -phase * 0.35;
      p.leftArm.position.z = 0.1 - phase * 0.06;
      p.rightArm.position.z = 0.1 + phase * 0.06;

      p.body.position.y = 0.76 + lift * 0.04;
      p.body.position.z = 0.04 + 0.03;
      p.body.rotation.x = 0.06;
      p.head.position.y = 1.44 + lift * 0.025;
      p.head.position.z = 0.06 + 0.02;
      p.belly.position.z = 0.22 + 0.02;
      p.shadow.scale.setScalar(0.95 + lift * 0.08);
    } else {
      p.leftLeg.rotation.x = damp(p.leftLeg.rotation.x, 0, 12, dt);
      p.rightLeg.rotation.x = damp(p.rightLeg.rotation.x, 0, 12, dt);
      p.leftLeg.position.z = damp(p.leftLeg.position.z, 0.04, 12, dt);
      p.rightLeg.position.z = damp(p.rightLeg.position.z, 0.04, 12, dt);
      p.leftLeg.position.y = damp(p.leftLeg.position.y, 0.15, 12, dt);
      p.rightLeg.position.y = damp(p.rightLeg.position.y, 0.15, 12, dt);
      p.leftArm.rotation.x = damp(p.leftArm.rotation.x, 0, 12, dt);
      p.rightArm.rotation.x = damp(p.rightArm.rotation.x, 0, 12, dt);
      p.leftArm.position.z = damp(p.leftArm.position.z, 0.1, 12, dt);
      p.rightArm.position.z = damp(p.rightArm.position.z, 0.1, 12, dt);
      p.body.position.y = damp(p.body.position.y, 0.76, 10, dt);
      p.body.position.z = damp(p.body.position.z, 0.04, 10, dt);
      p.body.rotation.x = damp(p.body.rotation.x, 0, 10, dt);
      p.head.position.y = damp(p.head.position.y, 1.44, 10, dt);
      p.head.position.z = damp(p.head.position.z, 0.06, 10, dt);
      p.belly.position.z = damp(p.belly.position.z, 0.22, 10, dt);
      p.shadow.scale.setScalar(damp(p.shadow.scale.x, 1, 8, dt));
    }

    const hasGun = this.weapon && this.weapon !== WEAPON_TYPES.KATANA;
    this.aimBlend = damp(this.aimBlend, hasGun ? 1 : 0, 8, dt);
    if (!this.isMoving && this.shootAnim <= 0) {
      p.rightArm.rotation.x = damp(p.rightArm.rotation.x, -0.35 * this.aimBlend, 10, dt);
    }

    if (this.shootAnim > 0) {
      this.shootAnim -= dt;
      const kick = Math.sin((1 - this.shootAnim / this.shootAnimMax) * Math.PI);

      if (this.weapon === WEAPON_TYPES.KATANA) {
        p.rightArm.rotation.x = -0.2 - kick * 1.1;
        p.rightArm.rotation.z = kick * 0.45;
        p.body.rotation.x = kick * 0.12;
        p.weaponHolder.position.z = 0.28 + kick * 0.35;
      } else {
        p.rightArm.rotation.x = -0.5 - kick * 0.5;
        p.body.rotation.x = -kick * 0.1;
        p.weaponHolder.position.z = 0.28 + kick * 0.3;
        if (this.weaponMesh?.userData.barrel) {
          this.weaponMesh.userData.barrel.position.z = 0.18 - kick * 0.04;
        }
      }
    } else if (!this.isMoving) {
      p.body.rotation.x = damp(p.body.rotation.x, 0, 12, dt);
      p.rightArm.rotation.z = damp(p.rightArm.rotation.z, 0, 12, dt);
      p.weaponHolder.position.z = damp(p.weaponHolder.position.z, 0.28, 12, dt);
      if (this.weaponMesh?.userData.barrel) {
        this.weaponMesh.userData.barrel.position.z = damp(
          this.weaponMesh.userData.barrel.position.z, 0.18, 14, dt
        );
      }
    }

    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      const f = this.hitFlash * 3.5;
      p.body.material.emissive?.setHex(0xff4444);
      p.head.material.emissive?.setHex(0xff4444);
      if (p.body.material.emissiveIntensity !== undefined) {
        p.body.material.emissiveIntensity = f;
        p.head.material.emissiveIntensity = f;
      }
    } else if (p.body.material.emissiveIntensity !== undefined) {
      p.body.material.emissiveIntensity = 0;
      p.head.material.emissiveIntensity = 0;
    }
  }

  update(dt, input, colliders, projectiles, effects, scene, allPlayers, weapons) {
    if (this.hp <= 0) {
      this.mesh.visible = false;
      if (this.laserGroup) this.laserGroup.visible = false;
      if (this.fovMesh) this.fovMesh.visible = false;
      return;
    }

    this.cooldown = Math.max(0, this.cooldown - dt);
    if (input.left) this.rotation += TURN_SPEED * dt;
    if (input.right) this.rotation -= TURN_SPEED * dt;

    let move = 0;
    if (input.up) move += 1;
    if (input.down) move -= 1;
    this.isMoving = move !== 0;

    if (move !== 0) {
      const dx = Math.sin(this.rotation) * move * MOVE_SPEED * dt;
      const dz = Math.cos(this.rotation) * move * MOVE_SPEED * dt;
      this.tryMove(dx, dz, colliders);
    }

    this.mesh.position.x = this.x;
    this.mesh.position.z = this.z;
    this.mesh.rotation.y = this.rotation;

    if (input.shoot && this.weapon && this.cooldown <= 0) {
      this.shoot(projectiles, effects, scene);
    }

    this.updateLaser(allPlayers, weapons, colliders);
    this.updateFov(colliders);
    this.updateAnim(dt);
  }

  updateFov(colliders) {
    if (!this.fovMesh) return;
    const halfFov = ((FPS_FOV_DEG * Math.PI) / 180) / 2;
    const polygon = computeFovPolygon(
      this.x, this.z, this.rotation, halfFov, VISION_RANGE, colliders
    );
    updateFovMesh(this.fovMesh, polygon, this.x, this.z, this.rotation);
  }

  updateLaser(players, weapons, colliders = []) {
    if (!this.laserGroup) return;
    const hit = castVisionRay(
      this.x, this.z, this.rotation, VISION_RANGE, players, weapons, this.id, colliders
    );
    updateLaserSight(
      this.laserGroup, this.x, this.z, hit.dist, hit.dx, hit.dz, hit.hitType
    );
  }

  setFovVisible(visible) {
    if (this.fovMesh) this.fovMesh.visible = visible && this.hp > 0;
  }

  tryMove(dx, dz, colliders) {
    const half = MAP_WORLD_SIZE / 2 - PLAYER_RADIUS - 0.2;
    const nx = clamp(this.x + dx, -half, half);
    const nz = clamp(this.z + dz, -half, half);
    if (!this.collides(nx, this.z, colliders)) this.x = nx;
    if (!this.collides(this.x, nz, colliders)) this.z = nz;
  }

  collides(x, z, colliders) {
    const r = PLAYER_RADIUS;
    for (const c of colliders) {
      if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) return true;
    }
    return false;
  }

  shoot(projectiles, effects, scene) {
    const cfg = WEAPON_CONFIG[this.weapon];
    this.cooldown = cfg.cooldown;
    this.shootAnimMax = this.weapon === WEAPON_TYPES.BOW ? 0.45
      : this.weapon === WEAPON_TYPES.KATANA ? 0.35 : 0.28;
    this.shootAnim = this.shootAnimMax;

    const dirX = Math.sin(this.rotation);
    const dirZ = Math.cos(this.rotation);

    if (this.weapon === WEAPON_TYPES.KATANA) {
      const slashColor = this.id === "blue" ? 0x6ab4f0 : 0xf08080;
      const slash = createSlashEffect(slashColor, cfg.arcHalf);
      placeSlashEffect(slash, this.x, this.z, this.rotation);
      scene.add(slash);
      effects.push({
        mesh: slash,
        life: 0.28,
        lifeMax: 0.28,
        type: "slash",
        owner: this.id,
        ox: this.x,
        oz: this.z,
        rotation: this.rotation,
        range: cfg.range,
        arcHalf: cfg.arcHalf,
        hit: false,
        damage: cfg.damage,
      });
      return;
    }

    const angle = this.rotation + (Math.random() - 0.5) * cfg.spread * 2;
    const sdx = Math.sin(angle);
    const sdz = Math.cos(angle);
    const startX = this.x + sdx * 0.75;
    const startZ = this.z + sdz * 0.75;
    const startY = 1.05;

    const proj = createProjectileModel(this.weapon);
    proj.position.set(startX, startY, startZ);
    proj.rotation.y = angle;
    scene.add(proj);

    const flash = createMuzzleFlash();
    flash.position.set(startX, startY, startZ);
    flash.rotation.y = angle;
    scene.add(flash);
    effects.push({ mesh: flash, life: 0.12, type: "flash" });

    if (this.weapon === WEAPON_TYPES.PISTOL) {
      const shell = createShellCasing();
      shell.position.set(this.x - dirZ * 0.2, 1.0, this.z + dirX * 0.2);
      scene.add(shell);
      effects.push({
        mesh: shell, life: 0.55, type: "shell",
        vx: -dirZ * 2.5 + (Math.random() - 0.5), vy: 2.2,
        vz: dirX * 2.5 + (Math.random() - 0.5),
      });
    }

    projectiles.push({
      mesh: proj, x: startX, z: startZ, y: startY,
      dx: sdx, dz: sdz, speed: cfg.projectileSpeed, range: cfg.range,
      traveled: 0, owner: this.id, weapon: this.weapon, damage: cfg.damage,
      spin: 0, trailMeshes: [], trailTimer: 0,
    });
  }

  takeHit(damage = 1) {
    if (this.hp <= 0) return false;
    this.hp = Math.max(0, this.hp - damage);
    this.hitFlash = 0.35;
    this.updateHpRing();
    return this.hp <= 0;
  }

  getEyePosition() {
    return { x: this.x, y: 1.32, z: this.z, rotation: this.rotation };
  }
}

export class GroundWeapon {
  constructor(type, x, z, scene) {
    this.type = type;
    this.x = x;
    this.z = z;
    this.scene = scene;
    this.active = true;
    this.floatOffset = Math.random() * Math.PI * 2;
    this.mesh = createGroundWeaponModel(type);
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
  }

  update(dt) {
    if (!this.active) return;
    const t = performance.now() * 0.001 + this.floatOffset;
    const wm = this.mesh.userData.weaponMesh;
    wm.position.y = 0.42 + Math.sin(t * 2) * 0.05;
    wm.rotation.y = t * 0.7;
  }

  tryPickup(player) {
    if (!this.active || player.hp <= 0) return false;
    if (Math.hypot(player.x - this.x, player.z - this.z) < PICKUP_RADIUS) {
      this.active = false;
      this.mesh.visible = false;
      player.attachWeapon(this.type);
      return true;
    }
    return false;
  }

  respawn() {
    this.active = true;
    this.mesh.visible = true;
    this.floatOffset = Math.random() * Math.PI * 2;
  }
}

function acquireTrail(scene) {
  const mesh = trailPool.pop() ?? createBulletTrail();
  mesh.material.opacity = 0.45;
  mesh.visible = true;
  scene.add(mesh);
  return mesh;
}

function releaseTrail(mesh, scene) {
  mesh.visible = false;
  scene.remove(mesh);
  if (trailPool.length < 24) trailPool.push(mesh);
}

function projectileHitsWall(x, z, colliders) {
  for (const c of colliders) {
    if (pointInAabb(x, z, c)) return true;
  }
  return false;
}

export function updateProjectiles(projectiles, players, colliders, scene, dt, onKill) {
  const toRemove = [];

  for (let i = 0; i < projectiles.length; i++) {
    const p = projectiles[i];
    const step = p.speed * dt;
    p.x += p.dx * step;
    p.z += p.dz * step;
    p.traveled += step;
    p.spin += dt * 18;
    p.mesh.position.set(p.x, p.y, p.z);
    p.mesh.rotation.y = Math.atan2(p.dx, p.dz);

    p.trailTimer -= dt;
    if (p.trailTimer <= 0 && p.weapon === WEAPON_TYPES.PISTOL) {
      p.trailTimer = 0.025;
      const trail = acquireTrail(scene);
      trail.position.set(p.x, p.y, p.z);
      trail.rotation.y = Math.atan2(p.dx, p.dz);
      p.trailMeshes.push({ mesh: trail, life: 0.18 });
    }

    for (let t = p.trailMeshes.length - 1; t >= 0; t--) {
      p.trailMeshes[t].life -= dt;
      p.trailMeshes[t].mesh.material.opacity = p.trailMeshes[t].life * 3;
      if (p.trailMeshes[t].life <= 0) {
        releaseTrail(p.trailMeshes[t].mesh, scene);
        p.trailMeshes.splice(t, 1);
      }
    }

    if (p.traveled >= p.range || projectileHitsWall(p.x, p.z, colliders)) {
      toRemove.push(i);
      continue;
    }

    for (const pl of players) {
      if (pl.id === p.owner || pl.hp <= 0) continue;
      if (Math.hypot(pl.x - p.x, pl.z - p.z) < PLAYER_RADIUS + 0.2) {
        if (pl.takeHit(p.damage)) onKill?.(pl);
        toRemove.push(i);
        break;
      }
    }
  }

  for (let i = toRemove.length - 1; i >= 0; i--) {
    const idx = toRemove[i];
    const p = projectiles[idx];
    for (const t of p.trailMeshes) releaseTrail(t.mesh, scene);
    scene.remove(p.mesh);
    projectiles.splice(idx, 1);
  }
}

export function updateEffects(effects, players, scene, dt, onKill) {
  const toRemove = [];

  for (let i = 0; i < effects.length; i++) {
    const e = effects[i];
    e.life -= dt;

    if (e.type === "slash") {
      const fade = e.life / (e.lifeMax ?? 0.28);
      e.mesh.userData.fill.material.opacity = fade * 0.58;
      if (e.mesh.userData.rim) e.mesh.userData.rim.material.opacity = fade * 0.32;
      if (!e.hit) {
        for (const pl of players) {
          if (pl.id === e.owner || pl.hp <= 0) continue;
          if (meleeArcHit(e.ox, e.oz, e.rotation, e.range, e.arcHalf, pl.x, pl.z)) {
            if (pl.takeHit(e.damage ?? 1)) onKill?.(pl);
            e.hit = true;
            break;
          }
        }
      }
    }

    if (e.type === "flash") {
      const s = e.life / 0.12;
      e.mesh.scale.setScalar(0.6 + (1 - s) * 0.8);
      if (e.mesh.userData.streak) e.mesh.userData.streak.scale.z = s;
    }

    if (e.type === "shell") {
      e.vy -= 9.8 * dt;
      e.mesh.position.x += e.vx * dt;
      e.mesh.position.y += e.vy * dt;
      e.mesh.position.z += e.vz * dt;
      e.mesh.rotation.x += dt * 8;
      if (e.mesh.position.y < 0.05) e.life = 0;
    }

    if (e.life <= 0) toRemove.push(i);
  }

  for (let i = toRemove.length - 1; i >= 0; i--) {
    scene.remove(effects[toRemove[i]].mesh);
    effects.splice(toRemove[i], 1);
  }
}

export function clearSceneObjects(projectiles, effects, scene) {
  for (const p of projectiles) {
    for (const t of p.trailMeshes ?? []) releaseTrail(t.mesh, scene);
    scene.remove(p.mesh);
  }
  projectiles.length = 0;
  for (const e of effects) scene.remove(e.mesh);
  effects.length = 0;
}
