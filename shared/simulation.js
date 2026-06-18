/**
 * Fixed-timestep combat simulation shared by training workers, live broadcaster,
 * and replay playback. All game logic lives here to avoid train/serve skew.
 */
import {
  MAP_SIZE,
  CELL_SIZE,
  MAP_WORLD_SIZE,
  PLAYER_RADIUS,
  PICKUP_RADIUS,
  MOVE_SPEED,
  TURN_SPEED,
  WEAPON_CONFIG,
  WEAPON_TYPES,
  PLAYER_MAX_HP,
  MATCH_TIMEOUT,
  FIXED_DT,
  REPLAY_FRAME_INTERVAL,
  KILL_TIME_BONUS_BASE,
  WORLD_SEED,
  EXPLORATION_CELL_BONUS,
  EXPLORATION_APPROACH_BONUS,
  PICKUP_REWARD,
  DAMAGE_REWARD,
  WEAPON_SIGHT_BONUS,
  VISION_RANGE,
  WALL_GRIND_PENALTY,
  CORNER_CAMP_PENALTY,
  STAGNATION_PENALTY,
  STAGNATION_MOVE_EPS,
  WALL_CLOSE_NORM,
  MOVE_REWARD_PER_UNIT,
  MOVE_REWARD_CAP,
} from "./config.js";
import { KILL_WIN_BASE, KILL_LOSS_PENALTY, KILL_SPEED_MULTIPLIER } from "./rewards.js";
import { buildColliders, getWeaponSpawnPositions, getPlayerSpawnPositions } from "./world.js";
import {
  meleeArcHit,
  pointInAabb,
  findNearestVisibleWeapon,
  wallRayDist,
  countCloseForwardWalls,
  computeDrawPenalty,
} from "./combat.js";
import { buildObservation, decodeActions, isEnemyVisible } from "./observations.js";
import { clamp, cellKey } from "./utils.js";

function createPlayer(id, spawnX, spawnZ) {
  return {
    id,
    spawnX,
    spawnZ,
    x: spawnX,
    z: spawnZ,
    rotation: 0,
    weapon: null,
    cooldown: 0,
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
  };
}

function createWeapon(type, x, z) {
  return { type, x, z, active: true };
}

function nearestVisibleWeaponDist(player, weapons, colliders) {
  const found = findNearestVisibleWeapon(
    player.x,
    player.z,
    player.rotation,
    weapons,
    colliders
  );
  return found ? found.dist : Infinity;
}

export class Simulation {
  constructor(seed = WORLD_SEED, options = {}) {
    this.seed = seed;
    this.colliders = buildColliders(seed);
    const spawns = getPlayerSpawnPositions();
    this.players = [
      createPlayer("blue", spawns.blue.x, spawns.blue.z),
      createPlayer("red", spawns.red.x, spawns.red.z),
    ];
    this.weapons = getWeaponSpawnPositions().map((w) => createWeapon(w.type, w.x, w.z));
    this.projectiles = [];
    this.effects = [];
    this.time = 0;
    this.frame = 0;
    this.done = false;
    this.winner = null;
    this.reason = null;
    this.stats = {
      blueDamage: 0,
      redDamage: 0,
      bluePickup: false,
      redPickup: false,
      blueVisited: new Set(),
      redVisited: new Set(),
      blueNewCells: 0,
      redNewCells: 0,
      blueWeaponApproach: 0,
      redWeaponApproach: 0,
      bluePrevWeaponDist: null,
      redPrevWeaponDist: null,
      blueSawEnemy: false,
      redSawEnemy: false,
      blueSawWeapon: false,
      redSawWeapon: false,
      blueWallGrind: 0,
      redWallGrind: 0,
      blueCornerCamp: 0,
      redCornerCamp: 0,
      blueStagnation: 0,
      redStagnation: 0,
      blueDistance: 0,
      redDistance: 0,
    };
    this.explorationMult = options.explorationMult ?? 1;
    this.recordReplay = options.recordReplay ?? false;
    this.replayFrames = [];
    this.lastActions = { blue: null, red: null };
    this.nextProjectileId = 1;
    if (this.recordReplay) this.captureFrame();
  }

  getPlayer(id) {
    return this.players.find((p) => p.id === id);
  }

  getEnemy(id) {
    return this.players.find((p) => p.id !== id);
  }

  trackExploration(player) {
    const isBlue = player.id === "blue";
    const visited = isBlue ? this.stats.blueVisited : this.stats.redVisited;
    const key = cellKey(player.x, player.z, MAP_SIZE, CELL_SIZE);
    if (!visited.has(key)) {
      visited.add(key);
      if (isBlue) this.stats.blueNewCells++;
      else this.stats.redNewCells++;
    }

    if (player.weapon || player.hp <= 0) return;

    const dist = nearestVisibleWeaponDist(player, this.weapons, this.colliders);
    if (!Number.isFinite(dist)) return;

    const prevKey = isBlue ? "bluePrevWeaponDist" : "redPrevWeaponDist";
    const approachKey = isBlue ? "blueWeaponApproach" : "redWeaponApproach";
    const prev = this.stats[prevKey];
    if (prev == null || !Number.isFinite(prev)) {
      this.stats[prevKey] = dist;
      return;
    }
    if (dist < prev) {
      this.stats[approachKey] +=
        (prev - dist) * EXPLORATION_APPROACH_BONUS * this.explorationMult;
    }
    this.stats[prevKey] = dist;
  }

  trackPassivity(player, input, prevX, prevZ) {
    if (player.hp <= 0) return;

    const isBlue = player.id === "blue";
    const moved = Math.hypot(player.x - prevX, player.z - prevZ);

    if (isBlue) this.stats.blueDistance += moved;
    else this.stats.redDistance += moved;

    const wallGrindKey = isBlue ? "blueWallGrind" : "redWallGrind";
    const cornerKey = isBlue ? "blueCornerCamp" : "redCornerCamp";
    const stagnationKey = isBlue ? "blueStagnation" : "redStagnation";

    const fwdWall = wallRayDist(
      player.x,
      player.z,
      player.rotation,
      this.colliders,
      VISION_RANGE
    );
    const grinding =
      input.up && fwdWall < WALL_CLOSE_NORM && moved < STAGNATION_MOVE_EPS;
    if (grinding) this.stats[wallGrindKey] += WALL_GRIND_PENALTY;

    const closeWalls = countCloseForwardWalls(
      player.x,
      player.z,
      player.rotation,
      this.colliders,
      VISION_RANGE
    );
    const inCorner = closeWalls >= 2 && moved < STAGNATION_MOVE_EPS;
    if (inCorner) this.stats[cornerKey] += CORNER_CAMP_PENALTY;

    if (moved < STAGNATION_MOVE_EPS) {
      this.stats[stagnationKey] += STAGNATION_PENALTY;
    }
  }

  snapshotFrame() {
    return {
      t: this.time,
      players: this.players.map((p) => ({
        id: p.id,
        x: p.x,
        z: p.z,
        rotation: p.rotation,
        hp: p.hp,
        weapon: p.weapon,
      })),
      weapons: this.weapons.map((w) => ({
        type: w.type,
        x: w.x,
        z: w.z,
        active: w.active,
      })),
      projectiles: this.projectiles.map((p) => ({
        id: p.id,
        x: p.x,
        z: p.z,
        y: p.y,
        weapon: p.weapon,
        owner: p.owner,
      })),
      effects: this.effects
        .filter((e) => e.type === "slash")
        .map((e) => ({
          type: e.type,
          owner: e.owner,
          ox: e.ox,
          oz: e.oz,
          rotation: e.rotation,
          life: e.life,
          lifeMax: e.lifeMax,
        })),
    };
  }

  captureFrame() {
    this.replayFrames.push(this.snapshotFrame());
  }

  tryMove(player, dx, dz) {
    const half = MAP_WORLD_SIZE / 2 - PLAYER_RADIUS - 0.2;
    const nx = clamp(player.x + dx, -half, half);
    const nz = clamp(player.z + dz, -half, half);
    if (!this.collides(nx, player.z)) player.x = nx;
    if (!this.collides(player.x, nz)) player.z = nz;
  }

  collides(x, z) {
    const r = PLAYER_RADIUS;
    for (const c of this.colliders) {
      if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) return true;
    }
    return false;
  }

  applyInput(player, input) {
    if (player.hp <= 0) return;

    player.cooldown = Math.max(0, player.cooldown - FIXED_DT);
    if (input.left) player.rotation += TURN_SPEED * FIXED_DT;
    if (input.right) player.rotation -= TURN_SPEED * FIXED_DT;

    let move = 0;
    if (input.up) move += 1;
    if (input.down) move -= 1;

    const prevX = player.x;
    const prevZ = player.z;

    if (move !== 0) {
      const dx = Math.sin(player.rotation) * move * MOVE_SPEED * FIXED_DT;
      const dz = Math.cos(player.rotation) * move * MOVE_SPEED * FIXED_DT;
      this.tryMove(player, dx, dz);
    }

    if (input.shoot && player.weapon && player.cooldown <= 0) {
      this.shoot(player);
    }

    this.trackExploration(player);
    this.trackPassivity(player, input, prevX, prevZ);
  }

  shoot(player) {
    const cfg = WEAPON_CONFIG[player.weapon];
    player.cooldown = cfg.cooldown;
    const dirX = Math.sin(player.rotation);
    const dirZ = Math.cos(player.rotation);

    if (player.weapon === WEAPON_TYPES.KATANA) {
      this.effects.push({
        type: "slash",
        owner: player.id,
        ox: player.x,
        oz: player.z,
        rotation: player.rotation,
        range: cfg.range,
        arcHalf: cfg.arcHalf,
        life: 0.28,
        lifeMax: 0.28,
        hit: false,
        damage: cfg.damage,
      });
      return;
    }

    const angle = player.rotation + (Math.random() - 0.5) * cfg.spread * 2;
    const sdx = Math.sin(angle);
    const sdz = Math.cos(angle);
    const startX = player.x + sdx * 0.75;
    const startZ = player.z + sdz * 0.75;

    this.projectiles.push({
      id: this.nextProjectileId++,
      x: startX,
      z: startZ,
      y: 1.05,
      dx: sdx,
      dz: sdz,
      speed: cfg.projectileSpeed,
      range: cfg.range,
      traveled: 0,
      owner: player.id,
      weapon: player.weapon,
      damage: cfg.damage,
    });
  }

  tryPickup(player) {
    for (const w of this.weapons) {
      if (!w.active || player.hp <= 0) continue;
      if (Math.hypot(player.x - w.x, player.z - w.z) < PICKUP_RADIUS) {
        w.active = false;
        player.weapon = w.type;
        if (player.id === "blue") this.stats.bluePickup = true;
        else this.stats.redPickup = true;
        return true;
      }
    }
    return false;
  }

  takeHit(player, damage = 1, attackerId = null) {
    if (player.hp <= 0) return false;
    player.hp = Math.max(0, player.hp - damage);
    if (attackerId === "blue") this.stats.blueDamage += damage;
    if (attackerId === "red") this.stats.redDamage += damage;
    return player.hp <= 0;
  }

  onKill(victim) {
    if (this.done) return;
    this.done = true;
    this.winner = victim.id === "blue" ? "red" : "blue";
    this.reason = "kill";
    if (this.recordReplay) this.captureFrame();
  }

  updateProjectiles() {
    const toRemove = [];

    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i];
      const step = p.speed * FIXED_DT;
      p.x += p.dx * step;
      p.z += p.dz * step;
      p.traveled += step;

      if (p.traveled >= p.range || this.projectileHitsWall(p.x, p.z)) {
        toRemove.push(i);
        continue;
      }

      for (const pl of this.players) {
        if (pl.id === p.owner || pl.hp <= 0) continue;
        if (Math.hypot(pl.x - p.x, pl.z - p.z) < PLAYER_RADIUS + 0.2) {
          if (this.takeHit(pl, p.damage, p.owner)) this.onKill(pl);
          toRemove.push(i);
          break;
        }
      }
    }

    for (let i = toRemove.length - 1; i >= 0; i--) {
      this.projectiles.splice(toRemove[i], 1);
    }
  }

  projectileHitsWall(x, z) {
    for (const c of this.colliders) {
      if (pointInAabb(x, z, c)) return true;
    }
    return false;
  }

  updateEffects() {
    const toRemove = [];

    for (let i = 0; i < this.effects.length; i++) {
      const e = this.effects[i];
      e.life -= FIXED_DT;

      if (e.type === "slash" && !e.hit) {
        for (const pl of this.players) {
          if (pl.id === e.owner || pl.hp <= 0) continue;
          if (meleeArcHit(e.ox, e.oz, e.rotation, e.range, e.arcHalf, pl.x, pl.z)) {
            if (this.takeHit(pl, e.damage ?? 1, e.owner)) this.onKill(pl);
            e.hit = true;
            break;
          }
        }
      }

      if (e.life <= 0) toRemove.push(i);
    }

    for (let i = toRemove.length - 1; i >= 0; i--) {
      this.effects.splice(toRemove[i], 1);
    }
  }

  step(blueNet, redNet) {
    if (this.done) return;

    const blue = this.getPlayer("blue");
    const red = this.getPlayer("red");

    const blueObs = buildObservation(blue, red, this.weapons, this.colliders);
    const redObs = buildObservation(red, blue, this.weapons, this.colliders);

    const blueInput = decodeActions(blueNet.predict(blueObs));
    const redInput = decodeActions(redNet.predict(redObs));

    this.lastActions = { blue: blueInput, red: redInput };

    if (this.frame % 2 === 0) {
      this.applyInput(blue, blueInput);
      this.applyInput(red, redInput);
    } else {
      this.applyInput(red, redInput);
      this.applyInput(blue, blueInput);
    }

    if (isEnemyVisible(blue, red, this.colliders)) this.stats.blueSawEnemy = true;
    if (isEnemyVisible(red, blue, this.colliders)) this.stats.redSawEnemy = true;
    if (findNearestVisibleWeapon(blue.x, blue.z, blue.rotation, this.weapons, this.colliders)) {
      this.stats.blueSawWeapon = true;
    }
    if (findNearestVisibleWeapon(red.x, red.z, red.rotation, this.weapons, this.colliders)) {
      this.stats.redSawWeapon = true;
    }

    this.tryPickup(blue);
    this.tryPickup(red);

    this.updateProjectiles();
    this.updateEffects();

    this.time += FIXED_DT;
    this.frame++;

    if (this.time >= MATCH_TIMEOUT) {
      this.done = true;
      this.winner = null;
      this.reason = "timeout";
      if (this.recordReplay) this.captureFrame();
      return;
    }

    if (this.recordReplay && this.frame % REPLAY_FRAME_INTERVAL === 0) {
      this.captureFrame();
    }
  }

  runToEnd(blueNet, redNet, maxSteps = Math.ceil(MATCH_TIMEOUT / FIXED_DT) + 5) {
    while (!this.done && maxSteps-- > 0) {
      this.step(blueNet, redNet);
    }
    return this.getResult();
  }

  getResult() {
    const killTimeMs = Math.round(this.time * 1000);
    let blueFitness = 0;
    let redFitness = 0;

    if (this.stats.bluePickup) blueFitness += PICKUP_REWARD;
    if (this.stats.redPickup) redFitness += PICKUP_REWARD;
    if (this.stats.blueSawWeapon) blueFitness += WEAPON_SIGHT_BONUS;
    if (this.stats.redSawWeapon) redFitness += WEAPON_SIGHT_BONUS;
    blueFitness += this.stats.blueDamage * DAMAGE_REWARD;
    redFitness += this.stats.redDamage * DAMAGE_REWARD;
    const explMult = this.explorationMult;
    blueFitness += this.stats.blueNewCells * EXPLORATION_CELL_BONUS * explMult;
    redFitness += this.stats.redNewCells * EXPLORATION_CELL_BONUS * explMult;
    blueFitness += this.stats.blueWeaponApproach ?? 0;
    redFitness += this.stats.redWeaponApproach ?? 0;

    blueFitness -= this.stats.blueWallGrind ?? 0;
    redFitness -= this.stats.redWallGrind ?? 0;
    blueFitness -= this.stats.blueCornerCamp ?? 0;
    redFitness -= this.stats.redCornerCamp ?? 0;
    blueFitness -= this.stats.blueStagnation ?? 0;
    redFitness -= this.stats.redStagnation ?? 0;

    blueFitness += Math.min(
      (this.stats.blueDistance ?? 0) * MOVE_REWARD_PER_UNIT,
      MOVE_REWARD_CAP
    );
    redFitness += Math.min(
      (this.stats.redDistance ?? 0) * MOVE_REWARD_PER_UNIT,
      MOVE_REWARD_CAP
    );

    if (this.reason === "kill") {
      const speedBonus = KILL_TIME_BONUS_BASE - this.time;
      if (this.winner === "blue") {
        blueFitness += KILL_WIN_BASE + speedBonus * KILL_SPEED_MULTIPLIER;
        redFitness -= KILL_LOSS_PENALTY;
      } else {
        redFitness += KILL_WIN_BASE + speedBonus * KILL_SPEED_MULTIPLIER;
        blueFitness -= KILL_LOSS_PENALTY;
      }
    } else if (this.reason === "timeout") {
      const drawPen = computeDrawPenalty(this.time);
      blueFitness += drawPen;
      redFitness += drawPen;
    }

    return {
      done: this.done,
      winner: this.winner,
      reason: this.reason,
      time: this.time,
      killTimeMs,
      blueFitness,
      redFitness,
      lastActions: this.lastActions,
      replayFrames: this.replayFrames,
      seed: this.seed,
      stats: {
        bluePickup: this.stats.bluePickup,
        redPickup: this.stats.redPickup,
        blueDamage: this.stats.blueDamage,
        redDamage: this.stats.redDamage,
        blueNewCells: this.stats.blueNewCells,
        redNewCells: this.stats.redNewCells,
        blueWeaponApproach: this.stats.blueWeaponApproach,
        redWeaponApproach: this.stats.redWeaponApproach,
        blueSawEnemy: this.stats.blueSawEnemy,
        redSawEnemy: this.stats.redSawEnemy,
        blueSawWeapon: this.stats.blueSawWeapon,
        redSawWeapon: this.stats.redSawWeapon,
        visibleKill:
          this.reason === "kill" &&
          ((this.winner === "blue" && this.stats.blueSawEnemy) ||
            (this.winner === "red" && this.stats.redSawEnemy)),
      },
    };
  }
}

export function computeFitness(result, side) {
  return side === "blue" ? result.blueFitness : result.redFitness;
}

export function isImprovingKill(result, bestKillTimeMs) {
  if (result.reason !== "kill") return false;
  if (bestKillTimeMs == null || !Number.isFinite(bestKillTimeMs)) return true;
  return result.killTimeMs < bestKillTimeMs;
}
