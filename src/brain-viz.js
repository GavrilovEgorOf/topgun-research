import { Chart, registerables } from "chart.js";
import { MatrixController, MatrixElement } from "chartjs-chart-matrix";
import { OBS_LABELS, OUTPUT_LABELS } from "../shared/obs-labels.js";
import { SHOOT_THRESHOLD } from "../shared/config.js";
import {
  BRAIN_THEME,
  OBS_GROUPS,
  aggregateObsGroups,
  activationColor,
  appleTooltip,
  baseChartOptions,
  createRadarGradient,
  normObsValue,
  palette,
  radarScaleOptions,
  weightColor,
  weightColorNeutral,
} from "./brain-charts-theme.js";

Chart.register(...registerables, MatrixController, MatrixElement);

const MOVE_THRESHOLD = 0.35;
const OUTPUT_THRESHOLDS = [
  MOVE_THRESHOLD,
  MOVE_THRESHOLD,
  MOVE_THRESHOLD,
  MOVE_THRESHOLD,
  SHOOT_THRESHOLD,
];

function font(size = 11, weight = "400") {
  return { family: BRAIN_THEME.font, size, weight };
}

export function initBrainPanel(root) {
  const state = {
    side: "blue",
    layerIndex: 0,
    lastData: null,
  };

  const sideBtns = root.querySelectorAll("[data-brain-side]");
  sideBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      state.side = btn.dataset.brainSide;
      sideBtns.forEach((b) => b.classList.toggle("active", b === btn));
      window.dispatchEvent(new CustomEvent("brain-side", { detail: { side: state.side } }));
      applySideColors();
      drawAll();
    });
  });

  const layerSelect = root.querySelector("#brain-layer-select");
  layerSelect?.addEventListener("change", () => {
    state.layerIndex = Number(layerSelect.value);
    updateHeatmap();
  });

  const heatmapMeta = root.querySelector("#brain-heatmap-meta");
  const statsPanel = root.querySelector("#brain-weight-stats");

  const charts = {
    obs: createRadarChart(root.querySelector("#brain-obs-chart")),
    outputs: createOutputChart(root.querySelector("#brain-output-chart")),
    activations: createActivationHeatmap(root.querySelector("#brain-act-chart")),
    heatmap: createWeightHeatmap(root.querySelector("#brain-heatmap")),
  };

  function applySideColors() {
    const colors = palette(state.side);
    if (charts.obs) {
      const ds = charts.obs.data.datasets[1];
      ds._side = state.side;
      ds.borderColor = colors.stroke;
      ds.pointBackgroundColor = colors.stroke;
      ds.pointHoverBackgroundColor = colors.strokeLight;
    }
    if (charts.outputs) {
      charts.outputs.$side = state.side;
      charts.outputs.data.datasets[0].borderColor = colors.stroke;
    }
    Object.values(charts).forEach((c) => c?.update("none"));
  }

  function drawAll() {
    if (!state.lastData) return;
    const agent = state.lastData[state.side];
    if (!agent) return;

    updateRadar(agent.observations);
    updateOutputs(agent.outputs);
    updateActivations(agent.activations);
    updateLayerSelect(layerSelect, agent.layers, state.layerIndex);
    updateHeatmapData(agent.layers[state.layerIndex]);

    const actionsEl = root.querySelector("#brain-actions-detail");
    if (actionsEl) actionsEl.textContent = agent.actionLabels ?? "—";

    renderWeightStatsPanel(statsPanel, {
      layers: agent.layers.map((l, i) => ({
        layer: i,
        in: l.inSize,
        out: l.outSize,
        meanAbs: l.weightStats?.meanAbs,
        rms: l.weightStats?.rms,
        maxAbs: l.weightStats?.maxAbs,
      })),
    });
  }

  function updateRadar(observations) {
    const chart = charts.obs;
    if (!chart) return;
    chart.$observations = observations ?? [];
    chart.data.datasets[1].data = aggregateObsGroups(observations);
    chart.update("active");
  }

  function updateOutputs(outputs) {
    const chart = charts.outputs;
    if (!chart || !outputs?.length) return;
    chart.data.datasets[0].data = outputs.map((v) => Math.max(0, Math.min(1, Number(v) || 0)));
    chart.data.datasets[1].data = OUTPUT_THRESHOLDS.slice(0, outputs.length);
    chart.update("active");
  }

  function updateActivations(activations) {
    const chart = charts.activations;
    if (!chart || !activations?.length) return;
    const hidden = activations.slice(1, -1);
    if (!hidden.length) {
      chart.data.datasets[0].data = [];
      chart.update("none");
      return;
    }
    const cols = Math.max(...hidden.map((l) => l.length));
    const rows = hidden.length;
    chart.options.scales.x.max = cols;
    chart.options.scales.y.max = rows;
    chart.data.datasets[0].data = buildMatrixCells(hidden, (v) => v);
    chart.data.datasets[0]._matrixRows = rows;
    chart.data.datasets[0]._matrixCols = cols;
    chart.update("none");
  }

  function updateHeatmap() {
    if (!state.lastData) return;
    const agent = state.lastData[state.side];
    if (!agent) return;
    updateHeatmapData(agent.layers[state.layerIndex]);
  }

  function updateHeatmapData(layer) {
    const chart = charts.heatmap;
    if (!chart) return;
    if (!layer?.weights?.length) {
      chart.data.datasets[0].data = [];
      if (heatmapMeta) {
        heatmapMeta.innerHTML = `<span class="heatmap-meta-item">No layer data</span>`;
      }
      chart.update("active");
      return;
    }
    const rows = layer.outSize;
    const cols = layer.inSize;
    chart.options.scales.x.max = cols;
    chart.options.scales.y.max = rows;
    const cells = [];
    let absMax = 0;
    for (const w of layer.weights) {
      const a = Math.abs(w);
      if (a > absMax) absMax = a;
    }
    if (absMax < 1e-6) absMax = 1;
    chart.data.datasets[0]._weightMax = absMax;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        cells.push({
          x: c,
          y: r,
          v: layer.weights[r * cols + c],
        });
      }
    }
    chart.data.datasets[0].data = cells;
    chart.data.datasets[0]._matrixRows = rows;
    chart.data.datasets[0]._matrixCols = cols;
    if (heatmapMeta) {
      heatmapMeta.innerHTML = `
        <span class="heatmap-meta-item"><strong>${cols} × ${rows}</strong> matrix</span>
        <span class="heatmap-meta-item">|w|<sub>max</sub> ${absMax.toFixed(3)}</span>
        <span class="heatmap-meta-item">${layer.weights.length.toLocaleString("en")} weights</span>
      `;
    }
    chart.update("active");
  }

  function resize() {
    Object.values(charts).forEach((c) => c?.resize());
  }

  window.addEventListener("resize", resize);

  applySideColors();

  return {
    update(brainPacket) {
      state.lastData = brainPacket;
      drawAll();
    },
    resize,
    get side() {
      return state.side;
    },
  };
}

function buildMatrixCells(layers, getValue) {
  const cells = [];
  layers.forEach((row, y) => {
    row.forEach((raw, x) => {
      cells.push({ x, y, v: getValue(raw) });
    });
  });
  return cells;
}

function matrixCellSize(chart, axis) {
  const ds = chart.data.datasets[0];
  const cols = ds._matrixCols || 1;
  const rows = ds._matrixRows || 1;
  const area = chart.chartArea;
  if (!area) return 8;
  const gap = 2;
  if (axis === "x") return Math.max(3, (area.width - gap * cols) / cols);
  return Math.max(3, (area.height - gap * rows) / rows);
}

function createRadarChart(canvas) {
  if (!canvas) return null;
  const colors = palette("blue");
  const labels = OBS_GROUPS.map((g) => g.label);
  const baseline = labels.map(() => 0.5);

  return new Chart(canvas, {
    type: "radar",
    data: {
      labels,
      datasets: [
        {
          label: "Baseline",
          data: baseline,
          borderColor: "rgba(60, 60, 67, 0.22)",
          backgroundColor: "rgba(60, 60, 67, 0.04)",
          borderWidth: 1.5,
          borderDash: [5, 4],
          pointRadius: 0,
          pointHitRadius: 0,
          fill: true,
          order: 2,
        },
        {
          label: "Observations",
          data: labels.map(() => 0),
          _side: "blue",
          borderColor: colors.stroke,
          backgroundColor: (ctx) =>
            createRadarGradient(ctx.chart, ctx.dataset._side || "blue"),
          borderWidth: 2.5,
          borderJoinStyle: "round",
          pointRadius: 5,
          pointBackgroundColor: colors.stroke,
          pointBorderColor: "#ffffff",
          pointBorderWidth: 2.5,
          pointHoverRadius: 8,
          pointHoverBorderColor: "#ffffff",
          pointHoverBorderWidth: 3,
          pointHoverBackgroundColor: colors.strokeLight,
          fill: true,
          order: 1,
        },
      ],
    },
    options: baseChartOptions({
      elements: {
        line: { tension: 0.15, borderCapStyle: "round", borderJoinStyle: "round" },
        point: { hoverBorderWidth: 3 },
      },
      scales: {
        r: radarScaleOptions(),
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...appleTooltip(),
          filter: (item) => item.datasetIndex === 1,
          callbacks: {
            title: (items) => OBS_GROUPS[items[0]?.dataIndex]?.label ?? "Observations",
            label: (ctx) => ` Intensity: ${(Number(ctx.raw) * 100).toFixed(0)}%`,
            afterBody: (items) => {
              const idx = items[0]?.dataIndex;
              const obs = items[0]?.chart?.$observations;
              if (idx == null || !obs?.length) return [];
              const g = OBS_GROUPS[idx];
              const lines = g.indices.map(
                (i) => `  ${OBS_LABELS[i]}: ${normObsValue(obs[i]).toFixed(2)}`
              );
              return ["", ...lines.slice(0, 5), ...(lines.length > 5 ? ["  …"] : [])];
            },
          },
        },
      },
    }),
  });
}

function createOutputChart(canvas) {
  if (!canvas) return null;
  const colors = palette("blue");
  const chart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: OUTPUT_LABELS,
      datasets: [
        {
          type: "bar",
          label: "Output",
          data: [],
          backgroundColor: (ctx) => {
            const v = Number(ctx.raw) || 0;
            const thr = OUTPUT_THRESHOLDS[ctx.dataIndex] ?? 0.35;
            const c = palette(ctx.chart.$side || "blue");
            return v >= thr ? c.soft : c.softMuted;
          },
          borderColor: colors.stroke,
          borderWidth: 0,
          borderRadius: 8,
          borderSkipped: false,
          barPercentage: 0.58,
          categoryPercentage: 0.72,
        },
        {
          type: "line",
          label: "Threshold",
          data: [],
          borderColor: BRAIN_THEME.orange,
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 0,
          pointHoverRadius: 0,
          fill: false,
          tension: 0.35,
        },
      ],
    },
    options: baseChartOptions({
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { font: font(11, "500"), color: BRAIN_THEME.textDark, maxRotation: 0 },
        },
        y: {
          min: 0,
          max: 1.05,
          grid: { color: BRAIN_THEME.gridLight, drawBorder: false },
          border: { display: false },
          ticks: {
            font: font(10),
            color: BRAIN_THEME.textMuted,
            stepSize: 0.25,
            callback: (v) => Number(v).toFixed(2),
          },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...appleTooltip(),
          filter: (item) => item.datasetIndex === 0,
          callbacks: {
            label: (ctx) => {
              const thr = OUTPUT_THRESHOLDS[ctx.dataIndex];
              const hit = ctx.raw >= thr ? "✓ active" : "below threshold";
              return ` ${ctx.raw.toFixed(3)} · ${hit}`;
            },
          },
        },
      },
    }),
  });
  chart.$side = "blue";
  return chart;
}

function createActivationHeatmap(canvas) {
  if (!canvas) return null;
  return new Chart(canvas, {
    type: "matrix",
    data: {
      datasets: [
        {
          label: "Activation",
          data: [],
          borderWidth: 0,
          borderRadius: 2,
          width: ({ chart }) => matrixCellSize(chart, "x"),
          height: ({ chart }) => matrixCellSize(chart, "y"),
          backgroundColor(ctx) {
            const v = ctx.dataset.data[ctx.dataIndex]?.v ?? 0;
            return activationColor(v);
          },
        },
      ],
    },
    options: baseChartOptions({
      scales: {
        x: {
          type: "linear",
          offset: false,
          min: 0,
          max: 40,
          display: true,
          position: "bottom",
          grid: { display: false },
          border: { display: false },
          ticks: {
            font: font(9),
            color: BRAIN_THEME.textMuted,
            stepSize: 10,
            callback: (v) => (Number.isInteger(v) ? v : ""),
          },
          title: {
            display: true,
            text: "Neuron",
            font: font(10, "500"),
            color: BRAIN_THEME.textMuted,
            padding: { top: 4 },
          },
        },
        y: {
          type: "linear",
          offset: false,
          min: 0,
          max: 2,
          reverse: true,
          display: true,
          grid: { display: false },
          border: { display: false },
          ticks: {
            font: font(10),
            color: BRAIN_THEME.textMuted,
            stepSize: 1,
            callback: (v) => {
              const n = Number(v);
              if (n === 0) return "Layer 1";
              if (n === 1) return "Layer 2";
              return "";
            },
          },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...appleTooltip(),
          callbacks: {
            title: (items) => {
              const p = items[0]?.raw;
              if (!p) return "";
              return `Layer ${p.y + 1} · neuron ${p.x}`;
            },
            label: (ctx) => ` ${Number(ctx.raw.v).toFixed(3)}`,
          },
        },
      },
    }),
  });
}

function createWeightHeatmap(canvas) {
  if (!canvas) return null;
  return new Chart(canvas, {
    type: "matrix",
    data: {
      datasets: [
        {
          label: "Weight",
          data: [],
          borderWidth: 0,
          borderRadius: 3,
          width: ({ chart }) => matrixCellSize(chart, "x") - 1.5,
          height: ({ chart }) => matrixCellSize(chart, "y") - 1.5,
          backgroundColor(ctx) {
            const pt = ctx.dataset.data[ctx.dataIndex];
            if (!pt) return weightColorNeutral();
            const max = ctx.dataset._weightMax || 1;
            return weightColor(pt.v, max);
          },
          hoverBackgroundColor(ctx) {
            const pt = ctx.dataset.data[ctx.dataIndex];
            if (!pt) return weightColorNeutral();
            const max = ctx.dataset._weightMax || 1;
            const t = pt.v / max;
            const a = 0.35 + Math.abs(t) * 0.6;
            return t >= 0 ? `rgba(90, 148, 189, ${a})` : `rgba(194, 120, 120, ${a})`;
          },
        },
      ],
    },
    options: baseChartOptions({
      layout: { padding: { top: 8, right: 10, bottom: 6, left: 6 } },
      scales: {
        x: {
          type: "linear",
          offset: false,
          min: 0,
          max: 28,
          display: true,
          grid: { display: false },
          border: { display: false },
          ticks: {
            font: font(10),
            color: BRAIN_THEME.textMuted,
            maxTicksLimit: 5,
            padding: 4,
          },
          title: {
            display: true,
            text: "Input neuron",
            font: font(11, "500"),
            color: BRAIN_THEME.text,
            padding: { top: 6 },
          },
        },
        y: {
          type: "linear",
          offset: false,
          min: 0,
          max: 40,
          reverse: true,
          display: true,
          grid: { display: false },
          border: { display: false },
          ticks: {
            font: font(10),
            color: BRAIN_THEME.textMuted,
            maxTicksLimit: 5,
            padding: 4,
          },
          title: {
            display: true,
            text: "Output neuron",
            font: font(11, "500"),
            color: BRAIN_THEME.text,
            padding: { bottom: 4 },
          },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...appleTooltip(),
          callbacks: {
            title: (items) => {
              const p = items[0]?.raw;
              if (!p) return "";
              return `Neuron ${p.y} ← input ${p.x}`;
            },
            label: (ctx) => {
              const max = ctx.dataset._weightMax || 1;
              const v = ctx.raw.v;
              const pct = max > 0 ? ((Math.abs(v) / max) * 100).toFixed(0) : 0;
              const sign = v >= 0 ? "+" : "";
              return ` ${sign}${v.toFixed(4)} (${pct}% of |max|)`;
            },
          },
        },
      },
    }),
  });
}

function pctOfMax(value, maxVal) {
  if (maxVal <= 0 || value == null) return 0;
  return Math.min(100, Math.max(4, (value / maxVal) * 100));
}

export function renderWeightStatsPanel(el, { arch, layers } = {}) {
  if (!el) return;
  const ls = layers ?? [];
  if (!ls.length && !arch) {
    el.innerHTML = `<p class="brain-stats-empty">No weight data</p>`;
    return;
  }

  const globalMax = Math.max(...ls.map((l) => l.maxAbs ?? l.meanAbs ?? 0), 1e-6);

  const paramsBlock = arch?.parameters
    ? `<div class="brain-stats-hero">
        <span class="brain-stats-hero-value">${arch.parameters.toLocaleString("en")}</span>
        <span class="brain-stats-hero-label">Network parameters</span>
      </div>
      <div class="inset-separator"></div>`
    : "";

  const rows = ls
    .map((l) => {
      const mean = l.meanAbs ?? 0;
      const rms = l.rms ?? 0;
      const max = l.maxAbs ?? mean;
      return `<div class="brain-layer-row">
        <div class="brain-layer-head">
          <span class="brain-layer-name">Layer ${l.layer + 1}</span>
          <span class="brain-layer-dim">${l.in} → ${l.out}</span>
        </div>
        <div class="brain-metric-grid">
          ${metricBar("|w|̄", mean, globalMax)}
          ${metricBar("RMS", rms, globalMax)}
          ${metricBar("|w|max", max, globalMax)}
        </div>
      </div>`;
    })
    .join("");

  el.innerHTML = paramsBlock + rows;
}

function metricBar(label, value, maxVal) {
  const pct = pctOfMax(value, maxVal);
  const display = value != null ? value.toFixed(3) : "—";
  return `<div class="brain-metric">
    <div class="brain-metric-top">
      <span class="brain-metric-label">${label}</span>
      <span class="brain-metric-value">${display}</span>
    </div>
    <div class="brain-metric-track"><div class="brain-metric-fill" style="width:${pct.toFixed(1)}%"></div></div>
  </div>`;
}

function updateLayerSelect(select, layers, current) {
  if (!select || !layers?.length) return;
  const prev = select.value;
  select.innerHTML = layers
    .map(
      (l, i) =>
        `<option value="${i}">Layer ${i + 1}: ${l.inSize} → ${l.outSize}</option>`
    )
    .join("");
  select.value = String(current ?? 0);
  if (prev && select.querySelector(`option[value="${prev}"]`)) {
    select.value = prev;
  }
}

export function renderBrainStats(el, summary, arch) {
  renderWeightStatsPanel(el, {
    arch,
    layers: summary?.layerStats ?? [],
  });
}

export function renderFitnessBreakdown(el, lines, model) {
  if (!el) return;
  if (!lines?.length) {
    el.innerHTML = '<p class="muted">No data from the last champion match</p>';
    return;
  }
  el.innerHTML = lines
    .map((line) => {
      const m = model[line.key];
      const sign = line.amount > 0 ? "+" : "";
      const cls = line.amount > 0 ? "pos" : line.amount < 0 ? "neg" : "";
      const team = line.side === "blue" ? "Blue" : "Red";
      return `<div class="reward-row fitness-row">
        <span class="reward-name">${team} · ${m?.label ?? line.key}</span>
        <span class="reward-value ${cls}">${sign}${line.amount.toFixed(2)}</span>
      </div>`;
    })
    .join("");
}

export function renderCompareTable(el, data) {
  if (!el || !data) return;
  const { genA, genB, histA, histB, match } = data;
  const row = (label, a, b) =>
    `<tr><td>${label}</td><td>${a ?? "—"}</td><td>${b ?? "—"}</td></tr>`;

  const fmt = (v, pct = false) => {
    if (v == null) return "—";
    return pct ? `${Number(v).toFixed(1)}%` : Number(v).toFixed(2);
  };

  el.innerHTML = `
    <table class="compare-table">
      <thead><tr><th>Metric</th><th>G${genA}</th><th>G${genB}</th></tr></thead>
      <tbody>
        ${row("Fitness μ", fmt(histA?.blueFitness), fmt(histB?.blueFitness))}
        ${row("Weapon pickup", fmt(histA?.bluePickupPct, true), fmt(histB?.bluePickupPct, true))}
        ${row("Kills", fmt(histA?.blueKillRate, true), fmt(histB?.blueKillRate, true))}
        ${row("|w|̄ layer 1", fmt(data.brainA?.layerStats?.[0]?.meanAbs), fmt(data.brainB?.layerStats?.[0]?.meanAbs))}
      </tbody>
    </table>
    <div class="compare-match-result">
      <p><strong>Match:</strong> ${match.label}</p>
      <p><strong>Outcome:</strong> ${
        match.reason === "kill"
          ? `G${match.winner === "blue" ? genA : genB} wins in ${(match.killTimeMs / 1000).toFixed(3)} s`
          : "Draw (timeout)"
      }</p>
      <p><strong>Fitness:</strong> G${genA} ${fmt(match.blueFitness)} · G${genB} ${fmt(match.redFitness)}</p>
    </div>
  `;
}
