const COLORS = {
  blueFitness: "#7eb5dc",
  redFitness: "#e09595",
  pickup: "#7bc49a",
  damage: "#e8be7a",
  visibleKill: "#c4a8e0",
};

export function initTrainingChart(canvas) {
  const ctx = canvas.getContext("2d");
  let history = [];

  function draw() {
    const w = canvas.width;
    const h = canvas.height;
    const pad = { l: 36, r: 10, t: 10, b: 20 };
    const plotW = w - pad.l - pad.r;
    const plotH = h - pad.t - pad.b;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#fafafa";
    ctx.fillRect(0, 0, w, h);

    if (!history.length) {
      ctx.fillStyle = "#86868b";
      ctx.font = "12px Inter, -apple-system, sans-serif";
      ctx.fillText("Collecting data…", pad.l, h / 2);
      return;
    }

    const points = history.slice(-120);
    const maxGen = points[points.length - 1].gen || 1;
    const minGen = points[0].gen || 0;

    const vals = points.flatMap((p) => [
      p.blueFitness,
      p.redFitness,
      p.pickupPct,
      p.avgDamage,
      p.visibleKillRate ?? 0,
    ]);
    let yMin = Math.min(...vals, -2);
    let yMax = Math.max(...vals, 2);
    if (yMax - yMin < 1) {
      yMin -= 0.5;
      yMax += 0.5;
    }

    const xAt = (gen) =>
      pad.l + ((gen - minGen) / Math.max(1, maxGen - minGen)) * plotW;
    const yAt = (v) => pad.t + (1 - (v - yMin) / (yMax - yMin)) * plotH;

    ctx.strokeStyle = "rgba(60,60,67,0.08)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (plotH * i) / 4;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + plotW, y);
      ctx.stroke();
    }

    const drawLine = (key, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.beginPath();
      points.forEach((p, i) => {
        const x = xAt(p.gen);
        const y = yAt(p[key] ?? 0);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };

    drawLine("blueFitness", COLORS.blueFitness);
    drawLine("redFitness", COLORS.redFitness);
    drawLine("pickupPct", COLORS.pickup);
    drawLine("avgDamage", COLORS.damage);
    drawLine("visibleKillRate", COLORS.visibleKill);

    ctx.fillStyle = "#86868b";
    ctx.font = "10px Inter, -apple-system, sans-serif";
    ctx.fillText(String(minGen), pad.l, h - 5);
    ctx.fillText(String(maxGen), pad.l + plotW - 24, h - 5);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(300, Math.floor(rect.width * devicePixelRatio));
    canvas.height = Math.floor(180 * devicePixelRatio);
    draw();
  }

  return {
    update(nextHistory) {
      history = nextHistory ?? [];
      draw();
    },
    resize,
  };
}

export function renderChartLegend(container) {
  container.innerHTML = `
    <span class="legend-item"><i style="background:${COLORS.blueFitness}"></i>Blue fitness</span>
    <span class="legend-item"><i style="background:${COLORS.redFitness}"></i>Red fitness</span>
    <span class="legend-item"><i style="background:${COLORS.pickup}"></i>Weapon pickup</span>
    <span class="legend-item"><i style="background:${COLORS.damage}"></i>Avg damage</span>
    <span class="legend-item"><i style="background:${COLORS.visibleKill}"></i>Visible kills</span>
  `;
}
