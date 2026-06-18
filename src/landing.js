/** Top-down procedural maze preview for the landing hero */

const MAP = 12;
const CELL = 40;

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateMaze(seed) {
  const rng = mulberry32(seed);
  const walls = Array.from({ length: MAP }, () => Array(MAP).fill(false));

  for (let y = 0; y < MAP; y++) {
    for (let x = 0; x < MAP; x++) {
      if (x === 0 || y === 0 || x === MAP - 1 || y === MAP - 1) {
        walls[y][x] = true;
        continue;
      }
      if (rng() < 0.22) walls[y][x] = true;
    }
  }

  const clear = (x, y) => {
    if (x > 0 && x < MAP - 1 && y > 0 && y < MAP - 1) walls[y][x] = false;
  };
  clear(2, 2);
  clear(MAP - 3, MAP - 3);
  clear(MAP >> 1, MAP >> 1);

  return walls;
}

function cellCenter(x, y) {
  return { x: x * CELL + CELL / 2, y: y * CELL + CELL / 2 };
}

function isWalkable(walls, x, y) {
  const cx = Math.floor(x / CELL);
  const cy = Math.floor(y / CELL);
  if (cx < 0 || cy < 0 || cx >= MAP || cy >= MAP) return false;
  return !walls[cy][cx];
}

function initArenaCanvas(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const size = MAP * CELL;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  ctx.scale(dpr, dpr);

  let seed = 42;
  let walls = generateMaze(seed);

  const blue = { ...cellCenter(2, 2), angle: 0, trail: [] };
  const red = { ...cellCenter(MAP - 3, MAP - 3), angle: Math.PI, trail: [] };

  const weapons = [
    cellCenter(MAP >> 1, 3),
    cellCenter(3, MAP >> 1),
    cellCenter(MAP - 4, MAP >> 1),
  ];

  function stepAgent(agent, target, t) {
    const dx = target.x - agent.x;
    const dy = target.y - agent.y;
    const dist = Math.hypot(dx, dy) || 1;
    const desired = Math.atan2(dy, dx);
    let diff = desired - agent.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    agent.angle += diff * 0.08;

    const speed = 1.4 + Math.sin(t * 0.002 + agent.x) * 0.3;
    const nx = agent.x + Math.cos(agent.angle) * speed;
    const ny = agent.y + Math.sin(agent.angle) * speed;

    if (isWalkable(walls, nx, ny)) {
      agent.x = nx;
      agent.y = ny;
    } else if (isWalkable(walls, agent.x + Math.cos(agent.angle) * speed, agent.y)) {
      agent.x += Math.cos(agent.angle) * speed;
    } else if (isWalkable(walls, agent.x, agent.y + Math.sin(agent.angle) * speed)) {
      agent.y += Math.sin(agent.angle) * speed;
    } else {
      agent.angle += 0.4;
    }

    agent.trail.push({ x: agent.x, y: agent.y });
    if (agent.trail.length > 24) agent.trail.shift();
  }

  let frame = 0;

  function draw() {
    frame++;
    const t = frame;

    if (frame % 900 === 0) {
      seed = (seed * 16807 + 1) >>> 0;
      walls = generateMaze(seed);
    }

    const weaponTarget = weapons[(Math.floor(t / 300) + 1) % weapons.length];
    stepAgent(blue, weaponTarget, t);
    stepAgent(red, blue, t + 500);

    ctx.fillStyle = "#141c28";
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = "rgba(0, 229, 176, 0.05)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= MAP; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL, 0);
      ctx.lineTo(i * CELL, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * CELL);
      ctx.lineTo(size, i * CELL);
      ctx.stroke();
    }

    ctx.fillStyle = "#1e2838";
    for (let y = 0; y < MAP; y++) {
      for (let x = 0; x < MAP; x++) {
        if (walls[y][x]) {
          ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
        }
      }
    }

    for (const w of weapons) {
      ctx.fillStyle = "rgba(255, 176, 32, 0.45)";
      ctx.beginPath();
      ctx.arc(w.x, w.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawTrail(agent, color) {
      if (agent.trail.length < 2) return;
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(agent.trail[0].x, agent.trail[0].y);
      for (let i = 1; i < agent.trail.length; i++) {
        ctx.lineTo(agent.trail[i].x, agent.trail[i].y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    drawTrail(blue, "#3db8ff");
    drawTrail(red, "#ff3d5a");

    function drawAgent(agent, fill, stroke) {
      ctx.save();
      ctx.translate(agent.x, agent.y);
      ctx.rotate(agent.angle);
      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(-5, 5);
      ctx.lineTo(-3, 0);
      ctx.lineTo(-5, -5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    drawAgent(blue, "#3db8ff", "#2080cc");
    drawAgent(red, "#ff3d5a", "#cc2040");

    return requestAnimationFrame(draw);
  }

  let raf = requestAnimationFrame(draw);

  return () => cancelAnimationFrame(raf);
}

function initReveal() {
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const blocks = document.querySelectorAll(".reveal");
  if (prefersReduced) {
    blocks.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );

  blocks.forEach((el) => observer.observe(el));
}

function boot() {
  const canvas = document.getElementById("arena-canvas");
  let stopArena = null;
  if (canvas instanceof HTMLCanvasElement) {
    stopArena = initArenaCanvas(canvas);
  }
  initReveal();

  window.addEventListener("beforeunload", () => {
    if (stopArena) stopArena();
  });
}

boot();
