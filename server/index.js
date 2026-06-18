import http from "http";
import { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";
import { TrainingEngine, benchmarkParallel } from "./training.js";
import { LiveBroadcaster } from "./live.js";
import { getRewardsPayload } from "../shared/rewards.js";
import { getReplay, loadReplays, loadMeta, saveMeta, listCheckpoints, loadCheckpoint } from "./storage.js";
import { historyToCsv, buildExperimentProtocol, buildMetaExport } from "./export.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.TOPGUN_PORT) || 3001;
const HOST = process.env.TOPGUN_HOST || "127.0.0.1";
const MUTATING_METHODS = new Set(["POST", "PUT", "DELETE"]);

async function main() {
  const meta = loadMeta();
  let bench;
  if (meta.parallelGames && meta.parallelGames >= 32) {
    const os = await import("os");
    bench = {
      cpus: os.cpus().length,
      workerCount: Math.max(2, os.cpus().length - 2),
      parallelGames: meta.parallelGames,
      bestThroughput: 0,
    };
    console.log(`Using saved parallel config: ${bench.parallelGames} games, ${bench.workerCount} workers`);
  } else {
    console.log("Benchmarking parallel capacity...");
    bench = await benchmarkParallel();
    meta.parallelGames = bench.parallelGames;
    saveMeta(meta);
    console.log(
      `CPUs: ${bench.cpus}, workers: ${bench.workerCount}, parallel games: ${bench.parallelGames}, throughput: ${bench.bestThroughput.toFixed(1)} games/s`
    );
  }

  const engine = new TrainingEngine({
    parallelGames: bench.parallelGames,
    workerCount: bench.workerCount,
  });

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (MUTATING_METHODS.has(req.method) && HOST === "127.0.0.1") {
      const remote = req.socket.remoteAddress?.replace("::ffff:", "");
      const local =
        remote === "127.0.0.1" || remote === "::1" || remote === "localhost" || !remote;
      if (!local) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Mutating requests allowed from localhost only" }));
        return;
      }
    }

    if (url.pathname === "/api/rewards") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(getRewardsPayload()));
      return;
    }

    if (url.pathname === "/api/status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(engine.buildStatus()));
      return;
    }

    if (url.pathname === "/api/replays") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(loadReplays().map((r) => ({
        id: r.id,
        killTimeMs: r.killTimeMs,
        winner: r.winner,
        seed: r.seed,
      }))));
      return;
    }

    const replayMatch = url.pathname.match(/^\/api\/replays\/(\d+)$/);
    if (replayMatch && req.method === "GET") {
      const replay = getReplay(Number(replayMatch[1]));
      if (!replay) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(replay));
      return;
    }

    const rollbackMatch = url.pathname.match(/^\/api\/replays\/(\d+)\/rollback$/);
    if (rollbackMatch && req.method === "POST") {
      const replay = engine.rollbackToReplay(Number(rollbackMatch[1]));
      if (!replay) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, replayId: replay.id }));
      broadcast(engine.buildStatus());
      return;
    }

    if (url.pathname === "/api/reset" && req.method === "POST") {
      engine.resetBrains();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      broadcast(engine.buildStatus());
      return;
    }

    if (url.pathname === "/api/zero" && req.method === "POST") {
      engine.zeroBrains();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      broadcast(engine.buildStatus());
      return;
    }

    if (url.pathname === "/api/brains" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(engine.getBrains()));
      return;
    }

    if (url.pathname === "/api/checkpoints" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(listCheckpoints()));
      return;
    }

    const cpMatch = url.pathname.match(/^\/api\/checkpoints\/(\d+)$/);
    if (cpMatch && req.method === "GET") {
      const cp = loadCheckpoint(Number(cpMatch[1]));
      if (!cp) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(cp));
      return;
    }

    if (url.pathname === "/api/compare" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        try {
          const { genA, genB } = JSON.parse(body || "{}");
          const result = engine.compareCheckpoints(Number(genA), Number(genB));
          if (!result) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Чекпоинты не найдены" }));
            return;
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(err.message) }));
        }
      });
      return;
    }

    if (url.pathname === "/api/export/history.csv") {
      const meta = loadMeta();
      const csv = historyToCsv(meta.history ?? []);
      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="topgun-history.csv"',
      });
      res.end("\uFEFF" + csv);
      return;
    }

    if (url.pathname === "/api/export/protocol.json") {
      const meta = loadMeta();
      const protocol = buildExperimentProtocol(meta, engine);
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="topgun-protocol.json"',
      });
      res.end(JSON.stringify(protocol, null, 2));
      return;
    }

    if (url.pathname === "/api/export/meta.json") {
      const meta = loadMeta();
      const payload = buildMetaExport(meta, engine);
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="topgun-meta.json"',
      });
      res.end(JSON.stringify(payload, null, 2));
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  const wss = new WebSocketServer({ server });
  const clients = new Set();

  function broadcast(data) {
    const msg = JSON.stringify({ type: "status", data });
    for (const ws of clients) {
      if (ws.readyState === 1) ws.send(msg);
    }
  }

  function sendLive(payload) {
    const msg = JSON.stringify(payload);
    for (const ws of clients) {
      if (ws.readyState === 1) ws.send(msg);
    }
  }

  const live = new LiveBroadcaster(() => engine.getChampions(), sendLive);

  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.send(JSON.stringify({ type: "status", data: engine.buildStatus() }));

    ws.on("close", () => clients.delete(ws));
    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "getReplay" && msg.id) {
          const replay = getReplay(msg.id);
          ws.send(JSON.stringify({ type: "replay", data: replay }));
        }
      } catch {
        /* ignore */
      }
    });
  });

  engine.onUpdate(broadcast);

  server.listen(PORT, HOST, () => {
    console.log(`Training server http://${HOST}:${PORT}`);
  });

  live.start();
  engine.start();

  const shutdown = async (signal) => {
    console.log(`\n${signal}: saving state…`);
    live.stop();
    await engine.shutdown();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch(console.error);
