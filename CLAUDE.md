# CLAUDE.md — shepherd

Build conventions for coding agents on this project. Read `DESIGN_BIBLE.md` for the simulation model and `PHASE_1_SCOPE.md` for what to build first.

## Architecture (HyperBrick lineage)

- **Single mutable `GameState`.** One object owns everything: sheep arrays, dog, camera, level, input. Systems mutate it in place. No per-entity classes for sheep.
- **Dumb views.** Rendering reads `GameState` and draws. Views never contain simulation logic, never mutate state, never decide behavior. A view can be deleted and the sim still runs correctly headless.
- **Fixed-timestep loop at 240 Hz.** Accumulator pattern. Sim steps are deterministic and frame-rate independent. Rendering interpolates between the last two sim states for smooth motion at any display refresh.
- **Seeded `mulberry32` PRNG.** All randomness (spawn jitter, oval irregularity, grazing wander) draws from the seeded generator so a level+seed is reproducible. Never call `Math.random()`.
- **All tunables in `data/`.** Fear radii, panic thresholds, decay rates, boid weights, funnel strength, dog speeds, cooldowns — every magic number lives in a data file, not inline. The sim reads them; it does not hardcode them.

## Sheep as SoA, not objects

Sheep are a Structure-of-Arrays pool, not an array of objects. Parallel typed arrays: `posX`, `posY`, `velX`, `velY`, `panic`, `heading`, `flags`. Index `i` is one sheep across all arrays. This is required for cache-friendly iteration at 500–1000 agents and zero-allocation hot paths. Do not allocate inside the per-frame sheep update. No temp vectors, no closures, no array methods that allocate — hand-written loops over indices.

## Spatial hash is bookkeeping only

The uniform-grid spatial hash exists solely to answer "which sheep are near position (x,y)?" cheaply. It does **not** constrain movement. Positions are continuous floats. Each frame: clear the grid, insert every sheep into its cell by position, then neighbor queries read the 3×3 block of cells around a query point. Never snap a position to a cell. Never render the grid. Rebuild it once per sim step, before flocking.

## Determinism

Same level + same seed + same input sequence = identical result. This means: fixed iteration order over sheep, seeded PRNG only, no wall-clock time in sim logic (use accumulated sim time), no floating-point non-determinism introduced by parallelism. Keep the sim single-threaded for now.

## Collision

Fence/obstacle collision is **push-out along the surface normal**, never bounce. A sheep or dog penetrating a wall is projected back to the surface; residual velocity slides along the wall tangent. This is what lets sheep shoved at a fence slide toward the gate. Obstacles block the dog as well as sheep.

## File layout

```
src/
  state/        GameState definition, factory
  sim/          flocking, panic, dog, gate, collision, spawn — pure mutation of GameState
  render/       PixiJS views: sheep pool, dog, field, pen, camera
  input/        mouse -> dog intent (follow / prone / stalk / bark / big-bark)
  loop.ts       fixed-timestep accumulator
data/
  tuning.ts     all sim constants
  levels/       level definitions (polygons)
```

## What not to do

- No "flock" object, no group id, no split/merge tracking. Cohesion is local only. (See DESIGN_BIBLE.)
- No allocation in the sheep hot loop.
- No `Math.random()`.
- No simulation logic in views.
- No hardcoded tunables.
- No grid-snapped movement.
