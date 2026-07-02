# shepherd (working title)

A cozy top-down sheepdog herding sim. You are a dog that follows your mouse across a field. Your job is to herd a flock of sheep into a pen. Levels present differently shaped and sized fields, from open pasture to maze-like layouts to wild playful ones.

> **Status:** Phase 1 is built and playable — a mouse-driven dog herds 500 boids through a gate into a pen, with panic/flee, hard-body sheep, and obstacle support. Two levels ship (`data/levels/`); the default is `level2` (a boulder in the middle of the field). Run with `npm run dev` (port **1574**); `npm test` for the headless sim suite. See `docs/STATUS.md` for the current state and what's next.

The flock is not an object. Each sheep is an independent agent running local flocking. Cohesion is felt only between neighbors within an awareness radius, so the flock can split, drift apart, and regroup entirely emergently — there is no split logic and no group tracking anywhere in the codebase. Skilled play keeps the flock whole; clumsy pressure shears it.

## Core loop

Follow the mouse to position the dog (it trots to follow). Work the *edge* of the flock, not its center. Apply pressure to steer sheep toward the pen.

**Controls (as built):**
- **Move mouse** — the dog trots to follow.
- **Hold left + move the mouse** — stalk: a slow deliberate creep that makes sheep give ground steadily (intermediate fear radius).
- **Hold left + keep the mouse still** — the dog plants / drops prone (the "eye"): smallest fear radius, holds a group as a soft wall without panicking them.
- **Release** — back to trot-follow.
- **Right-click** — bark: a radial panic pulse to unstick jammed sheep or reset a corner.

Thread the sheep through the pen gate. Win when all sheep are in the pen. (Shift-click cone big-bark is still deferred — see `docs/STATUS.md`.)

## Feel targets

Chill and satisfying. Herding *feels* good; most layouts are winnable without stress. Panic decays quickly and forgivingly, so a bad approach scatters the flock but you can recover. Optional timed / par-time gameplay is a nice-to-have, not a fail state at the core.

## Stack

- **PixiJS v8** + **TypeScript** + **Vite**; **vitest** for headless sim tests
- Sheep rendered as an SoA particle pool — irregular off-white ovals oriented to movement axis, tinted by panic
- Uniform-grid **spatial hash** for neighbor queries only (invisible bookkeeping; sheep move on continuous floats, never on a grid)
- Soft boid separation **plus a hard positional de-overlap pass**, so sheep bodies bump instead of stacking
- HyperBrick architecture: single mutable `GameState`, dumb views, fixed-timestep loop (240 Hz), seeded mulberry32 PRNG, all tunables in `data/`
- Target scale: **500 sheep** comfortable, **1000** a stretch goal. No field approximation — real per-sheep boids throughout.

## Camera

Aerial top-down, axis-locked (does **not** rotate to dog heading). Translates to follow the dog with a lookahead offset toward dog velocity. Dynamic zoom (out when flock is spread, in when tight) is a near-term nice-to-have, not deferred forever.

## Documents

- `CLAUDE.md` — build conventions and architecture rules for the coding agent
- `docs/DESIGN_BIBLE.md` — the simulation model: flocking, panic, dog states, gate, pen
- `docs/PHASE_1_SCOPE.md` — the first buildable slice (the spec)
- `docs/PHASE_1_PLAN.md` — the concrete implementation plan that was executed
- `docs/STATUS.md` — current state, deviations from the bible, and prioritized next steps
