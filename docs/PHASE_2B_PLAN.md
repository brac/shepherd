# Phase 2B Implementation Plan — Rendering

> Status: **approved, not yet started.** This is the execution plan for `PHASE_2B_RENDERING.md`. Implementation begins at M0 when picked up. Written after Phase 2A shipped (M0→M6, all 36 tests green).

## Context

Phase 2A made the flock *behave* alive; 2B makes that aliveness *land visually*. The spec's goal: convincingly real at a glance and beautiful in motion — effort on the **mass and the light**, not any single sheep. The joint 2A+2B acceptance test: **a startle wave crossing the rendered flock looks mesmerizing.**

Current render stack (what 2B replaces/extends): `FieldView` is a flat grass fill + fence strokes drawn once; `SheepView` is a ParticleContainer of 8 baked irregular-oval textures, tinted by panic/activity, REST flattens `scaleY`; `DogView`/`HudView` minimal; `DebugView` (D) is the 2A observability overlay and stays as-is. The camera is translate-only at fixed `CAMERA_ZOOM`.

**Explicitly cut (spec):** flock-wide soft-alpha fleece-merge compositing. Do not build it. Feathered per-sheep edges are the blend mechanism.

**Architecture contract (CLAUDE.md — non-negotiable):**
- Views stay **dumb**: rendering reads `GameState`, never mutates it, never decides behavior. The sim must run headless-identical with every 2B view deleted.
- **Zero sim changes** except the two items the spec assigns to sim state: dynamic zoom (the camera pass already owns `camera.zoom`) and nothing else. Weather/time-of-day/wind visuals are *render-side only* and must not feed back into behavior.
- **Determinism untouched:** view-side randomness uses its own seeded `createRng` instances (existing precedent: `bakeTextures` uses `0xa11ce`), never `state.rng`, never `Math.random()`. The determinism test must pass unchanged at every milestone.
- **All tunables in data:** 2B constants (sun vector, palettes, motion amplitudes, cloud speed) live in a new `data/visuals.ts` — same rule as `data/tuning.ts`, kept separate so sim tuning stays clean. No inline magic numbers in views beyond trivial layout.

## Grounding (what sells realism at this scale, per spec)

1. **Shadows ground the flock** — one consistent sun for the whole scene is worth more than any per-sheep detail.
2. **Soft-material motion** — squash/jiggle/breathing, always per-sheep phase-offset. Synchronized motion is the #1 fake tell.
3. **The field does half the work** — real-looking ground under real light makes simple sheep read as real by association.
4. **Anti-uniformity carries extra weight** post fleece-merge cut: shade/size/dirt/phase variation is what stops 500 stickers.

---

## Architecture changes (shared across milestones)

### `data/visuals.ts` (NEW — the render tunables file)
- **Sun:** `SUN_AZIMUTH` (radians), `SUN_ELEVATION` → derived `sunDirX/Y` + `SHADOW_LENGTH`, `SHADOW_ALPHA`, `SHADOW_SOFTNESS`. One vector consumed by shadows, fleece shading, grass lighting, clouds. This single-source-of-truth is the whole consistency requirement.
- **Palettes:** fleece shade ramp (cream → grey → dirty) + rare-sheep table (`BROWN_SHEEP_CHANCE`, `BLACK_SHEEP_CHANCE`), grass base/patch values, worn-path tint.
- **Motion:** squash/stretch gains, jiggle lag, breathing amplitude/period ranges.
- **Mood:** time-of-day → sun-angle mapping, color-grade presets (clear/overcast), cloud layer params (count, scale, drift speed, darkness).
- **Camera:** zoom min/max, spread→zoom mapping, zoom ease rate (these graduate to `data/tuning.ts` since the sim camera pass reads them — see M6).

### Optional external textures (art drop-in, procedural is the reference)
2B renders **procedurally by default** (baked noise + sprite tricks), but every texture-backed layer first checks for an **optional external asset** and uses it if present. So an artist can drop a `grass.png`, `fleece.png`, `shadow.png`, `cloud.png`, etc. into `assets/textures/` and the renderer picks it up with no code change; if the file is absent, the procedural bake is used and nothing breaks. The procedural path is always maintained as the canonical look — external art is an enhancement, never a dependency.

- **`src/render/assets.ts` (NEW):** discovers present files via Vite `import.meta.glob('/assets/textures/*.{png,webp,jpg}')` (missing files simply aren't in the map — this is the "if present" mechanism, no 404s) and exposes `async loadOptionalTexture(name): Promise<Texture | null>`. One-time load at renderer init into a small registry; views read from it synchronously thereafter.
- **Each view's contract:** `const tex = registry.get('fleece') ?? this.bakeProcedural()`. The named assets a view honors are documented at its construction. A provided asset must satisfy a documented spec (e.g. fleece = square, soft-alpha edge, roughly top-down woolly; shadow = radial-gradient blob) — if it doesn't fit, that's an art bug, not a code bug.
- **Determinism/headless untouched:** assets are render-only; the sim never sees them. Headless (test) runs never call the loader.
- **Which layers honor an optional texture:** M1 shadow blob, M2 fleece (per-shade tint applied over a greyscale asset), M4 grass tile + worn-path decal, M5 cloud patch. Shadows/fleece/grass each name their asset in the milestone below.

### Per-sheep visual traits (baked in views, NOT sim state)
A view-side seeded bake at `SheepView` construction: fleece shade index, dirt tint, texture variant, motion phase (can also reuse the sim's already-seeded `idlePhase[i]` — it was reserved for exactly this and reading it is allowed; writing is not). Baked into per-particle constants — zero per-frame cost.

### Renderer layer restructure (`renderer.ts`)
Explicit z-order, each layer one batch where possible:

```
world:
  1. GroundView      grass base + large-scale patch variation (static texture)
  2. WornPathsView   trample grid → small offscreen texture, updated ~4 Hz
  3. FieldView       fence, gate marker, obstacles (existing, restyled)
  4. ShadowView      ParticleContainer: 1 blurred-ellipse texture × (sheep+dog)
  5. SheepView       ParticleContainer: fleece textures (existing class, upgraded)
  6. DogView
  7. CloudShadowView drifting dark soft patches, above bodies below UI
  8. DebugView       (unchanged)
stage: HudView
```

### Dev-panel knobs (playtest observability)
Extend the existing `` ` `` panel (`addSlider` precedent): sun azimuth, time-of-day, cloud darkness, wind strength, zoom override. These write `state.dev` / view fields — already excluded from determinism.

### Verification model
2B is visual; the test suite guards **invariants, not looks**: determinism unchanged, sim perf unchanged, views never write sim state, and the few sim-side additions (zoom) get real tests. Looks are verified per-milestone via `npm run dev` + screenshots against the spec's checklist.

---

## Milestones

### M0 — Scaffolding (no visual change of substance)
`data/visuals.ts` with the sun vector + initial palettes; `src/render/visualsRuntime.ts` (live-tunable render bag, seeded from the consts); `src/render/assets.ts` optional-texture registry (loads at init, empty `assets/textures/` by default → all procedural); renderer layer restructure (empty `GroundView`/`ShadowView`/`WornPathsView`/`CloudShadowView` stubs registered in z-order); dev-panel knob for sun azimuth. Everything still renders as before (flat grass, oval sheep). `npm test` + build green. Unblocks every pillar. (The per-sheep visual-trait bake lands in M2 with its first consumer, to avoid dead state.)

### M1 — Pillar 1: soft contact shadows (biggest single win — first)
Optional asset `shadow.png` (radial-gradient blob, transparent edge) else a procedurally pre-blurred radial-gradient ellipse texture; a `ShadowView` ParticleContainer with a particle per sheep + one for the dog, positioned at body + `sunDir * SHADOW_LENGTH`, rotation = heading, scale = per-sheep size trait. Low alpha, soft edge. **REST sheep: shadow tighter + darker** (closer ground contact) — read `activity[i]`. Fleeing/running sheep can stretch the shadow slightly with the body (shares M3 scale math later). Renders below bodies, one batch.
*Verify:* 500 shadows batch in one draw call; screenshot — flock reads grounded, light direction consistent with the dev-panel sun knob.

### M2 — Pillar 2: procedural fleece
Replace the flat ovals. **First: the per-sheep visual-trait bake** (view-seeded RNG → `baseTint` from the shade ramp + rare brown/black, `dirt`, and the `breath*` fields M3 will use) — introduced here with its first consumer. Optional asset `fleece.png` (soft-alpha woolly oval, roughly greyscale so per-sheep shade tints cleanly); else bake `TEXTURE_VARIANTS × SHADE_STEPS` fleece textures at load (view-seeded RNG) — irregular silhouette (keep), 2 octaves of value noise for woolly clumping, **feathered alpha edge** (the blend mechanism), and a baked directional shading pass (brighter sun-side, darker shadow-side rim) from the shared sun vector. With an external asset the per-sheep shade/dirt/panic tints still apply as particle tint. Per-sheep: shade from the ramp (calm-skewed, a few brown/black), dirt tint multiplied in, size spread (reuse `bodyR` proportions so visual size matches collision size). Panic/penned/alert tints now *modulate* the fleece tint rather than replace it.
*Notes:* bake cost is load-time only; texture count stays modest (e.g. 8 variants × 5 shades = 40, or tint-based shading to keep it at 8). If sun azimuth becomes live-adjustable later, baked shading quantizes to N sun buckets — acceptable; live per-frame fleece shaders are out of scope.
*Verify:* screenshot at zoom — no two adjacent sheep identical; edges blend softly where sheep overlap; the mass reads woolly, not sticker-like.

### M3 — Pillar 3: motion of soft material
All in `SheepView.update` (+ shadow sync in `ShadowView`), all cheap per-particle math, **all phase-offset** via the baked motion phase / `idlePhase[i]`:
- **Velocity squash-stretch:** scale along heading `1 + k·speed/FLEE_SPEED`, across `1 − k'·…`, with a subtle bounding oscillation at speed (per-sheep phase). ParticleContainer already has `scale` dynamic.
- **Fleece jiggle/lag:** cheapest trick that reads — render position lags the interpolated position by a velocity-scaled fraction (wool settles a beat behind), plus a tiny phase-offset rotation wobble at speed. No second sprite layer unless this fails to read (flagged cuttable, per spec's cost discipline).
- **Idle micro-motion:** breathing scale pulse (~1–2 %, per-sheep period+phase) while grazing; slower/deeper while REST; ALERT holds still (the stare must stay planted).
*Verify:* the spec's tell — pause the dog, watch 30 s: the flock shimmers organically, nothing pulses in sync; a running group reads as soft bounding masses. Frame time at 500 unchanged within noise.

### M4 — The field does half the work
- **GroundView:** replace the flat fill. Optional asset `grass.png` (seamlessly tileable) else a tiling noise-based grass texture (baked at load, view RNG); either way with large-scale value patches (a second, low-frequency octave overlay) lit consistently with the sun vector, and a slight edge vignette toward the field boundary. Optional `cloud.png` is honored by M5.
- **WornPathsView:** render the 2A trample grid as faint flattened/discolored grass. Implementation: write `trample.val` into a `cols×rows` RGBA buffer → one small `Texture` scaled up with linear filtering (soft edges for free), updated at ~4 Hz, alpha = worn-path tint. One sprite, near-zero cost. (First real consumer of M6-2A's data.)
- **Wind on grass:** subtle, cheap — a slow scrolling brightness-modulation overlay (second noise texture, additive/multiply at low alpha) whose drift speed/amplitude ties to `ambient.windAlert`, so 2A gusts visibly brush the grass. Full vertex-displacement shader is out of scope.
- Restyle fence/gate/boulder to sit in the new palette (drop shadow on fence + boulder from the same sun).
*Verify:* screenshot — terrain reads as ground under light, not flat green; drive the flock, watch trails darken and fade; a gust visibly moves the grass right when sheep perk up (D overlay cross-check).

### M5 — World mood: time-of-day, clouds, weather
- **Time-of-day:** a mood clock (default: slow drift off `state.simTime`, dev-panel override; sim reads nothing back) maps to sun azimuth/elevation → shadow length/direction, warm↔flat color grade (one `ColorMatrixFilter` or tint ramp on the world container). Morning/evening = long warm shadows.
- **Cloud shadows (the standout):** 2–3 large soft-noise dark patches in `CloudShadowView` drifting slowly across the field (multiply-style low-alpha sprites, wrap at bounds). Drift direction loosely = wind. Cheap, gorgeous, makes the light feel real over a lit fleece flock.
- **Weather presets:** clear / overcast as data presets (overcast: shadows near-zero alpha, desaturated grade, clouds thicker). Light rain is a *stretch* item (darker grass + sheep tint only); the 2A huddle-behavior hook is explicitly deferred — no sim work in 2B.
*Verify:* dev-panel sweep of time-of-day — shadows swing/lengthen and the grade warms coherently; clouds drift over the flock and visibly modulate the fleece; overcast toggle reads instantly different but still cozy.

### M6 — Dynamic zoom + acceptance pass
- **Dynamic zoom (sim-side, the one real sim change):** in the step-7 camera pass, compute flock spread (bounding radius of unpenned sheep about the centroid — O(n) over the SoA, no allocation), map spread → target zoom (`ZOOM_MIN..ZOOM_MAX`), ease `camera.zoom` slowly (own ease rate, slower than follow). Renderer swaps fixed `ZOOM` for interpolated `camera.zoom`; input `screenToWorld` does the same. Deterministic (pure function of state) — add `camera.zoom` to `hashState`.
- **Acceptance pass:** the joint 2A+2B test. Bark into a settled rendered flock; the wave must be *mesmerizing*. Tune shadow alpha, fleece contrast, motion amplitudes, cloud darkness in the dev panel until it is. Re-run the perf log (500 hard / 1000 stretch) with all pillars on; fix any batching regressions.
*Verify (headless, real tests):* zoom eases toward the spread target and never exceeds bounds; determinism holds with zoom hashed; sim perf log unchanged. *Verify (visual):* the definition-of-done checklist below.

---

## Verification (suite additions)

1. **Determinism unchanged** — existing two-instance test, plus `camera.zoom` in the hash after M6. Must pass at every milestone (guards "views never mutate").
2. **Dynamic zoom behaves** — scatter the flock → zoom target decreases (zooms out); pen/tighten → increases; always within `[ZOOM_MIN, ZOOM_MAX]`; monotone ease, no snapping.
3. **Trample texture mapping** — pure-function test for the grid→pixel index mapping used by `WornPathsView` (the one piece of render code with real logic worth a unit test).
4. **Sim perf log unchanged** — the 500/1000 ms/step log should not move (2B adds no sim work besides the O(n) spread pass; assert the budget still holds).
5. **Everything else is screenshot review** per milestone against the spec — automated pixel tests are not worth their brittleness here.

## Build order & milestones

`M0 scaffolding → M1 shadows → M2 fleece → M3 motion → M4 field → M5 mood → M6 zoom + acceptance.`

Each milestone: implement → tests + build green → screenshot review vs the spec section → dev-panel tune → commit (`feat: Phase 2B Mn — …`). Strictly the spec's priority order: if the phase pauses early, the shipped prefix is still the highest-value subset (shadows alone are the single biggest win).

## Definition of done (from the spec)

1. Soft contact shadows ground every sheep under one consistent light.
2. Running sheep read as soft bounding mass (squash + jiggle), not sliding ovals.
3. No visible synchronization anywhere — shades, sizes, motion phases all vary; the flock shimmers organically.
4. The field reads as real terrain under real light; cloud shadows and wind-moved grass keep it alive when idle.
5. A Phase 2A startle wave crossing the flock is *mesmerizing* — the joint 2A+2B acceptance test.

## Risks & mitigations

- **Shader scope creep** — the plan uses *baked textures + sprite tricks* everywhere (fleece noise, grass, blurred shadows, cloud patches); no custom fragment shaders required. If a pillar seems to demand one, cut scope, don't write the shader.
- **ParticleContainer limits** — dynamic `position/rotation/color/scale` cover everything M3 needs; fleece lag is designed as a position/rotation trick, not a second layer. If it doesn't read, it's flagged cuttable rather than escalated.
- **Batch breakage** — each layer is one texture-atlas'd batch; watch draw-call count at M1/M2/M5 (the spec's perf note). Cloud/wind overlays are single large sprites, never per-cell draws.
- **Baked-shading vs live sun** — fleece sun-shading is baked; a fully live sun would need re-bakes or quantized buckets. Accepted: time-of-day quantizes fleece shading to N buckets while shadows/grade move continuously (shadows dominate perception).
- **Sync tells** — every periodic visual takes a per-sheep phase from the seeded bake; M3's 30-second stare-test is the guard.
- **Determinism drift** — the only sim change is M6's zoom (pure function of state); everything else is read-only views with view-local RNGs. The two-instance test runs every milestone.
- **Optional-asset regressions** — the procedural path is the canonical, always-maintained look and is what every milestone is tuned/screenshotted against; an external texture is a swap-in enhancement. Never let a view *require* an asset, and never let a missing asset throw (the glob makes absence a `null`, not a 404). If a provided asset looks wrong, that's an art-spec mismatch, fixed by the asset, not new code.
