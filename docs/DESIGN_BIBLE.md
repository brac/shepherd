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

**Hard de-overlap (implemented).** Boid separation is a soft steer and cannot stop bodies interpenetrating at high density. After the move pass, a positional de-overlap pass pushes any two sheep closer than a body distance apart (a couple of relaxation iterations over the same spatial hash, allocation-free), then re-clamps against fences. This is what makes sheep *bump* rather than stack. See `src/sim/overlap.ts`.

### Cohesion is local — this is the whole splitting mechanism

Cohesion only considers neighbors **within the awareness radius**. There is no global flock. When the dog shears a group and two clumps drift beyond each other's awareness radius, they stop feeling each other and become two independent blobs, each cohering internally. When two blobs wander back into mutual awareness, cohesion pulls them together again. Splitting and regrouping are free emergent consequences of local-only cohesion. **Do not model "the flock" as an object. Do not add split/merge logic.** The awareness radius is the single most important tunable for how easily the flock shears and how far a stray can drift before it's stranded.

### Grazing

When a sheep's panic is at/near 0 and no neighbor is panicking and the dog is outside its awareness radius **and it has flockmates nearby**, it grazes: very slow wander (seeded PRNG), heading drifts, occasionally near-stationary. There is no separate "settle" state — grazing is simply the low-panic behavior. Panic is the single scalar that governs everything. (A *stranded* sheep does not graze contentedly — it hurries back; see below.)

### Sheep-like realism (beyond plain boids)

Plain Reynolds boids have two unnatural failure modes: they fragment into lone singletons, and dense groups crystallise into a perfect hexagonal disc. A thin realism layer — each term grounded in the animal-behaviour literature — fixes both **without** weakening the local-cohesion shearing that the design depends on. All are data-driven in `data/tuning.ts` and implemented in `src/sim/flocking.ts` / `overlap.ts`.

- **Topological rejoin** (Ballerini et al. 2008 — starlings track ~6–7 nearest neighbours regardless of distance; Strömbom 2014 — sheep steer to the local centre of mass of their *n* nearest). A sheep with too few metric neighbours (a *stray*) steers toward the centroid of its `TOPO_K` nearest flockmates, found by an outward grid search, so a lone sheep sprints back instead of stranding. Crucially the pull scales with isolation and only bites for near-lone individuals — a sheared-off *group* still has internal neighbours and is left free to drift, so **group shearing is preserved**.
- **Vision / blind rear** (front-weighting): neighbours behind a moving sheep count less (`REAR_WEIGHT`), so the flock elongates along motion instead of settling into an isotropic disc.
- **Angular noise** (Strömbom's `e` term, `W_NOISE`): per-sheep individuality that breaks the perfect lattice.
- **Selfish herd** (Hamilton 1971, `PANIC_COHESION_GAIN`): panic tightens cohesion, so a pressured flock bunches and rounds up rather than shearing into singletons.
- **Per-sheep body size** (`BODY_SIZE_MIN/MAX`): seeded variation in the de-overlap distance so packed sheep can't settle into a perfect crystal.

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

Each step, panic spreads between neighbors within awareness, scaled by proximity — closer neighbors matter more. A sheep at panic 0.9 drags nearby calm sheep upward; those in turn drag *their* neighbors, dying out over distance. This is how a scatter cascades or fizzles: a genuinely terrified sheep pulls its neighbors over the flight threshold and the blob bolts; a lone spike among calm sheep fizzles.

**Implementation note — diffusion with loss, not additive sum.** The literal "additive then clamped" model caused a *permanent scatter* at 500 densely-packed sheep: many mutually-panicking neighbors kept topping each other up faster than decay could remove it, so the flock saturated at panic = 1 forever — exactly the runaway this section warns against. The shipped model instead diffuses each sheep's panic *toward its hottest neighbor's influence* at a rate below 1/step. Because the pull never fully offsets decay, a mutually-panicking cluster always relaxes once its source (the dog) leaves — no self-sustaining fixed point, so a scatter is always recoverable — while a truly terrified neighbor still tips calm sheep over the threshold. See `src/sim/panic.ts`.

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

The implemented control model maps **left to sprint** and **ctrl to prone**; trot vs. stalk falls out of how close the cursor is to the dog. (This supersedes both the earlier "click = snap prone" phrasing and the later "hold-left = plant" model.)

- **Mouse move, no button** → trot toward the cursor (eased). Default state, large fear radius. The dog **creeps (stalk)** instead of trotting once the cursor comes within `STALK_RADIUS` of it — so a *still* cursor lets the dog settle in slowly (intermediate fear radius; sheep give ground steadily), while *moving* the cursor makes it trot to catch up.
- **Hold left** → sprint. A hard drive toward the cursor: fastest speed (`DOG_SPRINT_SPEED`), snappiest acceleration, **largest fear radius** — the main tool for pushing a flock.
- **Hold ctrl** → prone / plant (highest priority). The dog hard-stops and snaps its facing toward the nearest sheep (the "eye"); smallest fear radius. Acts as a **soft wall**: sheep are aware of it and won't cross it, but a prone dog doesn't panic them — pin a group against it while you collect stragglers.
- **Release** → back to trot-follow.
- **Right-click → bark.** Radial panic pulse: momentary fear-radius spike that injects a burst of panic in a radius. Use to unstick jammed sheep or reset a corner. Cooldown.
- **Shift-click → big bark.** A **cone** shaped burst that shoves a group in the facing direction. *Deferred — not yet implemented.*
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
- **Obstacle** polygons (block both sheep and dog; chutes and gates the dog can't shortcut = real puzzle design). *Implemented:* a `LevelDef` may include `obstacles` (flat polygons); their walls join the collision set with the walkable side outward, so sheep and dog slide around them. See `data/levels/level2.ts` for a mid-field boulder.
- **Pen** polygon + **gate** segment (the narrow opening).
- **Spawn region(s)** for sheep.

Difficulty progression: open rectangle → mild obstacles → maze-like → wild playful layouts. Changing a level should require **no sim code changes** — only new polygon data. Sheep count is per-level data too.
