# shepherd (working title)

A cozy top-down sheepdog herding sim. You are a dog that follows your mouse across a field. Your job is to herd a flock of sheep into a pen. Levels present differently shaped and sized fields, from open pasture to maze-like layouts to wild playful ones.

The flock is not an object. Each sheep is an independent agent running local flocking. Cohesion is felt only between neighbors within an awareness radius, so the flock can split, drift apart, and regroup entirely emergently — there is no split logic and no group tracking anywhere in the codebase. Skilled play keeps the flock whole; clumsy pressure shears it.

## Core loop

Follow the mouse to position the dog. Work the *edge* of the flock, not its center. Apply pressure to steer sheep toward the pen. Left-click to drop the dog prone (the "eye") — smallest fear radius, holds a group as a soft wall. Left-click-drag to stalk — slow deliberate creep that makes sheep give ground steadily. Right-click to bark (radial panic pulse) to unstick jammed sheep or reset a corner. Shift-click to big-bark (cone) to shove a group in a direction. Thread the sheep through the pen gate. Win when all sheep are in the pen.

## Feel targets

Chill and satisfying. Herding *feels* good; most layouts are winnable without stress. Panic decays quickly and forgivingly, so a bad approach scatters the flock but you can recover. Optional timed / par-time gameplay is a nice-to-have, not a fail state at the core.

## Stack

- **PixiJS v8** + **TypeScript** + **Vite**
- Sheep rendered as an SoA particle pool — irregular off-white ovals oriented to movement axis
- Uniform-grid **spatial hash** for neighbor queries only (invisible bookkeeping; sheep move on continuous floats, never on a grid)
- HyperBrick architecture: single mutable `GameState`, dumb views, fixed-timestep loop (240 Hz), seeded mulberry32 PRNG, all tunables in `data/`
- Target scale: **500 sheep** comfortable, **1000** a stretch goal. No field approximation — real per-sheep boids throughout.

## Camera

Aerial top-down, axis-locked (does **not** rotate to dog heading). Translates to follow the dog with a lookahead offset toward dog velocity. Dynamic zoom (out when flock is spread, in when tight) is a near-term nice-to-have, not deferred forever.

## Documents

- `CLAUDE.md` — build conventions and architecture rules for the coding agent
- `DESIGN_BIBLE.md` — the simulation model: flocking, panic, dog states, gate, pen
- `PHASE_1_SCOPE.md` — the first buildable slice
