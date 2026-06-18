/** Client visual constants; physics and simulation — in shared/config.js */
export {
  MAP_SIZE,
  CELL_SIZE,
  MAP_WORLD_SIZE,
  WALL_HEIGHT,
  WALL_THICKNESS,
  WALL_EDGE_WIDTH,
  FPS_FOV_DEG,
  VISION_RANGE,
  MATCH_TIMEOUT,
  WEAPON_TYPES,
  WEAPON_CONFIG,
  WORLD_SEED,
  PLAYER_RADIUS,
  PICKUP_RADIUS,
  WEAPON_HIT_RADIUS,
  MOVE_SPEED,
  TURN_SPEED,
  PLAYER_MAX_HP,
} from "../shared/config.js";

export const FPS_EYE_HEIGHT = 1.32;
export const LASER_HEIGHT = 1.06;
export const RESTART_DELAY = 1.4;

export const COLORS = {
  floor: 0xe8ecf4,
  floorAlt: 0xd4dae6,
  floorGrid: 0xa8b0c0,
  floorPit: 0x8a92a4,
  wall: 0xb8c2d0,
  wallTop: 0xd0d8e4,
  wallEdge: 0x909aa8,
  bluePlayer: 0x6ab4f0,
  bluePlayerLight: 0xa8d4ff,
  bluePlayerDark: 0x3a78c8,
  redPlayer: 0xf08080,
  redPlayerLight: 0xffb0b0,
  redPlayerDark: 0xc85050,
  pistol: 0x5a6270,
  pistolAccent: 0x8890a0,
  bow: 0xc8a070,
  bowString: 0xe8e0d0,
  katana: 0xb0b8c8,
  katanaBlade: 0xd8e8ff,
  katanaHandle: 0x8a6040,
};

export const LASER_COLOR_GREEN = 0x42ff72;
export const LASER_COLOR_RED = 0xff4455;
export const LASER_COLOR_YELLOW = 0xffd24a;
