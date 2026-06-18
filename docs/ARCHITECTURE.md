# TopGun — Architecture

Research platform for training two competing agents in a procedural 3D arena using **Evolution Strategies** (ES). The codebase is split into three layers that share one simulation core.

## System overview

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (Vite + Three.js)                                  │
│  landing.html · research.html · brain visualization       │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP /api/*  ·  WebSocket /ws
┌──────────────────────────▼──────────────────────────────────┐
│  Training server (Node.js)                                  │
│  REST API · live champion match · worker pool               │
└──────────────────────────┬──────────────────────────────────┘
                           │ worker_threads
┌──────────────────────────▼──────────────────────────────────┐
│  shared/ — deterministic simulation + neural net          │
└─────────────────────────────────────────────────────────────┘
```

## Module map

| Path | Responsibility |
|------|----------------|
| `shared/config.js` | Constants: map, physics, NN topology, ES hyperparameters, reward weights |
| `shared/world.js` | Procedural wall grid from seed, collider AABBs, spawn points |
| `shared/combat.js` | Ray casting (FOV, LOS), melee arc, draw penalty |
| `shared/observations.js` | 28-dim observation vector, action decoding |
| `shared/simulation.js` | Fixed-timestep match loop (60 Hz), fitness aggregation |
| `shared/neural.js` | MLP forward pass, mutate/crossover, `EvolutionTrainer` |
| `shared/rewards.js` | Documented fitness model for the research UI |
| `server/training.js` | Population evaluation, evolution loop, checkpoints |
| `server/worker.js` | Headless match runner in a worker thread |
| `server/storage.js` | Atomic JSON persistence (`state`, `meta`, `replays`, checkpoints) |
| `src/` | Three.js scene, research panel, charts, replay playback |

## Simulation loop

Each frame (`FIXED_DT = 1/60 s`):

1. Build observations for blue and red from egocentric sensors.
2. Run both MLPs → decode discrete actions (move, turn, shoot).
3. Apply inputs with alternating turn order (even frames: blue first).
4. Resolve pickups, projectiles, melee effects.
5. Stop on kill or `MATCH_TIMEOUT` (20 s).

Fitness combines combat outcome, exploration, anti-passivity penalties, and speed bonus on kills. Full breakdown is in `shared/rewards.js` and exposed via `GET /api/rewards`.

## Evolution strategy

Per side (blue / red), independently:

- Population size **48**, elite **8**.
- Each generation: evaluate every genome against the opponent champion on random map seeds.
- Rank by mean fitness → keep elite → fill rest via uniform crossover of elite parents + Gaussian mutation.
- Mutation σ starts at **0.12**, decays ×0.995 per generation (floor **0.03**).

Parallel evaluation uses `worker_threads`; throughput is auto-benchmarked on first launch and stored in `meta.json`.

## Observation space (28 inputs)

| Block | Size | Content |
|-------|------|---------|
| Ego state | 7 | Position, heading, HP, weapon, cooldown |
| Enemy (if visible) | 6 | Visibility flag, distance, bearing, enemy HP/weapon |
| Nearest weapon | 5 | Visibility, type, distance, bearing |
| Center ray | 2 | Wall/enemy/weapon hit distance and type |
| Lidar | 8 | Normalized wall distance at 8 bearings |

Enemy and weapon features are zeroed or sentinel-filled when outside FOV or blocked by walls — agents must explore to gather information.

## Action space (5 outputs)

Sigmoid outputs thresholded at **0.35** (shoot at **0.35** via `SHOOT_THRESHOLD`). Backward movement is disabled by design (`down` is always false).

## Persistence

Runtime data lives in `data/` (gitignored). On shutdown the server atomically writes:

- `state.json` — both populations and champions
- `meta.json` — session stats, fitness history, parallel config
- `replays.json` — top kill replays with frame snapshots
- `checkpoints/gen-*.json` — every 25 generations (max 20 kept)

Export endpoints produce CSV/JSON for lab reports without copying raw `data/`.

## Testing

Unit tests cover determinism, geometry, world generation, and ES operators:

```bash
npm test
```

Integration of the training server is validated manually via the research UI; CI runs tests and `vite build` on Node 20/22.

## Design decisions worth noting

- **Shared core** — same `Simulation` class runs in workers, live broadcaster, and browser replay — no train/serve skew.
- **Random map seeds** during training prevent overfitting to one layout; fixed `WORLD_SEED` for checkpoint comparison.
- **Alternating turn order** removes first-mover bias in simultaneous combat.
- **Atomic writes** (`*.pid.tmp` → rename) avoid corrupted state on crash.
