/** Apple-inspired Chart.js theme for the brain panel */

export const BRAIN_THEME = {
  blue: "rgb(90, 148, 189)",
  blueLight: "rgb(126, 181, 220)",
  blueFill: "rgba(126, 181, 220, 0.35)",
  red: "rgb(194, 120, 120)",
  redLight: "rgb(224, 149, 149)",
  redFill: "rgba(224, 149, 149, 0.35)",
  green: "rgb(123, 196, 154)",
  orange: "rgb(232, 190, 122)",
  grid: "rgba(60, 60, 67, 0.1)",
  gridLight: "rgba(60, 60, 67, 0.05)",
  gridOuter: "rgba(60, 60, 67, 0.16)",
  text: "#636366",
  textDark: "#1d1d1f",
  textMuted: "#8e8e93",
  bg: "#fcfcfd",
  font: '"IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

/** 6 осей радара — агрегаты 28 входов (читаемо, как в демо Chart.js) */
export const OBS_GROUPS = [
  { label: "Позиция", indices: [0, 1, 2, 3] },
  { label: "Статус", indices: [4, 5, 6, 7] },
  { label: "Враг", indices: [8, 9, 10, 11, 12] },
  { label: "Оружие", indices: [13, 14, 15, 16, 17] },
  { label: "Луч", indices: [18, 19] },
  { label: "Стены", indices: [20, 21, 22, 23, 24, 25, 26, 27] },
];

export function normObsValue(v) {
  const n = Number(v) || 0;
  return Math.max(0, Math.min(1, (n + 1) / 2));
}

export function aggregateObsGroups(observations) {
  const obs = observations ?? [];
  return OBS_GROUPS.map((g) => {
    const vals = g.indices.map((i) => normObsValue(obs[i]));
    return vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
  });
}

export function palette(side) {
  return side === "red"
    ? {
        stroke: BRAIN_THEME.red,
        strokeLight: BRAIN_THEME.redLight,
        fill: BRAIN_THEME.redFill,
        soft: "rgba(224, 149, 149, 0.65)",
        softMuted: "rgba(224, 149, 149, 0.28)",
        gradInner: "rgba(224, 149, 149, 0.55)",
        gradMid: "rgba(224, 149, 149, 0.22)",
        gradOuter: "rgba(224, 149, 149, 0.02)",
      }
    : {
        stroke: BRAIN_THEME.blue,
        strokeLight: BRAIN_THEME.blueLight,
        fill: BRAIN_THEME.blueFill,
        soft: "rgba(126, 181, 220, 0.65)",
        softMuted: "rgba(126, 181, 220, 0.28)",
        gradInner: "rgba(126, 181, 220, 0.55)",
        gradMid: "rgba(126, 181, 220, 0.22)",
        gradOuter: "rgba(126, 181, 220, 0.02)",
      };
}

export function createRadarGradient(chart, side) {
  const { ctx, chartArea } = chart;
  if (!chartArea) return palette(side).fill;

  const cx = (chartArea.left + chartArea.right) / 2;
  const cy = (chartArea.top + chartArea.bottom) / 2;
  const r = Math.min(chartArea.width, chartArea.height) / 2;
  const c = palette(side);

  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, c.gradInner);
  g.addColorStop(0.55, c.gradMid);
  g.addColorStop(1, c.gradOuter);
  return g;
}

function font(size = 11, weight = "400") {
  return { family: BRAIN_THEME.font, size, weight };
}

export function appleTooltip() {
  return {
    backgroundColor: "rgba(255, 255, 255, 0.98)",
    titleColor: BRAIN_THEME.textDark,
    bodyColor: BRAIN_THEME.text,
    borderColor: "rgba(60, 60, 67, 0.12)",
    borderWidth: 1,
    padding: 14,
    cornerRadius: 12,
    titleFont: font(13, "600"),
    bodyFont: font(12),
    footerFont: font(11),
    displayColors: true,
    boxPadding: 8,
    caretSize: 8,
    caretPadding: 6,
  };
}

export function baseChartOptions(extra = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 480,
      easing: "easeOutQuart",
    },
    layout: { padding: { top: 4, right: 12, bottom: 4, left: 12 } },
    plugins: {
      legend: { display: false },
      tooltip: appleTooltip(),
    },
    ...extra,
  };
}

export function radarScaleOptions() {
  return {
    min: 0,
    max: 1,
    beginAtZero: true,
    ticks: {
      stepSize: 0.25,
      display: true,
      backdropColor: "transparent",
      color: BRAIN_THEME.textMuted,
      font: font(10),
      showLabelBackdrop: false,
      z: 1,
      callback: (v) => (v === 0 || v === 1 ? Number(v).toFixed(1) : ""),
    },
    grid: {
      circular: true,
      color: (ctx) => (ctx.index === 4 ? BRAIN_THEME.gridOuter : BRAIN_THEME.gridLight),
      lineWidth: (ctx) => (ctx.index === 4 ? 1.25 : 1),
    },
    angleLines: {
      color: BRAIN_THEME.grid,
      lineWidth: 1,
    },
    pointLabels: {
      font: font(12, "600"),
      color: BRAIN_THEME.textDark,
      padding: 16,
      centerPointLabels: true,
    },
  };
}

export function weightColor(value, max) {
  if (max <= 0) return "rgba(60, 60, 67, 0.06)";
  const t = value / max;
  const a = 0.18 + Math.abs(t) * 0.75;
  if (t >= 0) return `rgba(90, 148, 189, ${a})`;
  return `rgba(194, 120, 120, ${a})`;
}

export function weightColorNeutral() {
  return "rgba(60, 60, 67, 0.04)";
}

export function activationColor(value) {
  const t = Math.max(-1, Math.min(1, value));
  if (t >= 0) return `rgba(126, 181, 220, ${0.16 + t * 0.72})`;
  return `rgba(224, 149, 149, ${0.16 + Math.abs(t) * 0.72})`;
}
