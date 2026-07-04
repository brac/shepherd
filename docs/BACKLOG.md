# BACKLOG — shepherd

Deferred work and ideas, roughly priority-ordered. The active plan lives in `STATUS.md` and
the phase plans; this is the "later" pile.

---

## Epic: GPU compute sim → giant flocks (the big one)

**Goal:** run the flock on the GPU so we can hold 120 fps *and* scale from 500 to **thousands
of sheep** — a 5,000-strong flock flowing over the field is the standout feature this unlocks.
The framerate win is the small prize; scale is the real one.

### Why (the finding, 2026-07)
The sim is a **~3.8 ms/step CPU floor that barely moves** between idle and full panic. Cause:
500 sheep pack tight (~40 neighbours each), so every step does dense neighbour scans
(`panic` ~1.0 ms + `flocking` ~1.6 ms + `overlap` ~1.0 ms) regardless of activity. At a 120 Hz
display the 120 Hz sim does 1 step/frame ≈ 3.8 ms, leaving little for rendering; a full-panic
flock tips the thin margin and the vsync tiers cascade 120→60→30. CPU micro-opts (overlap
passes, neighbour budget) only shave 20–40% — not a guaranteed 120 fps, and they don't scale
the flock. **Interim mitigation shipped:** sim dropped 240→120 Hz, mood filter grades only the
background, render resolution capped, and the render loop is **capped to a stable 60 fps**
(`RENDER_FPS_CAP`) so it's smooth instead of oscillating. The GPU port is the real fix.

### How — Petriarch is the template
The sister project `~/Work/Petriarch` runs **~20,000 agents on WebGPU/WGSL** with shepherd's
*exact* architecture lineage (SoA, zero-alloc, seeded PRNG, fixed timestep, dumb views). Read
`~/Work/Petriarch/docs/webgpu-migration.md` — it's a ready-made, hardware-tested playbook.
The plan for shepherd:

1. **Refactor the hot passes to a flat-buffer "Tier A" contract first (CPU-side):** each per-
   sheep pass reads flat typed arrays at fixed strides and writes ONE output buffer, branch-
   light, no held references, no read-modify-write another sheep depends on mid-pass. Passes:
   `panic`, `flocking` (separation/alignment/cohesion/fear/graze/funnel), `integrate`,
   `overlap`. Everything else (dog input, gate/penning, ambient scheduling, spawn, win) stays
   CPU "Tier B". This refactor has value even without the GPU and is the bulk of the work.
2. **Port the spatial hash** to a GPU counting-sort grid (clear/count/scan/scatter kernels with
   atomics). Give each kernel its own compute pass — WebGPU only syncs memory *between* passes
   (a Petriarch hardware gotcha). Verify `cellStart`/cell-contents against the CPU grid.
3. **Port each pass to WGSL**, one at a time, verifying against the CPU pass on the same seed
   **in-browser** (WebGPU can't run in the Node/vitest toolchain — see below).
4. **Readback ~N positions/step** to feed the existing PixiJS renderer (trivial at 500; still
   cheap at thousands). Keep rendering on PixiJS/WebGL.
5. **Scale:** raise `MAX_SHEEP`, profile, done.

### Shepherd-specific hurdles
- **Determinism / tests:** the headless test suite runs the sim in Node, where WebGPU is
  unavailable, and GPU floats/atomics aren't bit-identical to CPU anyway. So the **CPU path
  stays the golden reference** (what the tests run); the GPU path is a *verified accelerator*,
  checked in-browser + via a Node reimplementation of the kernels. We maintain both.
- **Topological rejoin is the one real misfit:** `findKNearestCentroid` (`src/sim/flocking.ts`)
  is a variable-iteration outward *ring search* — divergent/unbounded, GPU-hostile. It must be
  reworked into a bounded pass (a fixed neighbour budget, à la Ballerini's ~6–7 topological
  neighbours — which is also more biologically accurate than the current metric awareness).
- **Effort:** multi-day to multi-week. Do NOT start until there's a reason to scale; the
  contract-first refactor loses nothing by waiting and gives a CPU golden reference to verify
  against (Petriarch's explicit advice).

---

## Smaller deferred items

- **Tuning / feel pass** — dog:sheep speed ratio → awareness radius → panic decay-vs-
  propagation → approach-angle weighting → funnel strength; plus stalk-idle / prone feel.
- **Shift-click cone "big-bark"** — the one deferred combat verb; bark plumbing already exists,
  add a wider directional variant with a longer cooldown.
- **Level select / progression** — cycle the shipped levels in-game, then author more
  `data/levels/` maps (mazes, chutes) — pure data, no sim work.
- **Gate flow-cap queuing** — only if the throat is observed to actually jam under heavy flow.
- **Weather → huddle behaviour** — the rain hook noted in `PHASE_2B_RENDERING.md` §4 (a real
  sim behaviour, deferred out of 2B).

## Phase 2B remaining
- **M6 — dynamic zoom + acceptance pass** (the final 2B milestone; see `PHASE_2B_PLAN.md`).
