# PHASE_2B_RENDERING.md — shepherd

**Goal:** make the 500-sheep flock and field *convincingly real at a glance and beautiful in motion* — not literal photorealism. The target is the aggregate: a real-looking flock in a real-looking field under real light. Effort goes to the *mass and the light*, not to any single sheep. This is what makes the Phase 2A aliveness *land* — a startle wave crossing a flat token-flock is nothing; crossing a soft lit fleece-mass it's mesmerizing.

Top-down is the reason this is achievable cheaply: no faces, no silhouettes, no limb articulation, no arbitrary-angle lighting. A sheep from above is a woolly blob, a shadow, and motion. All PixiJS v8. Views stay dumb (CLAUDE.md) — rendering reads GameState, never mutates it.

> **CUT for cost:** an earlier draft included a "soft-alpha fleece merge" pillar (tight flock rendering as one continuous woolly carpet via accumulated soft-alpha overlap). It has been removed as too costly/risky for its marginal benefit. Feathered fleece edges (Pillar 2) still make overlapping sheep blend pleasantly; we simply don't chase a single seamless surface. Do **not** implement flock-wide alpha-merge compositing. If a future profiling pass shows headroom, it can be revisited — but it is out of scope here.

---

## 1. The three pillars (in priority order — each is a large realism gain)

### Pillar 1 — Soft contact shadows (do this first, biggest single win)
A soft blurred dark ellipse under every sheep and the dog, offset by a **single consistent sun direction** for the whole scene, darkest where the body meets the ground and fading out. Shadows are what ground the flock into the field and sell "3D things in real light." This does more for realism than any detail on the sheep itself.
- Offset direction + length from a global sun vector (shared with the world lighting, §3).
- Slightly soft/blurred edge, low opacity. Scale shadow with sheep size trait.
- Resting sheep (Phase 2A) sit lower → shadow tighter and darker (closer contact).
- Batch these — 500 shadow sprites in one draw. They render *below* the sheep layer.

### Pillar 2 — Procedural fleece (not sprites)
A sheep top-down is a mottled off-white fleece mass. Build it as a shader/texture, not a drawn sprite:
- Noise-driven fleece texture with soft clumping (a couple of octaves), giving woolly irregularity rather than a flat fill.
- The irregular oval silhouette you already have, with a **soft alpha edge** (feathered, not hard) — critical for Pillar 3.
- Subtle interior shading: slightly brighter along the sun side of the fleece, darker on the shadow side, to give the wool a gentle domed volume. A single directional term from the sun vector.
- This scales to 500 for free and looks *more* real than hand-drawn sprites while fitting the asset-light philosophy.

### Pillar 3 — Motion of soft material (squash-stretch + fleece lag)
Photoreal at this scale lives in *correct motion of soft mass*, not still-frame detail:
- **Velocity squash-stretch:** a moving sheep stretches slightly along its heading, squashes across it; more at higher speed. A running sheep should read as a soft bounding mass, not a rigid oval sliding.
- **Fleece jiggle/lag:** the fleece texture lags the body motion very slightly, so wool "settles" a frame behind — sells softness.
- **Idle micro-motion:** even grazing/resting sheep have tiny breathing/shift motion (per-sheep phase-offset, §Anti-uniformity) so the flock is never frozen.
- All of this **must be per-sheep phase-offset** (see below) — synchronized squash/jiggle looks instantly fake.

---

## 2. Anti-uniformity in rendering (as important as in behavior)

500 identical sheep breaks realism no matter how good one is — and with the fleece-merge cut, per-sheep variation is now *the* thing stopping the flock looking like 500 stickers. It carries more weight than before; do not skimp. Drive all of this off the seeded PRNG per sheep so it's deterministic:
- **Fleece shade variation:** off-white ranging cream → grey → dirty; a few brown and black sheep in the mix. Real flocks are not uniform and the eye catches it fast.
- **Size variation:** small spread in body scale (lambs smaller if you want them).
- **Dirtiness/wear:** some sheep grubbier underneath, tinted.
- **Motion phase offset:** every periodic visual (squash cycle, jiggle, breathing, idle shift) gets a per-sheep phase so the flock *shimmers organically*, never in lockstep. A flock that squashes in sync is the #1 fake tell — guard against it.

---

## 3. The field does half the work

Realism is a whole-image property. A great ground makes simple sheep look real by association.
- **Grass:** a real-ish grass texture with lighting variation and unevenness, not a flat green fill. Subtle large-scale value variation (lighter/darker patches) so it reads as real terrain.
- **Global sun vector + lighting:** one light direction for the whole scene, feeding shadows (Pillar 1), fleece shading (Pillar 2), and grass. Consistency of light across everything is what sells realism.
- **Wind on grass:** subtle grass movement (shader-driven) tied to the wind/weather value. Ambient motion in the world makes the whole scene alive even when the flock is idle — and gusts pair with Phase 2A wind-startles.
- **Worn paths (from Phase 2A §2.6):** render the trample field as faint flattened/discolored grass where traffic has passed, recovering slowly. The field accumulates the session's history.

---

## 4. World mood / "reason to return" layer (nice-to-have, high impact)

These don't change herding at all but make the *same* field feel different each visit — directly serving the "reason to return" goal:
- **Time of day / sun angle:** shifts the sun vector and color grade (warm low-angle mornings/evenings, flat midday). Shadows lengthen and warm. Enormous mood change for one shared vector + grade.
- **Weather:** overcast (soft shadows, desaturated), light rain (darker grass, sheep tint, huddle behavior hook for 2A), clear. Keep gentle — cozy, never harsh.
- **Ambient life:** birds (already a startle source in 2A — render them), drifting clouds casting slow soft shadow patches across the field (a moving darkening mask — cheap, gorgeous, and it makes the light feel real).

Cloud shadow patches drifting over a lit fleece flock is a very high beauty-per-effort item — flag it as a standout.

---

## 5. Camera (extends DESIGN_BIBLE)
Axis-locked top-down, follow-with-lookahead as specced. Now add the **dynamic zoom** that was near-term-deferred: ease out when the flock is spread across the field, in when tight/working a pen. Zoom changes how the flock reads — zoomed out, a tight flock is a dense soft mass; zoomed in on the pen, you see individuals threading the gate. Keep zoom slow and eased; never jarring.

## 6. Performance notes
- 500 shadows, 500 fleece bodies, grass, effects — batch aggressively. Shadows one batch, bodies one batch/layer. With the fleece-merge cut, there is no special compositing cost — this should batch cleanly.
- Per-sheep variation and phase offsets are precomputed constants (seeded), not per-frame work.
- Target: hold frame budget at 500 with all pillars on; 1000 as the stretch check.

## Definition of done
1. Soft contact shadows ground every sheep under one consistent light (Pillar 1 — the biggest single win).
2. Running sheep read as **soft bounding mass** (squash + jiggle), not sliding ovals.
3. No visible synchronization anywhere — fleece shades, sizes, and motion phases all vary; the flock shimmers organically.
4. The field reads as real terrain under real light; drifting cloud shadows and wind-moved grass make it alive when idle.
5. A Phase 2A startle wave crossing the flock looks *mesmerizing* — this is the joint acceptance test for 2A + 2B: if the wave over the rendered flock isn't beautiful, one of the two phases isn't done.
