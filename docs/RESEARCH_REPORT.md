# TopGun Research Report

## Abstract

TopGun Research is a procedural 3D combat arena where two neural agents co-evolve using **Evolution Strategies (ES)** without backpropagation. The project demonstrates end-to-end ML research engineering: deterministic simulation, parallel fitness evaluation, real-time visualization, and reproducible headless runs.

## Methodology

### Simulation

- Fixed 60 FPS timestep for deterministic physics
- 3D arena with procedural terrain and combat mechanics
- Pure JavaScript simulation core (no ML framework dependency in sim loop)

### Neural Architecture

- MLP: 28 → 40 → 32 → 5 outputs
- Inputs: agent state (position, velocity, opponent relative data, arena bounds)
- Outputs: movement and action controls

### Evolution Strategy

- Population-based co-evolution: two species (agents) evolve simultaneously
- Selection: elite retention + crossover + Gaussian mutation
- Fitness: survival time, damage dealt, tactical positioning (composite score)
- Worker-thread parallel evaluation for throughput

## Results

- Agents develop emergent pursuit and evasion behaviors over generations
- Co-evolution produces arms-race dynamics — both populations improve together
- Deterministic replay system allows exact reproduction of notable battles
- Live dashboard shows fitness curves and 3D replay via WebSocket feed

## Engineering Contributions

| Component | Purpose |
|-----------|---------|
| WebSocket training server | Real-time metrics to research dashboard |
| GitHub Pages demo | Zero-install web demo |
| Headless simulation | CI-friendly regression runs |
| Replay export | Shareable battle recordings |

## Limitations

- ES sample efficiency lower than gradient-based RL on this task at scale
- 3D rendering is demo-focused, not a production game engine
- Research scope: engineering showcase, not peer-reviewed novel algorithm

## Conclusion

The project proves ability to ship **ML systems as products**: simulation + training loop + observability + demo UI + CI — relevant for ML/fullstack/platform engineering roles.

## Live Demo

https://gavrilovegorof.github.io/topgun-research/demo.html
