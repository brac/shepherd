# PHASE_1_SCOPE — shepherd

The first buildable slice. Goal: **a dog that follows the mouse can herd a flock of 500 boids through a gate into a pen on one rectangular level, and it feels good.** Everything here is a vertical slice through the whole architecture — no throwaway scaffolding.

## In scope

### Foundation
- Fixed-timestep 240 Hz loop with accumulator + render interpolation.
- Single mutable `GameState`; SoA sheep pool; seeded mulberry32 PRNG.
- Uniform-grid spatial hash: clear / insert / 3×3 neighbor query. Rebuilt each sim step.
- `data/tuning.ts` with every constant below as a named, editable value.

### One level
- A single **rectangular field** with a boundary polygon.
- One **pen** with a **narrow gate**.
- One **spawn region**; spawn 500 sheep with seeded position jitter.
- No obstacles yet (boundary + pen fence only).

### Sheep sim
- Four boid terms: separation, alignment, cohesion (local, awareness-radius-bound), fear.
- Panic scalar 0–1: injection from dog (approach angle + dog speed + time-in-awareness surprise), propagation with proximity falloff, forgiving decay.
- Flight threshold → fleeing state (run from dog) above threshold; edgy-but-with-flock below.
- Grazing wander at low panic.
- Fence collision as push-out + slide-along.

### Dog
- Mouse-follow with eased accel, limited speed, fence collision.
- **Trot / prone / stalk** states with state-dependent fear radii.
- Left-click → prone (snap facing to nearest sheep, soft wall). Left-click-drag → stalk. Release → trot.
- **Right-click → radial bark** with cooldown.
- Prone dog acts as a soft wall (sheep aware, not panicked).

### Gate + pen
- Gate **funnel attractor** (soft current through the opening).
- **Circulate-to-back** push inside the pen so penned sheep vacate the gate mouth.
- Penned sheep counted; **win when all 500 are inside.**
- No gate leakage (sheep don't wander back out).

### Render (dumb views)
- Sheep as SoA particle pool: irregular off-white ovals oriented to heading.
- Dog sprite with a visible state read (trot / prone / stalk) — even a simple shape/color change is fine.
- Field boundary, pen, gate drawn from polygon data.
- Camera: axis-locked top-down, follows dog with velocity lookahead. **No rotation.**
- A simple counter: sheep penned / total.

## Explicitly deferred

- **Shift-click cone big-bark** (add right after core feel is locked).
- **Dynamic zoom** (follow/lookahead ships in Phase 1; zoom layers on next — near-term, not forever).
- **Obstacles / maze / wild layouts** (level data only; sim already supports it via boundary collision).
- **Multiple levels / progression.**
- **Timed / par-time optional mode.**
- **Gate flow-cap queuing** — only if jamming is actually observed with funnel + slide-along.
- Audio, menus, polish, sprites beyond placeholder.

## Definition of done

1. 500 sheep hold **stable frame budget** with real per-sheep boids (verify 1000 as a stretch check).
2. The flock **splits when sheared** by clumsy pressure and **regroups** when blobs re-enter mutual awareness — with zero split/merge code.
3. Head-on fast approach panics sheep; **flanking / stalking applies pressure without bolting them.**
4. Prone dog **holds a group as a soft wall.**
5. Sheep **thread the narrow gate** under dog pressure + funnel; penned sheep **circulate to the back**; the gate mouth stays clear enough for the flock to finish.
6. **Win fires when all sheep are penned.**
7. Panic decay is **forgiving** — a scatter is recoverable in seconds.
8. Determinism holds: same seed + input = same result.

## First tuning pass (the dials that make or break feel)

Front-load tuning on these, in order:
1. **Dog-speed : sheep-speed ratio** (can you flank?).
2. **Awareness radius** (how easily the flock shears / how far a stray strands).
3. **Panic decay vs. propagation** (dramatic but recoverable, not permanent scatter).
4. **Approach-angle weighting** (flanking must be meaningfully gentler than head-on).
5. **Funnel strength** (threads the gate without vacuuming sheep unnaturally).
