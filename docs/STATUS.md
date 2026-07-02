# STATUS — shepherd

Current state of the project and what's next. Read this first when picking the work back up.

## Where things stand

**Phase 1 is complete and playable.** A mouse-driven dog herds 500 boids through a narrow gate into a pen, with panic/flee, hard-body sheep, a gate funnel, one-way penning, circulate-to-back, camera follow, and a win condition. Obstacle support was added on top (level 2). Everything is deterministic and headless-testable.

- **Run:** `npm run dev` → http://localhost:1574 (strictPort). `npm run build` (typecheck + bundle). `npm test` (vitest, 23 tests).
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
