# STATUS — shepherd

Current state of the project and what's next. Read this first when picking the work back up.

## Where things stand

**Phase 1 is complete and playable.** A mouse-driven dog herds 500 boids through a narrow gate into a pen, with panic/flee, hard-body sheep, a gate funnel, one-way penning, circulate-to-back, camera follow, and a win condition. Obstacle support was added on top (level 2). Everything is deterministic and headless-testable.

**Phase 2A (flock aliveness) COMPLETE — M0→M6 all done.** M0 laid the SoA scaffolding (activity states, per-sheep traits, ambient/trample state, debug overlay). **M1 (startle wave):** panic propagates outward at a finite `WAVE_SPEED` (via per-sheep `panicAge` gating) so a disturbance reads as an expanding ripple that fades and dies out partway through the flock instead of jumping instantly; ambient **bird** flushes (`src/sim/ambient.ts`, new `updateAmbient` pass at step 3.5) drop short-lived startle emitters that inject through the same panic path as the dog/bark, and **wind gusts** raise a decaying flock-wide alertness; a lightly-spooked idle sheep enters **ACT_ALERT** — plants and faces the disturbance — but ONLY when the dog is beyond fear range and its panic is in a thin mild band (`ALERT_PANIC`..`ALERT_PANIC_MAX`), so a herded flock keeps flowing instead of freezing. **M2 (anti-uniformity traits):** `skittish` scales all external panic injection (mean re-centred to ≈1 so it doesn't dampen the flock), `speedMul` scales per-sheep max speed, `wanderMul` scales graze wander magnitude + dwell — the flock now reacts, moves, and grazes as individuals, not clones. **M3 (grazing clusters):** grazing cohesion now SATURATES with local density (`src/sim/flocking.ts`: a calm sheep with ≥`GRAZE_SATISFIED_N` close companions within `GRAZE_CLUSTER_RADIUS` feels no cohesion and drifts free; sparser grazers re-gather), so the idle flock breaks into uneven sub-groups that reshuffle instead of sitting as one even blob — topological rejoin still prevents true fragmentation. Verified: idle local-density CoV rises 0.24→0.40 with dense cores + sparse gaps, and the density pattern only correlates ~0.57 across 30 s (clumps churn). `W_GRAZE_COHESION` is the feel dial. **M4 (rest + lone-sheep return):** a GRAZE-calm, undisturbed sheep counts `restTimer` down (seeded 20–60 s × `restBias`, staggered) and lies down for a bout (`REST_DURATION` 30–90 s); the same timer becomes the rest/rise clock. It wakes on panic > `REST_WAKE_PANIC`, a panicking neighbour, the dog inside awareness, a gust, or isolation — but a wake trigger only shortens the clock to `REST_RISE_DELAY` (0.4 s), so a startled sleeper is the visible **laggard** before it rises (panic past the flight threshold overrides and it bolts). REST renders flatter/dimmer (M0 sheepView hook). The topological rejoin now reads as notice-then-hurry: `strayTimer` ramps the pull 0→full over `STRAY_RAMP_TIME` (0.7 s) and a stray is tagged `ACT_ALERT` + holds a `STRAY_AROUSAL` floor (0.1, below flight) that clears on rejoin. **M5 (terrain pooling):** levels can author `poolingAttractors` (`{x,y,strength,radius}[]`, packed onto `Level` as `poolAttr`/`poolCount`); a calm sheep (`panic < POOL_PANIC_MAX` 0.1) feels a very weak steady pull `W_POOL` (0.25, below wander) toward the nearest attractor whose catchment holds it, so the undisturbed flock slowly migrates/camps toward preferred ground and switches off the instant the dog spooks it. level1 has one upper-pasture camp; level2 has two (a pasture spot + the boulder's lee). Measured drift ~80px/50s. NOTE: these are *camps* (preferred resting ground, Hilder 1966), not thermoregulatory shade — sheep casually amble and lie down in the open en route, which is correct for camping. `D` overlay rings each camp. **M6 (lead-sheep + worn paths):** the neighbour scan tracks the nearest flockmate in a forward cone (`FOLLOW_CONE` ~35°, `FOLLOW_RANGE` 60px, tested squared/no-sqrt); a clearly-moving (`spd > FOLLOW_MIN_SPEED`), non-grazing/alert/stray/fleeing sheep gets extra cohesion+alignment `W_FOLLOW` (0.6) toward that emergent, rotating leader and is tagged `ACT_FOLLOW`, so a moving flock strings out single-file and threads the gate (measured ~150/500 chaining while herded, ~0 idle). A new `updateTrample` pass (`src/sim/trample.ts`, step 6.5) accumulates a coarse traffic grid — every sheep (dog ×4) deposits `TRAMPLE_ADD` into its cell, clamped to `TRAMPLE_MAX`, all cells fade `TRAMPLE_DECAY` 0.01/s (~100s); **purely visual, no sim feedback, not in the determinism hash**. `D` overlay draws it as a muddy heatmap under the activity dots. **Phase 2A done — next is Phase 2B (real visuals: fleece, breathing, the mesmerizing startle wave) or a tuning/feel pass.**

**Phase 2B (rendering) in progress — M0–M5 done** (`docs/PHASE_2B_PLAN.md`). M0 scaffolding + optional-texture drop-in (`assets/textures/` or `assets/images/gen_*`; procedural fallback, never blocks boot). M1 soft contact shadows (Pillar 1). M2 procedural fleece + per-sheep shade/dirt/size (brown & black sheep). M3 soft-material motion (squash-stretch, bob, breathing — all per-sheep phase-offset). M4 the field: grass **photo** ground (`gen_1.jpg`) + procedural fallback + vignette, worn-paths rendered from the trample grid, wind-on-grass, boulder drop shadow. M5 world mood: time-of-day color grade + drifting cloud shadows + overcast (dev knobs: Sun azimuth / Time of day / Overcast). **Perf/quality pass:** the mood `ColorMatrixFilter` grades only a **background** container (not the 1000+ particles, which stay on the fast path); trample dialed back (a single pass barely marks; wear is nonlinear via `WORN_MIN`); trample texture LINEAR-filtered (no grid flicker); render resolution capped at 1.5×. **Next: M6 (dynamic zoom + acceptance pass) — final 2B milestone.**

**Controls & dev tools:** `D` toggles the debug overlay (sheep recoloured by activity + startle rings). `` ` `` opens a **dev-tools panel** (`src/render/devPanel.ts`, DOM overlay) with live sliders — currently **Dog max speed** (double-click a label to reset to default). Sliders write `GameState.dev` (runtime overrides that default to the tuning consts; NOT part of determinism). Add a knob with one `addSlider()` call.

- **Run:** `npm run dev` → http://localhost:1574 (strictPort). `npm run build` (typecheck + bundle). `npm test` (vitest, 36 tests).
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

Single mutable `GameState` (`src/state/gameState.ts`), sheep as Structure-of-Arrays. Fixed-timestep **120 Hz** loop with render interpolation (`src/loop.ts`; dropped from 240 Hz in Phase 2B for frame-budget headroom — see Deviations). Sim in `src/sim/` mutates state in place, imports no Pixi (runs headless). Dumb views in `src/render/`. All tunables in `data/tuning.ts`. Levels are pure data in `data/levels/` built by `src/state/level.ts` — **new levels need no sim code**, just polygons (+ optional `obstacles`).

Sim step order (the determinism contract), in `src/sim/step.ts`: snapshot → dog → rebuild spatial hash → **ambient (birds/gusts, 3.5)** → panic → flocking → **de-overlap** → **trample (6.5, visual-only)** → penning → camera.

## Deviations from DESIGN_BIBLE (intentional, documented)

1. **Panic propagation is diffusion-toward-hottest-neighbor with loss**, not additive-then-clamped. Additive summing caused a permanent scatter at 500 dense sheep. See `src/sim/panic.ts` and DESIGN_BIBLE §2.
2. **Control scheme** is hold-to-plant (above), not click-to-toggle-prone. DESIGN_BIBLE §3 updated to match.
3. **Hard de-overlap pass** added (`src/sim/overlap.ts`) beyond soft boid separation, so bodies bump. DESIGN_BIBLE §1 updated.
4. **Sim runs at 120 Hz, not 240** (`SIM_HZ` in `data/tuning.ts`). At a 120 Hz display, 240 Hz forces two sim steps per rendered frame (~7 ms), leaving almost no render budget → the flock drops to 30 fps when running. 120 Hz is one step/frame and holds 120. Still fixed-timestep/deterministic/frame-rate-independent; all tuning is per-second rates so feel is preserved (verified: all 36 tests pass, incl. no-deep-overlap and determinism). DESIGN_BIBLE §Architecture says 240 — this supersedes it.

## Tuning notes

All in `data/tuning.ts`. Current values reflect a first feel pass:
- Dog trot 170 vs sheep flee 152 / walk 78 — dog only slightly outpaces fleeing sheep so it can flank without trivially running them down. **This ratio is the #1 feel dial; keep iterating in playtest.**
- Panic: decay 0.9/s (forgiving), propagation pull 4.0/s, base inject 4.5 (head-on crosses the 0.6 flight threshold; flanking stays gentle via the angle floor). Bark cooldown 0.8s.
- Hard body distance `SHEEP_COLLIDE_DIST` 11, `OVERLAP_PASSES` 2.
- Penned sheep move at `PENNED_SPEED` 40 (calm shuffle) with a gentle `PEN_BACK_STRENGTH` 0.3. Heading eases toward velocity (`HEADING_EASE`, `HEADING_MIN_SPEED`) so a jittering sheep can't spin.
- **Sheep-like realism layer** (see DESIGN_BIBLE §1 "Sheep-like realism", refs Strömbom 2014 / Ballerini 2008 / Couzin 2002 / Hamilton 1971): `TOPO_K`, `REJOIN_MIN_NEIGHBORS`, `W_REJOIN` (topological rejoin — strays sprint back, group shearing preserved); `REAR_WEIGHT` (blind-rear elongation); `W_NOISE` (anti-crystallisation); `PANIC_COHESION_GAIN` (selfish-herd bunching); `BODY_SIZE_MIN/MAX` (de-overlap lattice break). These are the main "make it feel like sheep" dials to iterate on next.

**Pen enclosure:** penned sheep collide against a *separate* wall set (`level.pennedWalls`) — the full pen boundary with inward normals (gate included) — so they can never be pulled out, even by a flock cohering just outside the fence. Unpenned sheep + the dog use `level.walls` (fence blocks from outside, gate open). Built in `src/state/level.ts`.

## Performance

500 sheep ~3–4 ms/step — a roughly CONSTANT floor (idle≈panic), because the flock packs tight (~40 neighbours each) so every step does dense neighbour scans. **Sim runs at 120 Hz** (not 240) so a 120 fps display does one sim step per rendered frame instead of two. Even so, that ~3.8 ms floor leaves little 120 fps headroom and a full-panic flock tipped the vsync tiers (120→60→30), so the **render loop is capped to a stable 60 fps** (`RENDER_FPS_CAP` in `data/tuning.ts`; 16.6 ms/frame = 2 sim substeps + render ≈ 10 ms, smooth and steady). The real fix — **GPU compute for thousands of sheep at 120 fps**, using `~/Work/Petriarch`'s WebGPU playbook — is a logged epic in **`docs/BACKLOG.md`** (not now). 1000 sheep (~5–13 ms/step depending on machine noise) exceeds single-thread realtime — an explicit **stretch** goal, logged not gated in the perf test. The two hot per-sheep sweeps (panic propagation, flocking) are the dominant cost.

## What's next (prioritized)

1. **Tuning pass** — a playtest activity on the dials above, in scope order: dog:sheep ratio → awareness radius → decay vs propagation → approach-angle weighting → funnel strength. Plus the stalk-idle / prone feel.
2. **Shift-click cone big-bark** — the one deferred combat verb; bark plumbing already exists, add a wider directional variant with a longer cooldown.
3. **Dynamic zoom** — out when the flock is spread, in when tight; layers onto the existing camera follow.
4. **Level select / progression** — cycle between the shipped levels in-game; then author more `data/levels/` maps (mazes, chutes, wild layouts) — pure data, no sim work.
5. **Only if observed:** gate flow-cap queuing if the throat actually jams under heavy flow.

## Tests (what's covered)

`test/`: determinism (10k steps, identical hashes), spatial-hash vs brute force, geometry, panic decay/propagation/threshold, and `smoke.test.ts` invariants — finite/in-field under clumsy driving, scatter-and-recover, penning + win, gate no-leak, no deep body overlap, obstacle blocks sheep, and a 500/1000 perf log.
