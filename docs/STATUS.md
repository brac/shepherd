# STATUS — shepherd

Current state of the project and what's next. Read this first when picking the work back up.

## Where things stand

**Phase 1 is complete and playable.** A mouse-driven dog herds 500 boids through a narrow gate into a pen, with panic/flee, hard-body sheep, a gate funnel, one-way penning, circulate-to-back, camera follow, and a win condition. Obstacle support was added on top (level 2). Everything is deterministic and headless-testable.

**Phase 2A (flock aliveness) in progress — M0 + M1 + M2 done.** M0 laid the SoA scaffolding (activity states, per-sheep traits, ambient/trample state, debug overlay). **M1 (startle wave):** panic propagates outward at a finite `WAVE_SPEED` (via per-sheep `panicAge` gating) so a disturbance reads as an expanding ripple that fades and dies out partway through the flock instead of jumping instantly; ambient **bird** flushes (`src/sim/ambient.ts`, new `updateAmbient` pass at step 3.5) drop short-lived startle emitters that inject through the same panic path as the dog/bark, and **wind gusts** raise a decaying flock-wide alertness; a lightly-spooked idle sheep enters **ACT_ALERT** — plants and faces the disturbance — but ONLY when the dog is beyond fear range and its panic is in a thin mild band (`ALERT_PANIC`..`ALERT_PANIC_MAX`), so a herded flock keeps flowing instead of freezing. **M2 (anti-uniformity traits):** `skittish` scales all external panic injection (mean re-centred to ≈1 so it doesn't dampen the flock), `speedMul` scales per-sheep max speed, `wanderMul` scales graze wander magnitude + dwell — the flock now reacts, moves, and grazes as individuals, not clones. **Next: M3 (grazing clusters that form and dissolve).**

**Controls & dev tools:** `D` toggles the debug overlay (sheep recoloured by activity + startle rings). `` ` `` opens a **dev-tools panel** (`src/render/devPanel.ts`, DOM overlay) with live sliders — currently **Dog max speed** (double-click a label to reset to default). Sliders write `GameState.dev` (runtime overrides that default to the tuning consts; NOT part of determinism). Add a knob with one `addSlider()` call.

- **Run:** `npm run dev` → http://localhost:1574 (strictPort). `npm run build` (typecheck + bundle). `npm test` (vitest, 27 tests).
- **Default level:** `level2` ("Standing Stone") — a boulder in the middle of the field. `level1` ("Open Pasture") is the obstacle-free version. Wired in `src/main.ts`.
- **Repo:** https://github.com/brac/shepherd (branch `main`).

## Controls (as built)

- Move mouse → trot-follow.
- Hold left + move mouse → **stalk** (slow creep).
- Hold left + hold still → **prone/stop** (plant, soft wall, snaps facing to nearest sheep).
- Release → trot.
- Right-click → **bark** (radial panic pulse).

Holding left plants the dog; only mouse motion while held distinguishes stalk from stop. This deliberately supersedes the bible's original "click = snap prone" wording (the user found that unintuitive — see the memory note).

## Architecture quick map

Single mutable `GameState` (`src/state/gameState.ts`), sheep as Structure-of-Arrays. Fixed-timestep 240 Hz loop with render interpolation (`src/loop.ts`). Sim in `src/sim/` mutates state in place, imports no Pixi (runs headless). Dumb views in `src/render/`. All tunables in `data/tuning.ts`. Levels are pure data in `data/levels/` built by `src/state/level.ts` — **new levels need no sim code**, just polygons (+ optional `obstacles`).

Sim step order (the determinism contract), in `src/sim/step.ts`: snapshot → dog → rebuild spatial hash → panic → flocking → **de-overlap** → penning → camera.

## Deviations from DESIGN_BIBLE (intentional, documented)

1. **Panic propagation is diffusion-toward-hottest-neighbor with loss**, not additive-then-clamped. Additive summing caused a permanent scatter at 500 dense sheep. See `src/sim/panic.ts` and DESIGN_BIBLE §2.
2. **Control scheme** is hold-to-plant (above), not click-to-toggle-prone. DESIGN_BIBLE §3 updated to match.
3. **Hard de-overlap pass** added (`src/sim/overlap.ts`) beyond soft boid separation, so bodies bump. DESIGN_BIBLE §1 updated.

## Tuning notes

All in `data/tuning.ts`. Current values reflect a first feel pass:
- Dog trot 170 vs sheep flee 152 / walk 78 — dog only slightly outpaces fleeing sheep so it can flank without trivially running them down. **This ratio is the #1 feel dial; keep iterating in playtest.**
- Panic: decay 0.9/s (forgiving), propagation pull 4.0/s, base inject 4.5 (head-on crosses the 0.6 flight threshold; flanking stays gentle via the angle floor). Bark cooldown 0.8s.
- Hard body distance `SHEEP_COLLIDE_DIST` 11, `OVERLAP_PASSES` 2.
- Penned sheep move at `PENNED_SPEED` 40 (calm shuffle) with a gentle `PEN_BACK_STRENGTH` 0.3. Heading eases toward velocity (`HEADING_EASE`, `HEADING_MIN_SPEED`) so a jittering sheep can't spin.
- **Sheep-like realism layer** (see DESIGN_BIBLE §1 "Sheep-like realism", refs Strömbom 2014 / Ballerini 2008 / Couzin 2002 / Hamilton 1971): `TOPO_K`, `REJOIN_MIN_NEIGHBORS`, `W_REJOIN` (topological rejoin — strays sprint back, group shearing preserved); `REAR_WEIGHT` (blind-rear elongation); `W_NOISE` (anti-crystallisation); `PANIC_COHESION_GAIN` (selfish-herd bunching); `BODY_SIZE_MIN/MAX` (de-overlap lattice break). These are the main "make it feel like sheep" dials to iterate on next.

**Pen enclosure:** penned sheep collide against a *separate* wall set (`level.pennedWalls`) — the full pen boundary with inward normals (gate included) — so they can never be pulled out, even by a flock cohering just outside the fence. Unpenned sheep + the dog use `level.walls` (fence blocks from outside, gate open). Built in `src/state/level.ts`.

## Performance

500 sheep ~1.5–2 ms/step (well within the single-thread 240 Hz budget, room for rendering). 1000 sheep (~5–13 ms/step depending on machine noise) exceeds single-thread realtime — an explicit **stretch** goal, logged not gated in the perf test. The two hot per-sheep sweeps (panic propagation, flocking) are the dominant cost.

## What's next (prioritized)

1. **Tuning pass** — a playtest activity on the dials above, in scope order: dog:sheep ratio → awareness radius → decay vs propagation → approach-angle weighting → funnel strength. Plus the stalk-idle / prone feel.
2. **Shift-click cone big-bark** — the one deferred combat verb; bark plumbing already exists, add a wider directional variant with a longer cooldown.
3. **Dynamic zoom** — out when the flock is spread, in when tight; layers onto the existing camera follow.
4. **Level select / progression** — cycle between the shipped levels in-game; then author more `data/levels/` maps (mazes, chutes, wild layouts) — pure data, no sim work.
5. **Only if observed:** gate flow-cap queuing if the throat actually jams under heavy flow.

## Tests (what's covered)

`test/`: determinism (10k steps, identical hashes), spatial-hash vs brute force, geometry, panic decay/propagation/threshold, and `smoke.test.ts` invariants — finite/in-field under clumsy driving, scatter-and-recover, penning + win, gate no-leak, no deep body overlap, obstacle blocks sheep, and a 500/1000 perf log.
