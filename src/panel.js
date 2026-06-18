import { TrainingApi, formatKillTime, formatPct, formatDuration } from "./api.js";
import { initTrainingChart, renderChartLegend } from "./chart.js";
import { initTabs } from "./tabs.js";
import {
  initBrainPanel,
  renderBrainStats,
  renderFitnessBreakdown,
  renderCompareTable,
} from "./brain-viz.js";
import { FITNESS_MODEL } from "../shared/rewards.js";

function setFitnessValue(el, value) {
  if (!el) return;
  if (value == null || Number.isNaN(value)) {
    el.textContent = "—";
    el.className = "compare-value";
    return;
  }
  const n = Number(value);
  el.textContent = n.toFixed(2);
  el.className = "compare-value" + (n < 0 ? " val-neg" : n > 8 ? " val-pos" : "");
}

function renderRewardsTable(el, model = FITNESS_MODEL) {
  if (!el) return;
  el.innerHTML = Object.entries(model)
    .map(([, m]) => {
      const sign = m.value > 0 ? "+" : "";
      const cls = m.value > 0 ? "pos" : m.value < 0 ? "neg" : "";
      return `<div class="reward-row">
        <span class="reward-name">${m.label}</span>
        <span class="reward-value ${cls}">${sign}${m.value}</span>
        <span class="reward-note">${m.note} · ${m.per}</span>
      </div>`;
    })
    .join("");
}

function fillCheckpointSelects(checkpoints, genA, genB, currentGen) {
  const opts = (checkpoints ?? [])
    .map((c) => `<option value="${c.generation}">G${c.generation}</option>`)
    .join("");

  for (const sel of [genA, genB]) {
    if (!sel) continue;
    const prev = sel.value;
    sel.innerHTML = opts || '<option value="">Нет чекпоинтов</option>';
    if (prev && sel.querySelector(`option[value="${prev}"]`)) sel.value = prev;
  }

  if (genA && !genA.value && checkpoints?.length) {
    genA.value = String(checkpoints[Math.min(1, checkpoints.length - 1)]?.generation ?? "");
  }
  if (genB && !genB.value && checkpoints?.length) {
    genB.value = String(checkpoints[0]?.generation ?? currentGen ?? "");
  }
}

export function initPanel(api, onReplaySelect, onLive, onBrainUpdate, onCompareReplay, options = {}) {
  const { demo = false } = options;
  const $ = (id) => document.getElementById(id);

  if (demo) {
    document.getElementById("demo-banner")?.classList.add("visible");
    for (const id of ["btn-live", "btn-rollback", "btn-zero", "btn-reset"]) {
      const el = $(id);
      if (el) el.style.display = "none";
    }
    for (const id of ["export-history", "export-protocol", "export-meta"]) {
      const el = $(id);
      if (el) {
        el.classList.add("disabled-link");
        el.removeAttribute("href");
        el.title = "Доступно только при локальном запуске с сервером обучения";
      }
    }
  }

  initTabs($("settings-panel"));

  const chart = $("training-chart")
    ? initTrainingChart($("training-chart"))
    : { update() {}, resize() {} };
  if ($("chart-legend")) renderChartLegend($("chart-legend"));

  const brainPanel = $("brain-panel-root")
    ? initBrainPanel($("brain-panel-root"))
    : { update() {}, resize() {} };

  window.addEventListener("resize", () => {
    chart.resize();
    brainPanel.resize();
  });
  chart.resize();

  renderRewardsTable($("rewards-table-overview"));

  let lastCompareMatch = null;
  let checkpointsCache = [];

  function renderReplays(replays) {
    const list = $("replay-list");
    const select = $("replay-select");
    list.innerHTML = "";
    select.innerHTML = "";

    if (!replays?.length) {
      list.innerHTML = '<p class="muted">Нет сохранённых матчей с рекордным временем</p>';
      return;
    }

    for (const r of replays) {
      const opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = `#${r.id} · ${formatKillTime(r.killTimeMs)} · ${r.winner === "blue" ? "Синий" : "Красный"}`;
      select.appendChild(opt);

      const item = document.createElement("button");
      item.type = "button";
      item.className = "replay-item";
      item.innerHTML = `<span class="replay-main">
          <span class="replay-time">${formatKillTime(r.killTimeMs)}</span>
          <span class="replay-meta">#${r.id} · ${r.winner === "blue" ? "Синий" : "Красный"}</span>
        </span>
        <span class="replay-chevron" aria-hidden="true">›</span>`;
      item.addEventListener("click", () => {
        select.value = r.id;
        onReplaySelect(r.id);
      });
      list.appendChild(item);
    }
  }

  function updateWinBar(status) {
    const total = status.championGames || status.totalGames || 1;
    if (!total) return;
    $("win-bar-blue").style.width = `${(status.blueWins / total) * 100}%`;
    $("win-bar-red").style.width = `${(status.redWins / total) * 100}%`;
    $("win-bar-draw").style.width = `${(status.draws / total) * 100}%`;
  }

  api.onStatus((s) => {
    const championGames = s.championGames ?? s.totalGames ?? 0;
    $("stat-total").textContent = championGames.toLocaleString("ru");
    $("stat-kill-rate").textContent = formatPct(s.killRate ?? 0);
    $("stat-visible-kill").textContent = formatPct(s.visibleKillRate ?? 0);
    $("stat-weapon-sight").textContent = formatPct(s.weaponSightRate ?? 0);
    $("stat-best").textContent = s.bestKillTimeMs ? formatKillTime(s.bestKillTimeMs) : "—";
    $("stat-avg-kill").textContent =
      s.avgKillTimeMs != null ? formatKillTime(s.avgKillTimeMs) : "нет убийств";
    $("stat-blue-wins").textContent = (s.blueWins ?? 0).toLocaleString("ru");
    $("stat-red-wins").textContent = (s.redWins ?? 0).toLocaleString("ru");
    $("stat-draws").textContent = (s.draws ?? 0).toLocaleString("ru");
    updateWinBar(s);

    const lg = s.lastGen ?? s.history?.[s.history.length - 1];
    $("blue-gen").textContent = s.blueGeneration ?? 0;
    $("red-gen").textContent = s.redGeneration ?? 0;
    setFitnessValue($("blue-fitness"), lg?.blueFitness);
    setFitnessValue($("red-fitness"), lg?.redFitness);
    $("blue-pickup").textContent = lg?.bluePickupPct != null ? formatPct(lg.bluePickupPct) : "—";
    $("red-pickup").textContent = lg?.redPickupPct != null ? formatPct(lg.redPickupPct) : "—";
    $("blue-kill-rate").textContent = lg?.blueKillRate != null ? formatPct(lg.blueKillRate) : "—";
    $("red-kill-rate").textContent = lg?.redKillRate != null ? formatPct(lg.redKillRate) : "—";
    $("blue-mutation").textContent = s.blueMutation?.toFixed(3) ?? "—";
    $("red-mutation").textContent = s.redMutation?.toFixed(3) ?? "—";
    $("blue-actions").textContent = s.blueActions ?? "—";
    $("red-actions").textContent = s.redActions ?? "—";

    $("stat-draw-rate").textContent = formatPct(s.drawRate ?? 0);
    $("stat-eval-games").textContent = (s.evalGames ?? 0).toLocaleString("ru");
    $("stat-parallel").textContent = `${s.parallelGames ?? "—"} × ${s.workerCount ?? "—"} потоков`;
    $("stat-gens").textContent = (s.generationsTotal ?? s.generation ?? 0).toLocaleString("ru");
    $("stat-checkpoints").textContent = s.checkpointsCount ?? 0;
    $("stat-replays-count").textContent = s.replaysCount ?? 0;
    $("stat-uptime").textContent = formatDuration(s.sessionUptimeMs ?? 0);

    const arch = s.architecture;
    $("stat-architecture").textContent = arch
      ? `${arch.layers.join("→")} · ${arch.parameters} пар.`
      : "—";

    renderFitnessBreakdown($("fitness-breakdown"), s.lastChampionBreakdown, FITNESS_MODEL);

    const side = brainPanel.side ?? "blue";
    const summary = side === "blue" ? s.blueBrainSummary : s.redBrainSummary;
    renderBrainStats($("brain-weight-stats"), summary, arch);

    renderReplays(s.replays);
    chart.update(s.history ?? []);

    api.fetchCheckpoints().then((cps) => {
      checkpointsCache = cps ?? [];
      fillCheckpointSelects(checkpointsCache, $("compare-gen-a"), $("compare-gen-b"), s.blueGeneration);
    });
  });

  window.addEventListener("panel-tab", (e) => {
    if (e.detail.tab === "brain") brainPanel.resize();
    if (e.detail.tab === "main") chart.resize();
  });

  if (onBrainUpdate) {
    onBrainUpdate((brain) => brainPanel.update(brain));
  }

  $("btn-watch")?.addEventListener("click", () => {
    const id = Number($("replay-select").value);
    if (id) onReplaySelect(id);
  });
  $("btn-live")?.addEventListener("click", () => onLive?.());
  $("btn-rollback")?.addEventListener("click", async () => {
    const id = Number($("replay-select").value);
    if (!id) return;
    if (!confirm(`Откатить обе сети до состояния матча #${id}?`)) return;
    await api.rollback(id);
  });

  $("btn-compare-run")?.addEventListener("click", async () => {
    const genA = Number($("compare-gen-a").value);
    const genB = Number($("compare-gen-b").value);
    if (!genA || !genB) return;
    const el = $("compare-result");
    el.innerHTML = '<p class="muted muted-inset">Запуск матча…</p>';
    try {
      const data = await api.compareGenerations(genA, genB);
      lastCompareMatch = data;
      renderCompareTable(el, data);
      $("btn-compare-watch").disabled = !data?.match?.frames?.length;
    } catch {
      el.innerHTML = '<p class="muted muted-inset">Ошибка сравнения</p>';
    }
  });

  $("btn-compare-watch")?.addEventListener("click", () => {
    if (!lastCompareMatch?.match) return;
    onCompareReplay?.(lastCompareMatch.match);
  });

  $("btn-zero")?.addEventListener("click", async () => {
    if (
      !confirm(
        "Сбор весов: обнулить все веса обеих нейросетей и сбросить всю статистику?\n\nОбучение начнётся с нуля (веса = 0)."
      )
    ) {
      return;
    }
    await api.zeroBrains();
    chart.update([]);
  });
  $("btn-reset")?.addEventListener("click", async () => {
    if (!confirm("Сбросить обучение: случайные веса, статистика и история?")) return;
    await api.resetBrains();
    chart.update([]);
  });
}
