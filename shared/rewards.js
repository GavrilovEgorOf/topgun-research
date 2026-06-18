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

/** Полное описание функции приспособленности для исследования */
export const FITNESS_MODEL = {
  timeout: {
    label: "Ничья (таймаут 20 с)",
    value: computeDrawPenalty(MATCH_TIMEOUT),
    per: "оба агента",
    note: `Растёт со временем: ${DRAW_PENALTY_BASE} + ${DRAW_ESCALATE_PER_SEC}/с после ${DRAW_ESCALATE_FROM_SEC} с`,
  },
  pickup: {
    label: "Подбор оружия",
    value: PICKUP_REWARD,
    per: "агент",
    note: "Один раз за матч, если подобрал любое оружие",
  },
  damage: {
    label: "Нанесённый урон",
    value: DAMAGE_REWARD,
    per: "1 HP",
    note: "За каждую единицу урона по противнику",
  },
  explorationCell: {
    label: "Новая клетка карты",
    value: EXPLORATION_CELL_BONUS,
    per: "клетка",
    note: "За первое посещение клетки 12×12",
  },
  explorationApproach: {
    label: "Сближение с оружием",
    value: EXPLORATION_APPROACH_BONUS,
    per: "единицу расстояния",
    note: "Только без оружия и если оружие видно (FOV+LOS); бонус за уменьшение дистанции за шаг",
  },
  weaponSight: {
    label: "Обнаружение оружия",
    value: WEAPON_SIGHT_BONUS,
    per: "агент",
    note: "Хотя бы раз увидел оружие в конусе обзора с прямой видимостью",
  },
  killWin: {
    label: "Победа (убийство)",
    value: KILL_WIN_BASE,
    per: "победитель",
    note: `Плюс бонус скорости: (${KILL_TIME_BONUS_BASE} − t_убийства) × ${KILL_SPEED_MULTIPLIER}`,
  },
  killLoss: {
    label: "Поражение (смерть)",
    value: -KILL_LOSS_PENALTY,
    per: "проигравший",
    note: "Когда противник довёл HP до 0",
  },
  wallGrind: {
    label: "Упор в стену",
    value: -WALL_GRIND_PENALTY,
    per: "кадр",
    note: "Вперёд + стена близко + почти нет смещения",
  },
  cornerCamp: {
    label: "Залипание в углу",
    value: -CORNER_CAMP_PENALTY,
    per: "кадр",
    note: "2+ близких стены впереди и нет движения",
  },
  stagnation: {
    label: "Бездействие",
    value: -STAGNATION_PENALTY,
    per: "кадр",
    note: "Почти нулевое смещение за шаг",
  },
  movement: {
    label: "Перемещение",
    value: MOVE_REWARD_PER_UNIT,
    per: "единицу пути",
    note: "Небольшой бонус за активное движение по карте",
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
