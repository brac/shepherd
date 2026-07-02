# PHASE_1_PLAN — shepherd

The concrete implementation plan for the Phase 1 vertical slice described in `PHASE_1_SCOPE.md`. Read `DESIGN_BIBLE.md` for the sim model and `CLAUDE.md` for the architecture rules this plan obeys.

## Stack & scaffold

- **Vite + TypeScript (strict) + PixiJS v8**, **vitest** for headless sim tests.
- Sim (`src/state`, `src/sim`, `data/`) must never import Pixi — it runs headless for tests.

## File map

```
package.json, tsconfig.json (strict), vite.config.ts, index.html
data/
  tuning.ts           every constant, named + commented (placeholder values)
  levels/level1.ts    rectangular field, pen + gate, spawn region, sheepCount, seed
src/
  state/gameState.ts  GameState type + createGameState(level, seed)
  sim/rng.ts          mulberry32; nextFloat/nextRange — the ONLY randomness source
  sim/spatialHash.ts  uniform grid: rebuild + 3x3 neighbor iteration
  sim/geometry.ts     segment closest-point, point-in-polygon, polygon->wall segments
  sim/spawn.ts        seeded spawn into spawn region
  sim/dog.ts          dog intent -> eased movement, states, bark timer, collision
  sim/panic.ts        injection, propagation (double-buffered), decay, flight threshold
  sim/flocking.ts     boid terms + fear + flee + graze; integrate; per-sheep hot loop
  sim/collision.ts    push-out along normal + slide (sheep & dog vs walls)
  sim/gate.ts         funnel attractor, penned detection, circulate-to-back, win check
  sim/step.ts         one 1/240 s step — fixed order of the above
  input/input.ts      pointer events -> InputState (trot/prone/stalk/bark intent)
  render/renderer.ts  Pixi app + view registry
  render/fieldView.ts field boundary, pen, gate from polygon data
  render/sheepView.ts ParticleContainer, pre-baked irregular oval textures
  render/dogView.ts   placeholder shape; color/shape per state (trot/prone/stalk/bark)
  render/hudView.ts   "Penned: N / 500" + WIN banner + dev sim-ms overlay
  render/camera.ts    world->screen transform, follow + velocity lookahead
  loop.ts             rAF + accumulator @ 240 Hz + interpolation alpha
  main.ts             wire everything
test/
  determinism.test.ts, spatialHash.test.ts, geometry.test.ts, panic.test.ts
```

## Core data structures

**GameState** (single mutable object; sheep as SoA):

```ts
{
  seed, rng: { s: number },        // mulberry32 state lives IN GameState
  tick, simTime,                   // simTime = tick * DT, never wall clock
  sheep: {
    count,
    posX, posY, prevX, prevY,      // Float32Array(count); prev = snapshot at step start
    velX, velY, heading,           // Float32Array
    panic, panicNext,              // Float32Array — double buffer for propagation
    dogAwareTime,                  // Float32Array — for surprise attenuation
    grazeTimer,                    // Float32Array — next seeded wander decision
    flags,                         // Uint8Array: bit0 FLEEING, bit1 PENNED
  },
  pennedCount, won,
  dog: { x, y, prevX, prevY, velX, velY, facing,
         state: 0|1|2,             // TROT | PRONE | STALK
         barkCooldown, barkTimer },// barkTimer>0 -> transient bark radius active
  input: { mouseWorldX, mouseWorldY, leftDown, dragging, barkQueued },
  camera: { x, y, prevX, prevY, zoom },
  level: {                         // built once at load (allocation OK here)
    fieldPoly, penPoly, gate: {ax,ay,bx,by, inwardNx,inwardNy},
    spawn: {x,y,w,h}, sheepCount,
    walls: Float32Array,           // flat [ax,ay,bx,by,nx,ny]* — field + pen minus gate
    gateWall,                      // gate segment as a wall — collides ONLY penned sheep (one-way)
    penBackX, penBackY,            // circulate-to-back attractor point
    funnelX, funnelY,              // point just inside gate; funnel steers toward it
  },
  grid: { cellSize, cols, rows, heads: Int32Array, next: Int32Array },
}
```

**Spatial hash** = linked-lists-in-arrays: `heads[cell] = first sheep index or -1`, `next[i] = next sheep in same cell`. Rebuild each step: `heads.fill(-1)` then insert all sheep by `prev` position. Queries iterate the 3x3 cell block inline in the hot loop — no neighbor lists materialized, zero allocation. `cellSize = awarenessRadius` so 3x3 covers the radius.

**Snapshot trick:** at the top of each step, copy `pos -> prev` and swap the panic read/write buffers (`Float32Array.set`, no alloc). All neighbor reads (cohesion, alignment, propagation) read the snapshot; writes go to current. This gives order-independent, deterministic updates AND the prev-state needed for render interpolation, for free.

## Sim step order (fixed — this is the determinism contract)

`stepSim(state, dt)` in `sim/step.ts`:

1. Snapshot: `prevX/Y <- posX/Y`, dog/camera prev <- current; panic read/write roles swap.
2. Dog: resolve input intent -> state (trot/prone/stalk), ease velocity toward target, integrate, collide with walls; tick bark cooldown/timer; consume `barkQueued`.
3. Rebuild spatial hash from `prevX/prevY`.
4. **Panic pass** (per sheep, index order): decay (exponential) -> dog injection (angle x speed x surprise x proximity, using state-dependent fear radius; bark = transient radius spike + burst) -> propagation from neighbor snapshot panic with proximity falloff -> clamp [0,1] -> set/clear FLEEING with hysteresis (set >= flightThreshold, clear < flightThreshold - hysteresis); update dogAwareTime.
5. **Move pass** (per sheep, index order): single loop —
   - PENNED: cohesion/separation among penned + gentle pull to penBack; gate wall solid.
   - FLEEING: desired = away-from-dog at fleeSpeed; separation still on; align/cohesion damped.
   - else: separation + alignment + cohesion (neighbors within awareness only) + fear (away from dog, scaled by proximity/state) + funnel pull (near gate, unpenned) + graze wander (only if panic ~ 0, dog outside awareness, no fleeing neighbor seen this query).
   - Weighted sum -> clamp steer force -> integrate vel -> clamp speed (max scales calm->panicked) -> integrate pos -> wall collision (push-out + slide) -> heading follows velocity.
6. Pen accounting: for unpenned sheep near the gate, point-in-polygon test against pen -> set PENNED, pennedCount++. `won = pennedCount === count`.
7. Camera: ease toward `dog.pos + lookahead x dog.vel`.
8. `tick++`.

No allocation anywhere in steps 3–6. No `Math.random()`, no `Date.now()` — `state.rng` and `simTime` only.

## Key algorithms (the decisions worth writing down)

- **Loop (`loop.ts`):** rAF; `acc += min(frameDelta, 0.25s)`; `while (acc >= DT) stepSim(...)`; `alpha = acc/DT`; `render(state, alpha)` lerps prev->current for sheep, dog, camera. `DT = 1/240`.
- **Collision:** for each moving body, brute-force all wall segments (Phase 1 has < ~20). Closest point on segment; if `dist < radius`: push out along normal to surface, then remove the into-wall velocity component (`v -= min(0, v·n) n`) so residual velocity slides along the tangent — this is what routes fence-pinned sheep to the gate. Dog uses the same routine. Gate opening is simply absent from `walls`; `gateWall` is tested only for PENNED sheep (one-way gate = no leakage).
- **Panic injection:** `inject = baseInject x speedFactor(|dogVel|/trotSpeed) x angleFactor(dot(dogVel_hat, toSheep_hat)) x surprise(dogAwareTime) x falloff(dist/fearRadius) x dt`. `surprise` lerps 1 -> habituatedMin over habituationTime; `dogAwareTime` accrues inside awareness, resets after awareResetTime outside. Prone injects ~0 but keeps a short-range repulsion (soft wall). Bark: while `barkTimer > 0`, fear radius = barkRadius and a one-shot panic burst is applied.
- **Propagation:** `panic[i] += Σ neighbors (snapshotPanic[j] > propagateMin) x propagationRate x (1 - d/awareness) x dt`, clamp 1. Reads snapshot => symmetric and order-independent.
- **Grazing:** per sheep `grazeTimer` counts down; on expiry draw (seeded) a small heading drift + dwell time; speed <= grazeSpeed, often ~0. No separate state — it's just the low-panic branch.
- **Input (`input/input.ts`):** pointer events write intent only; sim consumes it in step 2.
  - move -> trot target (screen->world via camera each event).
  - left down + move > dragThresholdPx -> **stalk** (creep toward mouse at stalkSpeed); release -> trot.
  - left down+up with no drag -> **prone**: dog stops, facing snaps to nearest sheep (spatial hash query). Prone exits when the mouse moves farther than proneExitDist from the dog (or on next left-click). *This exit rule is a feel decision — first tuning candidate.*
  - right-click -> `barkQueued = true` (consumed once, respects barkCooldown). Moving and barking are independent.
  - Shift-click big-bark: **deferred** per scope.
- **Funnel:** for unpenned sheep within funnelRadius of the gate midpoint (and on the outside), add steering toward funnel point just inside the gate, strength x (1 - d/funnelRadius). Soft current, not a rail. Flow-cap queuing: **only if jamming is observed** (per scope).
- **Camera/render:** axis-locked, fixed zoom in Phase 1 (constant world-scale framing ~1/3 of the field), translate-only follow with `lookaheadTime x dogVel`. Sheep: **ParticleContainer** + ~8 pre-baked irregular-oval textures (seeded irregularity at init), variant = `i % 8`, per-frame update of x/y/rotation from interpolated state. Views read state, never write.

## `data/tuning.ts` — initial placeholder values

All numbers are starting guesses, named exports with comments; the tuning pass is where they get real. Highlights: `SIM_HZ 240`; field 2000x1200 px; sheep radius 5, walk 55, flee 110, graze 8 px/s; awareness 80, separation 18; weights sep 1.5 / align 0.6 / cohesion 0.9 / fear 2.5; dog trot 170, stalk 45, ease 4/s; fear radii trot 160 / stalk 100 / prone 50; bark radius 220, burst 0.35, cooldown 2 s; flightThreshold 0.6, hysteresis 0.15, decayRate 0.6/s (exponential), propagationRate 0.5/s, habituationTime 3 s; funnelRadius 140, funnelStrength 1.2; penBackStrength 0.4; dragThreshold 6 px; lookahead 0.35 s.

## Build order (each milestone runs & is verifiable)

1. **Scaffold** — Vite+TS+Pixi+vitest, folders, empty Pixi canvas renders.
2. **Core** — `rng`, `tuning`, `GameState` factory, `loop.ts`; unit test: mulberry32 reproducibility.
3. **Level + static render** — `level1.ts`, geometry helpers, spawn 500 sheep, draw field/pen/gate/sheep, fixed camera. *See: a field with a dotted flock.*
4. **Hash + boids + collision** — spatial hash, sep/align/cohesion, grazing, wall slide. *See: flock coheres, drifts, respects fences. Verify: 500 sheep frame budget now.*
5. **Dog** — input state machine, eased movement, trot/prone/stalk visuals, camera follow. *See: dog handles well; no fear yet.*
6. **Panic + fear + flee** — injection/propagation/decay, flight threshold, bark. *See: head-on scatters, flanking pressures, prone holds, scatter recovers in seconds.*
7. **Gate + pen + win** — funnel, one-way penning, circulate-to-back, counter, win banner. *See: full loop playable start->win.*
8. **Determinism test + perf + tuning pass.**

## Verification (maps to PHASE_1_SCOPE definition of done)

- **Determinism (DoD 8):** vitest — build state from seed, drive 10 000 steps with a scripted dog-intent sequence (no real input), hash all SoA arrays; run twice + across module reload -> identical hashes.
- **Perf (DoD 1):** dev overlay shows sim ms/step and FPS; 500 sheep must hold budget; re-run with `sheepCount: 1000` (data-only change) as the stretch check.
- **Feel checks (DoD 2–5, 7) — manual playtest:** shear the flock -> two blobs form and later remerge (zero split/merge code); head-on vs flank at same distance -> different panic; prone against a group -> holds; drive to gate -> threads it, penned sheep drift back, mouth stays clear.
- **Win (DoD 6):** pen all 500 -> banner fires exactly when `pennedCount === 500`.
- **Unit tests:** spatial hash (insert/query vs brute force), point-in-polygon, segment push-out, panic decay/propagation math.

## First tuning pass (in scope order, after milestone 8)

1. Dog:sheep speed ratio (can you flank?) 2. Awareness radius (shear/strand feel) 3. Decay vs propagation (dramatic but recoverable) 4. Approach-angle weighting (flanking meaningfully gentler) 5. Funnel strength (threads without vacuuming). Plus the prone-exit rule.

## Guardrails (from CLAUDE.md — restated)

No per-sheep objects; no allocation in the hot loop (no temp vectors/closures/array methods); no `Math.random()`; no sim logic in views; no hardcoded tunables; grid is bookkeeping only — never snaps positions, never rendered; no flock object or group ids, ever.
