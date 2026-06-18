/** Global simulation constants — single source of truth for server, workers, and UI. */
export const MAP_SIZE = 12;
export const CELL_SIZE = 4;
export const MAP_WORLD_SIZE = MAP_SIZE * CELL_SIZE;
export const WALL_HEIGHT = 3.2;
export const WALL_THICKNESS = 0.62;
export const WALL_EDGE_WIDTH = 0.58;
export const PLAYER_RADIUS = 0.55;
export const PICKUP_RADIUS = 1.55;
export const WEAPON_HIT_RADIUS = 0.65;
export const MOVE_SPEED = 7;
export const TURN_SPEED = 2.75;
export const PLAYER_MAX_HP = 3;
export const VISION_RANGE = 26;
export const FPS_FOV_DEG = 72;
export const MATCH_TIMEOUT = 20;
export const WORLD_SEED = 42;
export const FIXED_DT = 1 / 60;
export const REPLAY_FRAME_INTERVAL = 3;

export const WEAPON_TYPES = {
  PISTOL: "pistol",
  BOW: "bow",
  KATANA: "katana",
};

export const WEAPON_CONFIG = {
  [WEAPON_TYPES.PISTOL]: {
    range: 28,
    cooldown: 0.45,
    projectileSpeed: 38,
    damage: 1,
    spread: 0.02,
  },
  [WEAPON_TYPES.BOW]: {
    range: 32,
    cooldown: 0.7,
    projectileSpeed: 30,
    damage: 1,
    spread: 0.01,
  },
  [WEAPON_TYPES.KATANA]: {
    range: 2.2,
    arcHalf: Math.PI * 0.42,
    cooldown: 0.55,
    projectileSpeed: 0,
    damage: 1,
    spread: 0,
  },
};

export const WEAPON_INDEX = {
  none: 0,
  pistol: 1,
  bow: 2,
  katana: 3,
};

export const OBS_SIZE = 28;
export const NN_INPUT = OBS_SIZE;
export const NN_OUTPUT = 5;
export const NN_HIDDEN = [40, 32];

export const ES_POPULATION = 48;
export const ES_ELITE = 8;
export const ES_MUTATION = 0.12;
export const ES_MUTATION_DECAY = 0.995;
export const ES_MIN_MUTATION = 0.03;

export const DRAW_PENALTY = -8;
/** Draw penalty base at timeout; escalates after DRAW_ESCALATE_FROM_SEC */
export const DRAW_PENALTY_BASE = -5;
export const DRAW_ESCALATE_FROM_SEC = 8;
export const DRAW_ESCALATE_PER_SEC = 0.7;

/** Anti-passivity: wall grind, corner camping, inactivity */
export const WALL_GRIND_PENALTY = 0.035;
export const CORNER_CAMP_PENALTY = 0.045;
export const STAGNATION_PENALTY = 0.025;
export const STAGNATION_MOVE_EPS = 0.045;
export const WALL_CLOSE_NORM = 0.2;
export const CORNER_WALL_CLOSE_NORM = 0.22;
export const MOVE_REWARD_PER_UNIT = 0.012;
export const MOVE_REWARD_CAP = 1.2;
export const KILL_TIME_BONUS_BASE = 20;
export const EXPLORATION_CELL_BONUS = 0.08;
export const EXPLORATION_APPROACH_BONUS = 0.04;
export const PICKUP_REWARD = 3;
export const WEAPON_SIGHT_BONUS = 0.5;
export const DAMAGE_REWARD = 2.5;
export const SHOOT_THRESHOLD = 0.35;
export const HISTORY_MAX = 300;

/** Generations with doubled exploration bonus after visibility rule change */
export const BLIND_TRAINING_GENS = 10;
export const BLIND_EXPLORATION_MULT = 2;

/** Auto-save weights every N generations */
export const CHECKPOINT_EVERY_GENS = 25;
export const CHECKPOINT_MAX = 20;

/** Asymmetric mutation when one side dominates */
export const DOMINANCE_WIN_THRESHOLD = 0.6;
export const DOMINANCE_MUTATION_BOOST = 1.5;
export const DOMINANCE_MUTATION_CAP = 0.22;
