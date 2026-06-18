import * as THREE from "three";
import {
  COLORS,
  WEAPON_TYPES,
  LASER_COLOR_GREEN,
  LASER_COLOR_RED,
  LASER_COLOR_YELLOW,
  LASER_HEIGHT,
} from "./config.js";

const matCache = new Map();

function bodyMat(color, roughness = 0.65, metalness = 0.06) {
  const key = `b:${color}:${roughness}:${metalness}`;
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
  m.emissive = new THREE.Color(color);
  m.emissiveIntensity = 0.04;
  matCache.set(key, m);
  return m;
}

function glowMat(color, opacity = 1) {
  const key = `g:${color}:${opacity}`;
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity });
  matCache.set(key, m);
  return m;
}
export function createCharacterModel(mainColor, lightColor, darkColor) {
  const group = new THREE.Group();

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.015;
  group.add(shadow);

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.38, 24, 18),
    bodyMat(mainColor)
  );
  body.scale.set(1.08, 1.22, 0.95);
  body.position.set(0, 0.76, 0.04);
  body.castShadow = true;
  group.add(body);

  const belly = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 16, 14),
    bodyMat(darkColor, 0.75)
  );
  belly.position.set(0, 0.66, 0.22);
  belly.castShadow = true;
  group.add(belly);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 24, 20),
    bodyMat(lightColor, 0.6)
  );
  head.position.set(0, 1.44, 0.06);
  head.castShadow = true;
  group.add(head);

  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 16, 12),
    bodyMat(darkColor, 0.7)
  );
  hair.scale.set(1.1, 0.65, 1.05);
  hair.position.set(0, 1.58, -0.02);
  group.add(hair);

  const cheekL = new THREE.Mesh(
    new THREE.SphereGeometry(0.065, 12, 10),
    bodyMat(mainColor, 0.72)
  );
  cheekL.position.set(-0.13, 1.38, 0.22);
  group.add(cheekL);
  const cheekR = cheekL.clone();
  cheekR.position.x = 0.13;
  group.add(cheekR);

  const leftLeg = new THREE.Group();
  const leftFoot = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 14, 12),
    bodyMat(darkColor, 0.78)
  );
  leftFoot.scale.set(1.1, 0.9, 1.25);
  leftFoot.castShadow = true;
  leftLeg.add(leftFoot);
  leftLeg.position.set(-0.2, 0.15, 0.04);
  group.add(leftLeg);

  const rightLeg = new THREE.Group();
  const rightFoot = leftFoot.clone();
  rightFoot.castShadow = true;
  rightLeg.add(rightFoot);
  rightLeg.position.set(0.2, 0.15, 0.04);
  group.add(rightLeg);

  const leftArm = new THREE.Group();
  const leftHand = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 14, 12),
    bodyMat(mainColor, 0.72)
  );
  leftHand.scale.set(1, 1.5, 1);
  leftHand.castShadow = true;
  leftArm.add(leftHand);
  leftArm.position.set(-0.46, 0.94, 0.1);
  group.add(leftArm);

  const rightArm = new THREE.Group();
  const rightHand = leftHand.clone();
  rightHand.castShadow = true;
  rightArm.add(rightHand);
  rightArm.position.set(0.46, 0.94, 0.1);
  group.add(rightArm);

  const weaponHolder = new THREE.Group();
  weaponHolder.position.set(0.34, 1.06, 0.28);
  group.add(weaponHolder);

  const inner = 0.54;
  const outer = 0.74;
  const hpTrack = new THREE.Mesh(
    new THREE.RingGeometry(inner, outer, 48),
    glowMat(darkColor, 0.45)
  );
  hpTrack.rotation.x = -Math.PI / 2;
  hpTrack.position.y = 0.02;
  group.add(hpTrack);

  const hpFill = new THREE.Mesh(
    new THREE.RingGeometry(inner, outer, 48, 1, Math.PI / 2, Math.PI * 2),
    glowMat(mainColor, 0.95)
  );
  hpFill.rotation.x = -Math.PI / 2;
  hpFill.position.y = 0.035;
  group.add(hpFill);

  group.userData.parts = {
    body, head, hair, belly, shadow,
    leftLeg, rightLeg, leftArm, rightArm, weaponHolder,
    hpTrack, hpFill, hpInner: inner, hpOuter: outer,
  };

  return group;
}

function createPistolModel() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.26), bodyMat(COLORS.pistol, 0.45, 0.35)));
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.035, 0.16, 10),
    bodyMat(COLORS.pistolAccent, 0.35, 0.5)
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, 0.18);
  g.add(barrel);
  const grip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), bodyMat(COLORS.pistol, 0.5, 0.3));
  grip.scale.set(0.8, 1.4, 0.9);
  grip.position.set(0, -0.1, -0.04);
  g.add(grip);
  g.rotation.y = Math.PI / 2;
  g.userData.barrel = barrel;
  return g;
}

function createBowModel() {
  const g = new THREE.Group();
  const curve = new THREE.Mesh(
    new THREE.TorusGeometry(0.26, 0.028, 12, 20, Math.PI * 1.05),
    bodyMat(COLORS.bow, 0.7, 0.08)
  );
  curve.rotation.y = Math.PI / 2;
  curve.rotation.z = Math.PI / 2;
  g.add(curve);
  const stringGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0.26, 0),
    new THREE.Vector3(0, -0.26, 0),
  ]);
  g.add(new THREE.Line(stringGeo, new THREE.LineBasicMaterial({ color: COLORS.bowString })));
  g.rotation.y = Math.PI / 2;
  return g;
}

function createKatanaModel() {
  const g = new THREE.Group();
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.035, 0.035, 0.62),
    bodyMat(COLORS.katanaBlade, 0.25, 0.65)
  );
  blade.position.z = 0.26;
  g.add(blade);
  const guard = new THREE.Mesh(
    new THREE.TorusGeometry(0.07, 0.015, 10, 20),
    bodyMat(COLORS.katana, 0.4, 0.45)
  );
  guard.rotation.y = Math.PI / 2;
  guard.position.z = -0.04;
  g.add(guard);
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.16, 12),
    bodyMat(COLORS.katanaHandle, 0.8, 0.05)
  );
  handle.rotation.x = Math.PI / 2;
  handle.position.z = -0.13;
  g.add(handle);
  g.rotation.y = Math.PI / 2;
  return g;
}

export function createWeaponModel(type) {
  switch (type) {
    case WEAPON_TYPES.BOW: return createBowModel();
    case WEAPON_TYPES.KATANA: return createKatanaModel();
    default: return createPistolModel();
  }
}

export function createGroundWeaponModel(type) {
  const weapon = createWeaponModel(type);
  const accent = type === WEAPON_TYPES.PISTOL ? COLORS.pistolAccent
    : type === WEAPON_TYPES.BOW ? COLORS.bow : COLORS.katanaBlade;

  const group = new THREE.Group();
  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.38, 0.44, 0.1, 20),
    bodyMat(0xd0d6e2, 0.85, 0.08)
  );
  pedestal.position.y = 0.05;
  pedestal.castShadow = true;
  pedestal.receiveShadow = true;

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.46, 0.04, 12, 24),
    bodyMat(accent, 0.5, 0.25)
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.12;

  group.add(pedestal, ring);
  weapon.position.y = 0.42;
  weapon.scale.setScalar(1.15);
  group.add(weapon);
  group.userData.weaponMesh = weapon;
  return group;
}

export function createProjectileModel(type) {
  const g = new THREE.Group();
  if (type === WEAPON_TYPES.BOW) {
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 0.55, 10),
      bodyMat(0xc8a878, 0.8, 0.1)
    );
    shaft.rotation.x = Math.PI / 2;
    g.add(shaft);
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.035, 0.09, 10),
      bodyMat(0xb0b8c8, 0.3, 0.6)
    );
    tip.rotation.x = -Math.PI / 2;
    tip.position.z = 0.3;
    g.add(tip);
    return g;
  }
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 10), glowMat(0xfff4a8)));
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), glowMat(0xffa830, 0.55));
  g.add(glow);
  const trail = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.04, 0.35, 8),
    glowMat(0xffcc60, 0.7)
  );
  trail.rotation.x = Math.PI / 2;
  trail.position.z = -0.18;
  g.add(trail);
  return g;
}

export function createBulletTrail() {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.05, 0.5, 6),
    glowMat(0xffd070, 0.45)
  );
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}

export function createSlashEffect(color, arcHalf) {
  const inner = 0.38;
  const outer = 2.05;
  // После rotation.x = -π/2 мировая Z = -sin(θ); вперёд (+Z) соответствует θ = -π/2
  const thetaStart = -Math.PI / 2 - arcHalf;
  const thetaLen = arcHalf * 2;
  const arcGeo = new THREE.RingGeometry(inner, outer, 28, 1, thetaStart, thetaLen);

  const group = new THREE.Group();
  const fill = new THREE.Mesh(
    arcGeo,
    new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.58,
      side: THREE.DoubleSide, depthWrite: false,
    })
  );
  fill.rotation.x = -Math.PI / 2;
  group.add(fill);

  const rim = new THREE.Mesh(
    new THREE.RingGeometry(outer - 0.03, outer + 0.05, 28, 1, thetaStart, thetaLen),
    new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.32,
      side: THREE.DoubleSide, depthWrite: false,
    })
  );
  rim.rotation.x = -Math.PI / 2;
  group.add(rim);

  group.userData.fill = fill;
  group.userData.rim = rim;
  return group;
}

export function placeSlashEffect(group, x, z, rotation) {
  group.position.set(x, 0.42, z);
  group.rotation.set(0, rotation, 0);
}
export function createMuzzleFlash() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), glowMat(0xfff8c0)));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 10), glowMat(0xff9020, 0.55)));
  const streak = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.08, 0.4, 8),
    glowMat(0xffe080)
  );
  streak.rotation.x = Math.PI / 2;
  streak.position.z = 0.15;
  g.add(streak);
  g.userData.streak = streak;
  return g;
}

export function createShellCasing() {
  return new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.06, 8),
    bodyMat(0xd4a840, 0.6, 0.4)
  );
}

export function createLaserSight() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(
    geo,
    new THREE.LineBasicMaterial({ color: LASER_COLOR_GREEN, transparent: true, opacity: 0.9 })
  );
  line.frustumCulled = false;

  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 10, 10),
    glowMat(LASER_COLOR_GREEN, 0.92)
  );
  dot.visible = false;

  const group = new THREE.Group();
  group.add(line, dot);
  group.userData.line = line;
  group.userData.dot = dot;
  return group;
}

export function updateLaserSight(laserGroup, ox, oz, dist, dx, dz, hitType) {
  const color =
    hitType === "enemy" ? LASER_COLOR_RED
      : hitType === "weapon" ? LASER_COLOR_YELLOW
        : LASER_COLOR_GREEN;

  const y = LASER_HEIGHT;
  const startOff = 0.45;
  const line = laserGroup.userData.line;
  const dot = laserGroup.userData.dot;
  const pos = line.geometry.attributes.position.array;

  pos[0] = ox + dx * startOff;
  pos[1] = y;
  pos[2] = oz + dz * startOff;
  pos[3] = ox + dx * dist;
  pos[4] = y;
  pos[5] = oz + dz * dist;
  line.geometry.attributes.position.needsUpdate = true;
  line.material.color.setHex(color);

  dot.visible = dist > 0.5;
  dot.position.set(pos[3], y, pos[5]);
  dot.material.color.setHex(color);
}

const FOV_MAX_VERTS = 36;
const FOV_MAX_TRIS = (FOV_MAX_VERTS - 2) * 3;

export function createFovMesh(color) {
  const fillMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const fillPos = new Float32Array(FOV_MAX_VERTS * 3);
  const fillIdx = new Uint16Array(FOV_MAX_TRIS);
  const fillGeo = new THREE.BufferGeometry();
  fillGeo.setAttribute("position", new THREE.BufferAttribute(fillPos, 3));
  fillGeo.setIndex(new THREE.BufferAttribute(fillIdx, 1));
  const fill = new THREE.Mesh(fillGeo, fillMat);
  fill.frustumCulled = false;
  fill.renderOrder = 2;

  const edgePos = new Float32Array(FOV_MAX_VERTS * 3);
  const edgeGeo = new THREE.BufferGeometry();
  edgeGeo.setAttribute("position", new THREE.BufferAttribute(edgePos, 3));
  const edge = new THREE.Line(
    edgeGeo,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.4 })
  );
  edge.frustumCulled = false;

  const group = new THREE.Group();
  group.add(fill, edge);
  group.userData.fill = fill;
  group.userData.edge = edge;
  return group;
}

export function updateFovMesh(fovGroup, localPoints, worldX, worldZ, worldRotation) {
  if (!fovGroup?.userData?.fill) return;

  fovGroup.position.set(worldX, 0, worldZ);
  fovGroup.rotation.y = worldRotation;

  const n = localPoints.length;
  if (n < 3) return;

  const fill = fovGroup.userData.fill;
  const edge = fovGroup.userData.edge;
  const fillPos = fill.geometry.attributes.position;
  const edgePos = edge.geometry.attributes.position;
  const indexAttr = fill.geometry.getIndex();
  if (!fillPos?.array || !edgePos?.array || !indexAttr?.array) return;

  const y = 0.05;
  const vertCount = Math.min(n, FOV_MAX_VERTS);

  for (let i = 0; i < vertCount; i++) {
    fillPos.setXYZ(i, localPoints[i].x, y, localPoints[i].z);
    edgePos.setXYZ(i, localPoints[i].x, y + 0.01, localPoints[i].z);
  }
  fillPos.needsUpdate = true;
  edgePos.needsUpdate = true;

  const idx = indexAttr.array;
  let triVerts = 0;
  for (let i = 1; i < vertCount - 1; i++) {
    idx[triVerts++] = 0;
    idx[triVerts++] = i;
    idx[triVerts++] = i + 1;
  }
  indexAttr.needsUpdate = true;
  fill.geometry.setDrawRange(0, triVerts);
  edge.geometry.setDrawRange(0, vertCount);
}