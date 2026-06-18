import * as THREE from "three";
import { MAP_WORLD_SIZE, COLORS, MATCH_TIMEOUT } from "./config.js";
import { createWorld, setupLighting, getPlayerSpawnPositions, getWeaponSpawnPositions } from "./world.js";
import {
  Player,
  GroundWeapon,
  clearSceneObjects,
} from "./entities.js";
import { createCameraControls } from "./input.js";
import { damp } from "./utils.js";
import { createProjectileModel, createSlashEffect, placeSlashEffect } from "./models.js";

const BASE_ZOOM = MAP_WORLD_SIZE * 0.72;
const FRAME_DT = 3 / 60;

export class ReplayGame {
  constructor(canvas) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();
    this.projectiles = [];
    this.effects = [];
    this.replay = null;
    this.frameIndex = 0;
    this.frameTimer = 0;
    this.matchTime = 0;
    this.worldSeed = 42;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0xb0b8c8);

    this.scene = new THREE.Scene();
    this.worldGroup = new THREE.Group();
    this.scene.add(this.worldGroup);
    setupLighting(this.scene);

    this.topDownCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 300);
    this.activeCamera = this.topDownCamera;
    this.baseZoom = BASE_ZOOM;
    this.smoothPan = { x: 0, z: 0 };

    this.players = [];
    this.weapons = [];
    this.colliders = [];
    this.projMeshes = new Map();
    this.slashMeshes = [];

    this.timerEl = document.getElementById("match-timer");
    this.badgeEl = document.getElementById("replay-badge");
    this.cameraControls = createCameraControls(canvas);
    this.liveMode = true;
    this.replayLocked = false;

    this.handleResize = this.handleResize.bind(this);
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    window.addEventListener("resize", this.handleResize);
    this.handleResize();

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  clearWorld() {
    clearSceneObjects(this.projectiles, this.effects, this.worldGroup);
    for (const p of this.projMeshes.values()) this.worldGroup.remove(p);
    this.projMeshes.clear();
    for (const s of this.slashMeshes) this.worldGroup.remove(s);
    this.slashMeshes = [];

    while (this.worldGroup.children.length) {
      this.worldGroup.remove(this.worldGroup.children[0]);
    }
    this.players = [];
    this.weapons = [];
  }

  loadEmptyWorld(seed = 42) {
    this.worldSeed = seed;
    this.replay = null;
    this.clearWorld();
    const { colliders } = createWorld(this.worldGroup, seed);
    this.colliders = colliders;
    const spawns = getPlayerSpawnPositions();
    this.players = [
      new Player("blue", COLORS.bluePlayer, COLORS.bluePlayerLight, COLORS.bluePlayerDark, spawns.blue.x, spawns.blue.z),
      new Player("red", COLORS.redPlayer, COLORS.redPlayerLight, COLORS.redPlayerDark, spawns.red.x, spawns.red.z),
    ];
    for (const p of this.players) {
      this.worldGroup.add(p.mesh);
      p.initVisuals(this.worldGroup);
    }
    this.weapons = getWeaponSpawnPositions().map(
      (w) => new GroundWeapon(w.type, w.x, w.z, this.worldGroup)
    );
    this.updateTimerDisplay(0);
  }

  setLiveMode(enabled) {
    this.liveMode = enabled;
    this.replayLocked = !enabled;
    if (enabled) {
      this.replay = null;
      this.frameIndex = 0;
      this.frameTimer = 0;
    }
    if (this.badgeEl) {
      this.badgeEl.textContent = enabled ? "Live" : "Replay";
      this.badgeEl.classList.toggle("live", enabled);
    }
  }

  applyLivePacket(packet) {
    if (!this.liveMode) return;

    if (!this.players.length || this.worldSeed !== packet.seed) {
      this.loadEmptyWorld(packet.seed);
    }

    this.applyFrame(packet.frame);
    this.updateTimerDisplay(packet.t);
  }

  loadReplay(replay, onFrameBrain) {
    if (!replay?.frames?.length) return;
    this.setLiveMode(false);
    this.replay = replay;
    this.onFrameBrain = onFrameBrain;
    this.replayBrains = {
      blue: replay.blueBrain ?? null,
      red: replay.redBrain ?? null,
    };
    this.frameIndex = 0;
    this.frameTimer = 0;
    this.matchTime = 0;

    this.clearWorld();
    const { colliders } = createWorld(this.worldGroup, replay.seed);
    this.colliders = colliders;

    const spawns = getPlayerSpawnPositions();
    this.players = [
      new Player("blue", COLORS.bluePlayer, COLORS.bluePlayerLight, COLORS.bluePlayerDark, spawns.blue.x, spawns.blue.z),
      new Player("red", COLORS.redPlayer, COLORS.redPlayerLight, COLORS.redPlayerDark, spawns.red.x, spawns.red.z),
    ];
    for (const p of this.players) {
      this.worldGroup.add(p.mesh);
      p.initVisuals(this.worldGroup);
    }

    this.weapons = getWeaponSpawnPositions().map(
      (w) => new GroundWeapon(w.type, w.x, w.z, this.worldGroup)
    );

    this.applyFrame(replay.frames[0]);
    this.updateTimerDisplay(0);
  }

  applyFrame(frame) {
    if (!frame) return;
    this.matchTime = frame.t;

    for (const fp of frame.players) {
      const p = this.players.find((pl) => pl.id === fp.id);
      if (!p) continue;
      p.x = fp.x;
      p.z = fp.z;
      p.rotation = fp.rotation;
      p.hp = fp.hp;
      p.mesh.position.set(fp.x, 0, fp.z);
      p.mesh.rotation.y = fp.rotation;
      p.mesh.visible = fp.hp > 0;
      if (fp.weapon !== p.weapon) {
        if (fp.weapon) p.attachWeapon(fp.weapon);
        else {
          p.weapon = null;
          if (p.weaponMesh) {
            p.parts.weaponHolder.remove(p.weaponMesh);
            p.weaponMesh = null;
          }
        }
      }
      p.updateHpRing();
      if (p.laserGroup) p.laserGroup.visible = fp.hp > 0;
      if (p.fovMesh) p.fovMesh.visible = fp.hp > 0;
      p.updateFov(this.colliders);
      p.updateLaser(this.players, this.weapons, this.colliders);
    }

    for (let i = 0; i < this.weapons.length; i++) {
      const fw = frame.weapons[i];
      const w = this.weapons[i];
      if (!fw || !w) continue;
      w.active = fw.active;
      w.mesh.visible = fw.active;
    }

    const activeIds = new Set();
    for (const fp of frame.projectiles) {
      const key = fp.id != null ? `p-${fp.id}` : `${fp.owner}-${fp.x.toFixed(3)}-${fp.z.toFixed(3)}`;
      activeIds.add(key);
      if (!this.projMeshes.has(key)) {
        const mesh = createProjectileModel(fp.weapon);
        this.worldGroup.add(mesh);
        this.projMeshes.set(key, mesh);
      }
      const mesh = this.projMeshes.get(key);
      mesh.position.set(fp.x, fp.y ?? 1.05, fp.z);
    }
    for (const [key, mesh] of this.projMeshes) {
      if (!activeIds.has(key)) {
        this.worldGroup.remove(mesh);
        this.projMeshes.delete(key);
      }
    }

    for (const s of this.slashMeshes) this.worldGroup.remove(s);
    this.slashMeshes = [];
    for (const fe of frame.effects ?? []) {
      if (fe.type !== "slash") continue;
      const color = fe.owner === "blue" ? 0x6ab4f0 : 0xf08080;
      const slash = createSlashEffect(color, Math.PI * 0.42);
      placeSlashEffect(slash, fe.ox, fe.oz, fe.rotation);
      const fade = fe.life / (fe.lifeMax ?? 0.28);
      slash.userData.fill.material.opacity = fade * 0.58;
      this.worldGroup.add(slash);
      this.slashMeshes.push(slash);
    }

    if (this.onFrameBrain && this.replayBrains?.blue && this.replayBrains?.red) {
      this.onFrameBrain(frame, this.replay?.seed ?? this.worldSeed, this.replayBrains);
    }
  }

  updateTimerDisplay(t) {
    if (!this.timerEl) return;
    const remain = Math.max(0, MATCH_TIMEOUT - t);
    const sec = Math.floor(remain);
    const ms = Math.floor((remain - sec) * 1000);
    const urgent = remain <= 5;
    this.timerEl.textContent = `${sec}.${String(ms).padStart(3, "0")}`;
    this.timerEl.classList.toggle("urgent", urgent);
  }

  getAspect() {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    return w / h;
  }

  handleResize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === 0 || h === 0) return;
    const aspect = this.getAspect();
    const distance = this.cameraControls?.getDistance() ?? 58;
    const zoom = this.baseZoom * (distance / 58);
    this.topDownCamera.left = -zoom * aspect;
    this.topDownCamera.right = zoom * aspect;
    this.topDownCamera.top = zoom;
    this.topDownCamera.bottom = -zoom;
    this.topDownCamera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  updateCamera(dt) {
    const pan = this.cameraControls.getOffset();
    this.smoothPan.x = damp(this.smoothPan.x, pan.x, 10, dt);
    this.smoothPan.z = damp(this.smoothPan.z, pan.z, 10, dt);
    const distance = this.cameraControls.updateZoom(dt);
    const tx = this.smoothPan.x;
    const tz = this.smoothPan.z;
    const aspect = this.getAspect();
    const zoom = this.baseZoom * (distance / 58);
    this.topDownCamera.left = -zoom * aspect;
    this.topDownCamera.right = zoom * aspect;
    this.topDownCamera.top = zoom;
    this.topDownCamera.bottom = -zoom;
    this.topDownCamera.updateProjectionMatrix();
    this.topDownCamera.position.set(tx, distance * 0.92, tz + distance * 0.14);
    this.topDownCamera.lookAt(tx, 0, tz);

    for (const p of this.players) {
      p.setFovVisible(true);
    }
  }

  update(dt) {
    this.updateCamera(dt);

    if (this.liveMode || !this.replay?.frames?.length) return;

    this.frameTimer += dt;
    while (this.frameTimer >= FRAME_DT) {
      this.frameTimer -= FRAME_DT;
      this.frameIndex++;
      if (this.frameIndex >= this.replay.frames.length) {
        this.setLiveMode(true);
        return;
      }
      this.applyFrame(this.replay.frames[this.frameIndex]);
      this.updateTimerDisplay(this.matchTime);
    }
  }

  animate() {
    requestAnimationFrame(this.animate);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.update(dt);
    this.renderer.render(this.scene, this.activeCamera);
  }
}
