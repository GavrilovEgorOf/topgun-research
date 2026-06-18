import {
  DRAW_PENALTY_BASE,
  DRAW_ESCALATE_FROM_SEC,
  DRAW_ESCALATE_PER_SEC,
  KILL_TIME_BONUS_BASE,
  EXPLORATION_CELL_BONUS,
  EXPLORATION_APPROACH_BONUS,
  PICKUP_REWARD,
  DAMAGE_REWARD,
  WEAPON_SIGHT_BONUS,
  WALL_GRIND_PENALTY,
  CORNER_CAMP_PENALTY,
  STAGNATION_PENALTY,
  MOVE_REWARD_PER_UNIT,
  MATCH_TIMEOUT,
  ES_POPULATION,
  ES_ELITE,
  ES_MUTATION,
  NN_INPUT,
  NN_OUTPUT,
  NN_HIDDEN,
} from "./config.js";
import { computeDrawPenalty } from "./combat.js";

export const KILL_WIN_BASE = 12;
export const KILL_LOSS_PENALTY = 12;
export const KILL_SPEED_MULTIPLIER = 2;

/** Full fitness function description for the research UI */
export const FITNESS_MODEL = {
  timeout: {
    label: "Draw (20 s timeout)",
    value: computeDrawPenalty(MATCH_TIMEOUT),
    per: "both agents",
    note: `Escalates over time: ${DRAW_PENALTY_BASE} + ${DRAW_ESCALATE_PER_SEC}/s after ${DRAW_ESCALATE_FROM_SEC} s`,
  },
  pickup: {
    label: "Weapon pickup",
    value: PICKUP_REWARD,
    per: "agent",
    note: "Once per match if any weapon was picked up",
  },
  damage: {
    label: "Damage dealt",
    value: DAMAGE_REWARD,
    per: "1 HP",
    note: "Per HP of damage dealt to the opponent",
  },
  explorationCell: {
    label: "New map cell",
    value: EXPLORATION_CELL_BONUS,
    per: "cell",
    note: "First visit to a cell on the 12×12 grid",
  },
  explorationApproach: {
    label: "Approaching weapon",
    value: EXPLORATION_APPROACH_BONUS,
    per: "distance unit",
    note: "Only when unarmed and weapon is visible (FOV+LOS); bonus for reducing distance per step",
  },
  weaponSight: {
    label: "Weapon spotted",
    value: WEAPON_SIGHT_BONUS,
    per: "agent",
    note: "Saw a weapon at least once in FOV with line of sight",
  },
  killWin: {
    label: "Win (kill)",
    value: KILL_WIN_BASE,
    per: "winner",
    note: `Plus speed bonus: (${KILL_TIME_BONUS_BASE} − t_kill) × ${KILL_SPEED_MULTIPLIER}`,
  },
  killLoss: {
    label: "Loss (death)",
    value: -KILL_LOSS_PENALTY,
    per: "loser",
    note: "When the opponent reduced HP to 0",
  },
  wallGrind: {
    label: "Wall grind",
    value: -WALL_GRIND_PENALTY,
    per: "frame",
    note: "Moving forward + wall close + almost no displacement",
  },
  cornerCamp: {
    label: "Corner camping",
    value: -CORNER_CAMP_PENALTY,
    per: "frame",
    note: "2+ nearby walls ahead and no movement",
  },
  stagnation: {
    label: "Inactivity",
    value: -STAGNATION_PENALTY,
    per: "frame",
    note: "Near-zero displacement per step",
  },
  movement: {
    label: "Movement",
    value: MOVE_REWARD_PER_UNIT,
    per: "path unit",
    note: "Small bonus for active movement across the map",
  },
};

export function describeFitnessExample({ time, winner, stats, reason }) {
  const speedBonus = KILL_TIME_BONUS_BASE - time;
  const lines = [];

  if (stats?.bluePickup) lines.push({ side: "blue", key: "pickup", amount: PICKUP_REWARD });
  if (stats?.redPickup) lines.push({ side: "red", key: "pickup", amount: PICKUP_REWARD });
  if (stats?.blueDamage) lines.push({ side: "blue", key: "damage", amount: stats.blueDamage * DAMAGE_REWARD });
  if (stats?.redDamage) lines.push({ side: "red", key: "damage", amount: stats.redDamage * DAMAGE_REWARD });
  if (stats?.blueNewCells) lines.push({ side: "blue", key: "explorationCell", amount: stats.blueNewCells * EXPLORATION_CELL_BONUS });
  if (stats?.redNewCells) lines.push({ side: "red", key: "explorationCell", amount: stats.redNewCells * EXPLORATION_CELL_BONUS });
  if (stats?.blueWeaponApproach) {
    lines.push({ side: "blue", key: "explorationApproach", amount: stats.blueWeaponApproach });
  }
  if (stats?.redWeaponApproach) {
    lines.push({ side: "red", key: "explorationApproach", amount: stats.redWeaponApproach });
  }
  if (stats?.blueSawWeapon) lines.push({ side: "blue", key: "weaponSight", amount: WEAPON_SIGHT_BONUS });
  if (stats?.redSawWeapon) lines.push({ side: "red", key: "weaponSight", amount: WEAPON_SIGHT_BONUS });

  if (reason === "kill" && winner === "blue") {
    lines.push({ side: "blue", key: "killWin", amount: KILL_WIN_BASE + speedBonus * KILL_SPEED_MULTIPLIER });
    lines.push({ side: "red", key: "killLoss", amount: -KILL_LOSS_PENALTY });
  } else if (reason === "kill" && winner === "red") {
    lines.push({ side: "red", key: "killWin", amount: KILL_WIN_BASE + speedBonus * KILL_SPEED_MULTIPLIER });
    lines.push({ side: "blue", key: "killLoss", amount: -KILL_LOSS_PENALTY });
  } else if (reason === "timeout") {
    const drawPen = computeDrawPenalty(time ?? MATCH_TIMEOUT);
    lines.push({ side: "blue", key: "timeout", amount: drawPen });
    lines.push({ side: "red", key: "timeout", amount: drawPen });
  }

  return lines;
}

export function getRewardsPayload() {
  return {
    matchTimeoutSec: MATCH_TIMEOUT,
    model: FITNESS_MODEL,
    architecture: {
      input: NN_INPUT,
      hidden: NN_HIDDEN,
      output: NN_OUTPUT,
      population: ES_POPULATION,
      elite: ES_ELITE,
      mutation: ES_MUTATION,
    },
  };
}
