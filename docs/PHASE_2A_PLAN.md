# Phase 2A Implementation Plan — Flock Aliveness

> Status: **approved, not yet started.** This is the execution plan for `PHASE_2A_FLOCK_ALIVENESS.md`. Implementation begins at M0 when picked up.

## Context

Phase 1 shipped a playable, deterministic herding sim: a mouse-driven dog herds 500 SoA boids through a gate into a pen, with panic/flee, hard bodies, a topological-rejoin realism layer, and a win condition (`docs/STATUS.md`). The problem Phase 2A solves is stated in `docs/PHASE_2A_FLOCK_ALIVENESS.md`: *"minute-to-minute is good but flat."* When the player isn't actively herding, the flock reads as a static, synchronized mass. 2A adds **emergent aliveness** — activity states, startle waves, per-sheep trait variation, grazing clusters, terrain pooling, lead-sheep chains, worn paths — every one an emergent consequence of per-sheep rules over existing state, never a script or a "flock" object.

**Definition of done (from the spec):** leave the dog still for 60 s and the flock stays interesting — clusters shifting, a stray returning, an occasional bird-startle ripple crossing and fading, sheep lying down and rising, the mass slowly pooling toward shade. If the idle flock looks static *or synchronized*, the phase isn't done.

**Scope:** full Phase 2A — all six behavior groups including the "nice, not essential" lead-sheep (§2.4) and worn paths (§2.6). Plus **minimal, throwaway-friendly render/debug hooks** so behavior is observable and tunable now; full beauty is Phase 2B.

**Architecture contract (CLAUDE.md — non-negotiable):** single mutable `GameState`; sheep as SoA typed arrays; **zero allocation** in per-sheep hot loops (hand-written index loops); seeded `mulberry32` only (never `Math.random()`); all tunables in `data/tuning.ts`; no flock object / no split-merge tracking (cohesion stays local); determinism = fixed iteration order + seeded PRNG + no wall-clock in sim.

---

## Grounding in real sheep data

Three web-research passes pulled citable numbers from the primary literature. Two scaling rules translate them into this sim's units:

- **Spatial scale ≈ 11 px/m.** `SEPARATION_RADIUS` = 18 px maps almost exactly to Strömbom 2014's agent-repulsion distance `r_a` = 2 m, and `SHEEP_COLLIDE_DIST` = 11 px ≈ a 1 m sheep body. So **spatial magnitudes** (cluster radius, pooling radius, startle radius, follow cone) are grounded by `metres × 11`.
- **Speeds are gamey; time is compressed.** `SHEEP_WALK_SPEED` = 78 px/s ≈ 7 m/s is far above a real 1.1 m/s walk — Phase 1 deliberately runs "fast-forward" for pace. So **durations** are compressed (~100×) but keep real *proportions* (a rest bout ≈ 2× a graze bout; alert lasts seconds; the startle wave outruns the sheep). We do **not** rebalance the shipped boid weights — 2A is purely additive.

| Behavior | Real datum (cited) | Sim value | Source |
|---|---|---|---|
| Force ordering | separation ≫ cohesion ≳ dog-repulsion (ρ_a:c:ρ_s = 2:1.05:1); cohesion ≥ threat so sheep bunch *toward* the flock | Existing `W_SEPARATION 1.5 > W_COHESION 0.9`; keep new pooling/cluster/follow weights *weaker* than these | Strömbom 2014, *J.R.Soc.Interface* 11:20140719 |
| Topological neighbours | ~6–7 nearest, density-independent; blind rear sector | Already `TOPO_K=6`, `REAR_WEIGHT=0.4` (validates existing layer) | Ballerini 2008, *PNAS* 105:1232 |
| Startle/agitation wave speed | ~13.4 m/s (starlings, outruns the flock); neighbour reaction latency ~0.4 s (fish) | `WAVE_SPEED ≈ 140 px/s` (~12.7 m/s); rest rise-delay 0.4 s | Attanasi 2015 PMC4564680; Herbert-Read 2015 PMC4448869 |
| Sub-group (cluster) structure | fission-fusion; most-frequent sub-group **12 sheep**; reshuffles over minutes; **social, not resource-driven** (R=−0.02) | `GRAZE_SATISFIED_N ≈ 8` companions → cohesion saturates; clusters form/dissolve over ~tens of s (compressed) | Ferdous/Sankey 2023, *R.Soc.Open Sci.* 10:230402 |
| Follow-the-leader | one temporal leader, single-file; **95 % follow within ~12 s**; leader role rotates | FOLLOW cone ahead, weak alignment boost; leader emerges, shifts | Gómez-Nava 2022 *Nat.Phys.* 18:1494; Pillot 2011 PLoS ONE e14487 |
| Rest / activity budget | graze bout 20–90 min, rest bout 45–90 min, ~20–30 % of daylight resting | `REST_ONSET 20–60 s` (spec), `REST_DURATION 30–90 s` (≈2× graze, compressed) | MSD Vet Manual; "Principles of sheep behaviour" 2025 |
| Vigilance / isolation | lone sheep measurably more aroused (HR spike, +28 bpm visual isolation); alert stare median ~17 s | Stray → `ACT_ALERT` + small arousal bump; ALERT resolves in seconds | Michelena 2011 PMC3078120; bighorn *Anim.Behav.* 2024 |
| Flight zone | reacts ~65–70 m out; contracts to centroid under threat (selfish herd) | Already `FEAR_RADIUS_TROT 160` etc + `PANIC_COHESION_GAIN 1.6` (validates existing) | King 2012 *Curr.Biol.* 22:R561; Hamilton 1971 |
| Individual temperament | heritable & repeatable (r≈0.1–0.4); breeders select calm-vs-nervous lines; distribution skewed calm (99 freeze / 14 active of 220) | Per-sheep `skittish/speedMul/restBias/wanderMul`, skewed toward calm | Merino temperament genetics 2011; *Animals* 2024 PMC10778033 |
| Terrain pooling / camping | ~64 % of time camped on highest ground; shade-seeking; piosphere rings; migrates over a grazing day | Per-level weak attractors, active only at low panic; slow drift | MSD Vet Manual; Hilder 1966; Andrew 1986 |
| Worn paths | livestock trails persist; recovery weeks→a year | Coarse trample grid, slow decay (~100 s compressed), purely visual | Mwendera 2010; Ross 2024 |

Full source URLs live in the research appendix at the end of this plan.

---

## Architecture changes (shared across all features)

### New SoA arrays on `SheepPool` (`src/state/gameState.ts`)
Extend the pool + `createSheepPool()`. All `Float32Array(count)` unless noted; follow the existing `bodyR` precedent.

- `activity: Uint8Array` — one of `ACT_GRAZE=0 | ACT_REST=1 | ACT_ALERT=2 | ACT_FOLLOW=3`. Orthogonal to `FLAG_FLEEING` (panic still owns flight).
- `panicAge` — seconds since this sheep's panic last crossed `PANIC_PROPAGATE_MIN` (drives the wave front; §Startle).
- `restTimer` — counts down to a possible GRAZE→REST transition; on rest, repurposed as the rest-duration / rise-delay clock.
- `strayTimer` — seconds spent stranded (drives the drift-then-hurry ramp; §Lone-sheep).
- **Trait constants (seeded once in spawn, never mutated):** `skittish`, `speedMul`, `restBias`, `wanderMul`, `idlePhase` (last one is for 2B breathing; seed now).

New activity/flag constants exported from `gameState.ts` (`ACT_GRAZE` etc.).

### New state on `GameState`
- `ambient` — a tiny fixed-capacity ambient-startle pool (birds/gusts): `startleX/Y/mag/ttl: Float32Array(MAX_ACTIVE_STARTLES)`, `birdCountdown`, `gustCountdown`, `windAlert`. Allocated once in `createGameState`.
- `trample` — coarse traffic grid: `{ cellSize, cols, rows, minX, minY, val: Float32Array }`, sized from field bounds like `createGrid`, allocated once.

### Step-order changes (`src/sim/step.ts` — the determinism contract)
Two new passes at fixed positions; everything else folds into existing passes:

```
1. snapshot (unchanged: prev<-pos, panicPrev<-panic)
2. updateDog
3. rebuildGrid
3.5 updateAmbient      ← NEW: advance bird/gust timers, seed startle emitters (uses state.rng)
4. updatePanic         ← +apply ambient startle pulses, track panicAge, wave-front gating, skittish trait
5. updateFlocking      ← +activity transitions, REST/ALERT/FOLLOW movement, graze clusters, stray polish, pooling, lead-sheep, traits
6. resolveOverlap
6.5 updateTrample      ← NEW: accumulate sheep+dog traffic, slow decay
7. updatePenning
8. camera / 9. clock
```

**Why activity lives inside `updateFlocking`, not a new pass:** the flocking loop already computes `cohN`, `sawPanicNeighbor`, and `dogD2` per sheep — exactly the signals activity transitions need. Folding transitions in avoids a second neighbor scan (perf), and the movement branch reads the activity it just set. Ambient (needs to run *before* panic) and trample (needs final positions) are the only genuinely separate passes.

### Determinism
- Any new `state.rng` draw (trait seeding in spawn; bird timing/position in `updateAmbient`) advances the shared stream — fine, but must be **fixed-order**. Trait seeding goes in a fixed block in `spawnSheep`; ambient draws happen at one fixed point per step.
- Add the new SoA arrays (`activity`, `panicAge`, `restTimer`, `strayTimer`, traits) to `hashState()`'s `mix()` calls in `test/determinism.test.ts` so determinism coverage includes them. (Trample grid is deterministic but large — cover it with a dedicated test instead of hashing every cell.)
- The two-instance determinism test passes as long as both runs stay identical; adding draws shifts hashes but not equality.

### Minimal render/debug hooks (Phase 2B does the real visuals)
- `src/render/sheepView.ts`: read `activity[i]` in `update()`. REST → flatten (enable `dynamicProperties.scale`, set `scaleY≈0.7`) + dim tint; ALERT → subtle tint shift; FOLLOW → no change. Cheap, disposable.
- New `src/render/debugView.ts` (a `Graphics` child of `world`, toggled by a `debug` flag): draws pooling-attractor circles, active bird-startle rings, and optionally the trample heatmap; can recolor sheep by activity. Toggle via a `keydown` (e.g. `D`) in `src/main.ts` setting a module/state flag. Registered in `renderer.ts` after `SheepView`.

---

## Feature implementation (in spec priority order §5)

Each is additive and independently shippable. Weights stay **weaker than the shipped boid terms** so aliveness never overrides herding.

### M0 — Foundation
Add the SoA arrays, trait seeding, activity enum, `ambient` + `trample` state, hash updates, and render-hook scaffolding (activity tint + empty `DebugView`). No behavior change yet; `npm test` + `npm run build` stay green. This unblocks every milestone.

**Trait seeding** (`src/sim/spawn.ts`, fixed block after `bodyR`): draw each trait from `state.rng`. Skew skittishness toward calm to match the observed distribution: `skittish = SKITTISH_MIN + (SKITTISH_MAX-SKITTISH_MIN) * u*u` (most sheep placid, a few jumpy). `speedMul ∈ [0.9,1.1]`, `restBias ∈ [0.5,1.5]`, `wanderMul ∈ [0.6,1.4]`, `idlePhase ∈ [0,2π)`, `restTimer` seeded to `REST_ONSET_MIN..MAX × restBias` so onsets are staggered from t=0 (anti-sync).

### M1 — Startle wave (spec §2.2, §3) — the single highest-value behavior
**Propagation delay via a wave front (`src/sim/panic.ts`).** The existing propagation reads the `panicPrev` snapshot and jumps instantly. Add O(1) per-sheep state instead of a heavy history ring (a true ring would need ~130 slots at 240 Hz):
- Track `panicAge[i]`: `+= dt` while `panic[i] > PANIC_PROPAGATE_MIN`, else reset to 0.
- In the neighbor propagation loop, a neighbor `j` only contributes if its panic has had time to travel the distance: `panicAge[j] * WAVE_SPEED >= dist`. Below that, skip it. This makes panic radiate outward from a source at `WAVE_SPEED` (~140 px/s ≈ 12.7 m/s, Attanasi 2015) — a *visible ripple* — while the existing proximity falloff + decay make it **fade as it travels and die out partway** through a large flock (spec's explicit requirement). Zero new allocation.

**Ambient startle sources (`src/sim/ambient.ts`, new `updateAmbient` pass).**
- **Birds:** `birdCountdown` drawn from `[BIRD_INTERVAL_MIN, BIRD_INTERVAL_MAX]` (≈6–16 s, seeded). On fire, pick a seeded sheep index and offset → an active startle emitter (`startleX/Y`, `mag=BIRD_STARTLE_MAG`, `ttl≈0.3 s`) in the fixed-capacity pool.
- `updatePanic` applies active emitters exactly like the existing bark burst (`p += mag * (1 - dist/radius)`), so the pulse enters the same panic path and thus the same wave machinery. Keep `BIRD_STARTLE_MAG` mild (~0.3) so at the falloff edge only the nearest few sheep might cross the 0.6 flight threshold — a pretty ripple, never a scatter (spec).
- **Wind gusts:** `gustCountdown` (≈20–45 s) raises a decaying global `windAlert` that biases nearby GRAZE sheep toward ALERT briefly. Lowest-effort item; keep gentle.
- **Dog moves** already inject via the panic model — no new work; ambient just uses the same injection path so all waves read consistently (spec §3).

**ALERT state** (in `updateFlocking`): a GRAZE sheep whose panic is in a low band (below flight threshold but above a small `ALERT_PANIC`) or that `sawPanicNeighbor` → `ACT_ALERT`: stop, face the disturbance, hold for a seeded short duration, then resolve back to GRAZE or escalate to fleeing. This is the visible "did you hear that?" beat as the wave passes.

### M2 — Anti-uniformity traits wired in (spec §4) — without this, everything looks synthetic
Consume the M0 traits:
- `skittish[i]` multiplies dog + ambient panic injection in `updatePanic` (jumpy sheep spike first, seeding wave asymmetry).
- `speedMul[i]` scales `SHEEP_WALK_SPEED` / `SHEEP_FLEE_SPEED` in `integrate`.
- `wanderMul[i]` scales graze wander magnitude and dwell time.
- `restBias[i]` scales rest onset (§M4).
- Verify **nothing transitions in lockstep**: staggered seeded timers + per-sheep traits + existing `W_NOISE`. The "not synchronized" test (below) guards this.

### M3 — Grazing clusters that form and dissolve (spec §2.3)
Idle sheep currently settle into one even blob. Make sub-groups emerge via **saturating graze cohesion** (`src/sim/flocking.ts`, GRAZE branch only):
- Count close companions within `GRAZE_CLUSTER_RADIUS` (~55 px ≈ 5 m). If `< GRAZE_SATISFIED_N` (~8, → ~12-sheep sub-groups per Ferdous 2023), add a weak pull `W_GRAZE_COHESION` (~0.35, below wander) toward the local grazing centroid; if satisfied, drop it. So a well-companioned clump feels no outward pull and can drift free of other clumps, while lonely grazers re-clump. Combined with per-sheep `wanderMul` desync, clusters form, loiter, and dissolve over tens of seconds — no group ids, purely local. **Flag: the feel-sensitive dial of this phase; tune in playtest.**

### M4 — Rest state + lone-sheep return (spec §1 REST, §2.1)
**REST (`src/sim/flocking.ts` activity machine):** a sheep GRAZE-calm and undisturbed for `restTimer` (seeded 20–60 s × `restBias`) may transition GRAZE→REST (probabilistic per-sheep, staggered). REST: `maxSpeed≈0`, heading held. Rises when `panic > REST_WAKE_PANIC` (~0.12), or `sawPanicNeighbor`, or dog within awareness — but with a `REST_RISE_DELAY` (~0.4 s, the fish-latency beat) before it can flee, producing natural **laggard drama**. On rising, reset to GRAZE and reseed `restTimer`. Renders flatter (M0 hook).

**Lone-sheep return polish (extends existing topological rejoin):** the rejoin force already pulls strays back. Make it *read* as notice-then-hurry:
- `strayTimer[i] += dt` while `cohN < REJOIN_MIN_NEIGHBORS`, else reset.
- Ramp the existing `W_REJOIN * iso` weight from ~0 to full over `STRAY_RAMP_TIME` (~0.7 s) → the stray drifts, then hurries (not a tractor beam, per spec).
- Set `ACT_ALERT` and a small self-arousal bump (`STRAY_AROUSAL` ~0.1, below flight) while stranded — grounded in the measured arousal of isolated sheep (Michelena 2011). Clears on rejoin.

### M5 — Terrain pooling (spec §2.5)
Give the undisturbed flock somewhere it "wants" to be so it migrates instead of freezing:
- `LevelDef.poolingAttractors?: { x, y, strength, radius }[]` (new optional field, mirrors the existing `obstacles?` precedent). Parse onto `Level` in `buildLevel` (like `funnelX/Y`).
- In `updateFlocking`, for **low-panic** sheep only (`panic < POOL_PANIC_MAX` ~0.1), add a very weak pull `W_POOL` (~0.25, below wander) toward the nearest active attractor within its radius. Result: a slow drift/re-pool over tens of seconds — glance away, glance back, it has moved.
- Author 1–2 attractors into `data/levels/level1.ts` and `level2.ts` (e.g. a shade corner; on level2, the boulder's lee). Pure data.

### M6 — Lead-sheep + worn paths (spec §2.4, §2.6) — "last, nice not essential"
**Lead-sheep / FOLLOW (`src/sim/flocking.ts`):** while a sheep is *moving* (not grazing, not hard-fleeing) and has a neighbor within a forward cone (`FOLLOW_CONE` cos≈0.82 → ±35°, `FOLLOW_RANGE` ~60 px), add extra alignment+cohesion `W_FOLLOW` (~0.6) toward that leader and set `ACT_FOLLOW`. Sheep chain single-file behind whoever is ahead; the leader is emergent and shifts (Gómez-Nava 2022). Falls out of the same neighbor scan (track nearest in-cone neighbor there). Bonus: improves gate threading for free.

**Worn paths / trample (`src/sim/trample.ts`, new `updateTrample` pass):** a coarse `trample` grid (`TRAMPLE_CELL` ~32 px). Each step add `TRAMPLE_ADD` to the cell under every sheep (dog ×4), clamp to `TRAMPLE_MAX`, and decay all cells by `TRAMPLE_DECAY` (~0.01/s → ~100 s fade, a compressed weeks-scale recovery). **Purely visual, no behavior feedback** (spec). Rendered as discolored grass in 2B; a debug heatmap now.

---

## Verification

Extend `test/smoke.test.ts` (invariant style) + add `test/aliveness.test.ts`. Dog is "removed" by teleporting to `-100000` (existing idiom). All headless, deterministic.

1. **Determinism holds** — two instances still hash-equal after `drive(5000)` with the new arrays added to `hashState`.
2. **Idle flock stays alive** — park dog far, run 60 s (14 400 steps); assert per-sheep displacement variance and small centroid drift exceed a "not static" threshold. (Core DoD.)
3. **Not synchronized** — over the same run, the `activity` histogram is never single-valued and rest/alert transition times are spread (anti-sync guard, spec §4).
4. **Startle wave expands then fades** — inject one bird startle at a point; the set of `panic > threshold` sheep grows in radius over frames, then shrinks, and never engulfs the whole flock.
5. **Rest works** — after idle time some sheep enter REST and later rise; a resting sheep in a passing startle's path rises (with the delay).
6. **Traits vary & matter** — trait arrays show spread; two sheep at equal distance respond differently to the same pulse.
7. **Clusters form** — after idle time, local-density variance is multimodal (sub-groups exist), not a uniform blob.
8. **Pooling drifts** — idle flock centroid moves measurably toward an authored attractor.
9. **Trample accumulates + decays** — cells under traffic rise then fall after traffic stops.
10. **Perf budget held** — re-run the 500/1000 perf log; assert new work (two O(sheep) passes + folded per-sheep terms) keeps within the existing single-thread 240 Hz budget.

**Manual/observability:** `npm run dev` → http://localhost:1574; use the `/screenshot` skill; toggle the debug overlay (`D`) to see attractors, bird startles, activity coloring, and the trample heatmap; leave the dog idle 60 s and watch for the DoD checklist. Phase 2A + 2B share the ultimate acceptance test (a startle wave crossing the flock looks *mesmerizing*) — that lands in 2B; here we verify the wave *exists and reads*.

---

## Build order & milestones

`M0 foundation → M1 startle wave → M2 traits → M3 clusters → M4 rest+lone-return → M5 pooling → M6 lead-sheep+trample.`

Each milestone: implement → add its test → `npm test` + `npm run build` green → `/screenshot` verify → tune the new dials. Milestones are independently shippable, so the phase can pause after any of them with a coherent result. Commit per milestone (`feat: …`).

All new tunables land in `data/tuning.ts` under new header sections matching the existing style — `// ---- Activity states ----`, `// ---- Startle sources ----`, `// ---- Grazing clusters ----`, `// ---- Rest ----`, `// ---- Terrain pooling ----`, `// ---- Lead-sheep ----`, `// ---- Trample ----` — each const with an inline rationale and, where grounded, the source.

## Risks & mitigations
- **Determinism drift** — keep every new RNG draw fixed-order; add new arrays to the hash; the two-instance test catches regressions.
- **Perf** — two new passes + heavier per-sheep loop; stay zero-alloc, reuse the 3×3 neighbor scan already in flocking, re-check the perf log each milestone.
- **Tuning/feel** — clusters (M3) and pooling (M5) are the sensitive dials; keep their weights below the graze wander, and gate pooling/clusters to low panic so they never fight herding. Flag both for playtest.
- **Sync tells** — the #1 fake look is a flock that flips states together; traits + staggered seeded timers + the explicit "not synchronized" test defend against it.
- **Scope** — full 2A is large; the milestone structure keeps every step green and shippable.

---

## Research appendix (primary sources)
- Strömbom et al. 2014, *J.R.Soc.Interface* 11:20140719 — https://royalsocietypublishing.org/doi/10.1098/rsif.2014.0719
- Ballerini et al. 2008, *PNAS* 105:1232 — https://doi.org/10.1073/pnas.0711437105
- King et al. 2012, "Selfish-herd behaviour of sheep under threat," *Curr.Biol.* 22:R561 — https://www.cell.com/current-biology/fulltext/S0960-9822(12)00529-5
- Hamilton 1971, "Geometry for the selfish herd," *J.Theor.Biol.* 21:295 — https://doi.org/10.1016/0022-5193(71)90189-5
- Ferdous/Sankey et al. 2023, fission–fusion in sheep, *R.Soc.Open Sci.* 10:230402 — https://pmc.ncbi.nlm.nih.gov/articles/PMC10354475/
- Gómez-Nava, Bon & Peruani 2022, *Nat.Phys.* 18:1494 — https://www.nature.com/articles/s41567-022-01769-8
- Pillot et al. 2011, scalable following rule, *PLoS ONE* 6:e14487 — https://pmc.ncbi.nlm.nih.gov/articles/PMC3016320/
- Ginelli et al. 2015, intermittent collective dynamics, *PNAS* 112:12729 — https://www.pnas.org/doi/10.1073/pnas.1503749112
- Attanasi et al. 2015, agitation waves in starlings (~13.4 m/s) — https://pmc.ncbi.nlm.nih.gov/articles/PMC4564680/
- Herbert-Read et al. 2015, escape waves / reaction latency, *R.Soc.Open Sci.* — https://pmc.ncbi.nlm.nih.gov/articles/PMC4448869/
- Michelena & Deneubourg 2011, Merino vigilance dynamics, *PLoS ONE* — https://pmc.ncbi.nlm.nih.gov/articles/PMC3078120/
- Merino temperament genetics 2011, *AABS* — https://www.sciencedirect.com/science/article/abs/pii/S0168159111002437
- Individually-tested temperament repeatability 2024, *Animals* — https://pmc.ncbi.nlm.nih.gov/articles/PMC10778033/
- Webber & Weber 2012, sheep movement speeds — https://giscenter.isu.edu/research/Techpg/LGD/pdf/SheepMovementSpeeds.pdf
- MSD/Merck Vet Manual, Behavior of Sheep — https://www.msdvetmanual.com/behavior/behavior-of-production-animals/behavior-of-sheep
- Hilder 1966 (sheep camping); Andrew 1986 piosphere, *Aust.J.Ecology* — https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1442-9993.1986.tb01409.x
