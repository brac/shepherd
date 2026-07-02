# DESIGN_BIBLE — shepherd

The simulation model. This is the source of truth for how sheep, the dog, the gate, and the pen behave. Everything here is data-driven; specific numbers live in `data/tuning.ts` and are placeholders to be tuned.

---

## 1. Sheep flocking

Each sheep is an independent boid. Every sim step, for each sheep, gather neighbors within the **awareness radius** using the spatial hash, then compute a steering force from four terms:

- **Separation** — push away from neighbors that are too close (within a smaller separation radius). Prevents overlap, keeps the blob from collapsing to a point.
- **Alignment** — steer toward the average heading of neighbors. Makes a moving group flow together.
- **Cohesion** — steer toward the average *position* of neighbors. Pulls the blob together.
- **Fear** — steer directly away from the dog, scaled by dog proximity and dog state (see §3). This is the term the player drives.

Weighted sum, clamped to a max steering force, integrated into velocity, velocity clamped to a max sheep speed, integrated into position. Heading follows velocity (used for oval orientation and alignment).

### Cohesion is local — this is the whole splitting mechanism

Cohesion only considers neighbors **within the awareness radius**. There is no global flock. When the dog shears a group and two clumps drift beyond each other's awareness radius, they stop feeling each other and become two independent blobs, each cohering internally. When two blobs wander back into mutual awareness, cohesion pulls them together again. Splitting and regrouping are free emergent consequences of local-only cohesion. **Do not model "the flock" as an object. Do not add split/merge logic.** The awareness radius is the single most important tunable for how easily the flock shears and how far a stray can drift before it's stranded.

### Grazing

When a sheep's panic is at/near 0 and no neighbor is panicking and the dog is outside its awareness radius, it grazes: very slow wander (seeded PRNG), heading drifts, occasionally near-stationary. There is no separate "settle" state — grazing is simply the low-panic behavior. Panic is the single scalar that governs everything.

---

## 2. Panic

Panic is a single **continuous 0–1 scalar per sheep**. 0 = fully calm / grazing. Higher = edgier, tighter clustering, stronger propagation.

### Flight threshold

There is a **flight threshold** (e.g. ~0.6, tunable). A sheep whose panic is *below* threshold is edgy but stays with the flock — panic tightens cohesion and raises alertness but the sheep does not bolt. A sheep whose panic *crosses* the threshold flips into **fleeing**: it runs directly away from the dog at flee speed until panic decays back below threshold. This threshold, not the raw panic value, is what makes "2 sheep start fleeing" a discrete visible event on top of a continuous scalar.

### Panic injection (from the dog)

When the dog is within a sheep's *current* fear radius (state-dependent, §3), panic is injected each step. The injection magnitude is a function of:

- **Approach angle** — head-on approach (dog velocity pointed at the sheep) injects more; flanking / tangential approach injects less. Flanking lets you apply pressure without panicking, which is the core of good herding.
- **Dog speed** — faster dog injects more. This is why trotting is scarier than stalking.
- **Time in awareness (surprise)** — *less* time spent inside the awareness radius → *higher* injection. A dog that suddenly appears close surprises the sheep (spike); a dog that has been slowly present is partially habituated (less injection). Track per-sheep "time the dog has been within awareness" and use it to attenuate injection.

Panic is clamped to 1.

### Propagation

Each step, a panicking sheep passes a *fraction* of its panic to neighbors within awareness, scaled by proximity — closer neighbors receive more. A sheep at panic 0.9 injects roughly half into close neighbors, who inject a fraction of *that* into theirs, dying out over distance. This is how a scatter cascades or fizzles: if many neighbors are already near the flight threshold, propagation tips them over and the whole blob bolts; if few are, it fizzles. Propagation is additive then clamped.

### Decay

Each step, panic decays toward 0 at a **decay rate**. Decay should be **forgiving / fairly fast** — this is the primary cozy-vs-frustrating dial. A scared flock resettles quickly once the dog eases off, so a bad approach costs seconds, not the whole level. **Tune decay against propagation together**: slow decay + strong propagation = one surprise permanently scatters the flock (bad). Fast decay + moderate propagation = dramatic but recoverable scatters (target).

---

## 3. The dog

The dog follows the mouse at a **limited speed with ease-in / ease-out** (acceleration toward a target derived from mouse position, not teleport) to mimic real movement. The dog must outrun sheep (so you can flank) but not so fast that flocks never cohere — this speed ratio is a primary tunable. The dog collides with fences and obstacles (push-out, §collision), same as sheep.

The dog exerts fear on sheep via a **state-dependent fear radius**. Ordering, mirroring real sheepdog behavior:

| State | Fear radius | Notes |
|---|---|---|
| **Trotting** (mouse-follow, moving) | **largest** | Fast movement is scariest. Default state. |
| **Stalking** (left-click-drag, slow creep) | **intermediate** | Controlled pressure. Sheep give ground steadily rather than bolting. The working tool. |
| **Prone / eye** (left-click, still) | **smallest** | A motionless crouch reads as low threat. Lets you hold a group close as a soft wall without breaking it. |
| **Bark** (right-click) | **transient spike** | Radius briefly balloons to bark radius, then snaps back to the underlying state. |

### Dog states / input

- **Mouse move** → trot toward mouse (eased).
- **Left-click (no drag)** → snap prone. The dog snaps its facing toward the nearest flock/sheep and holds position (the "eye"). Fear radius shrinks to prone. Acts as a **soft wall**: sheep are aware of it and won't cross it, but a prone dog doesn't panic them — you can pin a group against it while you go collect stragglers.
- **Left-click-drag** → stalk. Slow deliberate walk along the drag; intermediate fear radius; sheep give ground steadily. Releasing returns to trot-follow.
- **Right-click → bark.** Radial panic pulse: momentary fear-radius spike that injects a burst of panic in a radius. Use to unstick jammed sheep or reset a corner. Cooldown.
- **Shift-click → big bark.** A **cone** shaped burst: shoves a group hard in the facing direction. Power move for driving through a gate. Cooldown (longer than bark).
- Moving and barking are **independent** — the dog can move and bark together or separately.

---

## 4. The pen and gate

The pen is a polygon with a **narrow gate** opening in its fence. Threading sheep through the small gate is a deliberate part of the design and is built in from the start.

### Gate funnel attractor

Because separation pushes boids apart exactly where you need them single-file, sheep will pile against the fence beside the gate without help. A **funnel attractor** solves this: an invisible pull vector in front of and through the gate that gently biases nearby sheep toward the opening and through it. Not a rail — a soft current. Combined with dog pressure from behind and slide-along fence collision, sheep thread the gate. Funnel strength is tunable.

### Fence collision → slide toward gate

Fence collision is push-out along the surface (§collision), so a sheep shoved at the fence slides along it. Near the gate, sliding + funnel pull naturally routes a sheep to the opening.

### Queuing fallback

If 500 sheep genuinely log-jam at the throat under heavy flow, add a per-frame **flow cap** at the gate throat (limit how many cross per step, forcing a queue). Build funnel + slide-along first; only add the flow cap if jamming is observed.

### Inside the pen: circulate to make room

Sheep already in the pen must not clog the gate mouth. Inside the pen, apply a gentle **push toward the back** of the pen (away from the gate) so penned sheep actively vacate the entrance and make room for incoming sheep. Effectively a soft attractor at the pen's far interior. Sheep do **not** wander back out of the pen (for now — no gate leakage in v1). A penned sheep is counted.

### Win condition

Win when all sheep are inside the pen polygon. No settle requirement in v1 (sheep can't leave once in), so "inside" is sufficient.

---

## 5. Camera

Aerial top-down. **Axis-locked — does not rotate** to dog heading (readable, standard). Translates to follow the dog with a **lookahead offset** toward dog velocity so you see where you're going. **Dynamic zoom** (zoom out when the flock is spread across the field, in when tight) is a near-term nice-to-have — implement the follow/lookahead first, layer zoom on after.

---

## 6. Levels

Levels are **data-driven polygons** in `data/levels/`:

- **Field boundary** polygon (sheep and dog pushed out at edges — sheep never escape or get lost).
- **Obstacle** polygons (block both sheep and dog; chutes and gates the dog can't shortcut = real puzzle design).
- **Pen** polygon + **gate** segment (the narrow opening).
- **Spawn region(s)** for sheep.

Difficulty progression: open rectangle → mild obstacles → maze-like → wild playful layouts. Changing a level should require **no sim code changes** — only new polygon data. Sheep count is per-level data too.
