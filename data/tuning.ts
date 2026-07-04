// All sim tunables live here. The sim reads these; it never hardcodes a number.
// Values are placeholders to be tuned (see PHASE_1_SCOPE "First tuning pass").
// Units: distances in world pixels, speeds in px/s, times in seconds, rates per second.

// ---- Timestep ----
// 120 Hz (was 240): at a 120 fps display this is ONE sim step per rendered frame instead of
// two, roughly halving sim CPU per frame — the flock stays at 120 fps under load instead of
// cascading down the vsync tiers. Still a fixed, deterministic, frame-rate-independent step;
// all tuning below is per-second rates, so feel is preserved. (Deviates from DESIGN_BIBLE's
// 240 Hz — documented in STATUS.md.)
export const SIM_HZ = 120;
export const DT = 1 / SIM_HZ; // fixed sim step, seconds
export const MAX_FRAME_TIME = 0.25; // clamp accumulator to avoid spiral-of-death

// ---- Sheep body / motion ----
export const SHEEP_RADIUS = 5;
export const SHEEP_WALK_SPEED = 78; // max speed when calm/edgy
export const SHEEP_FLEE_SPEED = 152; // max speed when fleeing (dog only slightly outpaces it)
export const SHEEP_GRAZE_SPEED = 8; // wander speed at rest
export const PENNED_SPEED = 40; // calm shuffle once safely in the pen
export const SHEEP_MAX_FORCE = 420; // steering force clamp (px/s^2 equivalent)

// ---- Heading (visual orientation) ----
export const HEADING_EASE = 12; // rate heading eases toward velocity direction (1/s)
export const HEADING_MIN_SPEED = 6; // below this speed, heading holds (no spin when idle)

// ---- Boid neighborhood ----
export const AWARENESS_RADIUS = 80; // cohesion/alignment/propagation range (== hash cell size)
export const SEPARATION_RADIUS = 18; // soft steer-apart range

// ---- Hard body overlap (positional, so sheep bump instead of stacking) ----
export const SHEEP_COLLIDE_DIST = 11; // min center distance between two sheep bodies
export const OVERLAP_PASSES = 2; // relaxation iterations per step

// ---- Boid weights ----
export const W_SEPARATION = 1.5;
export const W_ALIGNMENT = 0.6;
export const W_COHESION = 0.9;
export const W_FEAR = 2.5;
export const W_FUNNEL = 1.2;
export const W_PEN_BACK = 0.4;
export const FLEE_COHESION_DAMP = 0.35; // align/cohesion multiplier while fleeing

// ---- Sheep-like realism (see docs: Strömbom 2014, Ballerini 2008, Couzin 2002) ----
// Topological "rejoin": a stray with too few metric neighbours steers toward the
// centre of mass of its K nearest flockmates regardless of distance, so lone sheep
// sprint back instead of stranding. Metric cohesion still lets *groups* be sheared.
export const TOPO_K = 6; // nearest neighbours a stray aims for (Ballerini's ~6-7)
export const REJOIN_MIN_NEIGHBORS = 3; // fewer awareness neighbours than this => stray
export const W_REJOIN = 2.4; // rejoin steer weight when fully isolated

// Angular noise breaks the perfect-lattice / disc crystallisation (Strömbom's e term).
export const W_NOISE = 0.12; // random steer magnitude, relative to the unit boid terms

// Vision / blind rear: neighbours behind a moving sheep count less, so the flock
// elongates along motion instead of settling into an isotropic disc.
export const REAR_WEIGHT = 0.4; // weight of a neighbour behind you vs one in front

// Selfish herd (Hamilton 1971): panic tightens cohesion, so a pressured flock bunches
// and rounds up rather than shearing into singletons.
export const PANIC_COHESION_GAIN = 1.6; // extra cohesion multiplier at panic = 1

// Per-sheep body-size variation roughens the de-overlap lattice (no perfect packing).
export const BODY_SIZE_MIN = 0.82;
export const BODY_SIZE_MAX = 1.18;

// ---- Grazing ----
export const GRAZE_MIN_DWELL = 0.6; // seconds between wander decisions (min)
export const GRAZE_MAX_DWELL = 2.5; // (max)
export const GRAZE_TURN = 1.2; // radians of heading jitter per decision

// ---- Dog motion ----
export const DOG_RADIUS = 8;
export const DOG_TROT_SPEED = 170;
export const DOG_STALK_SPEED = 45;
export const DOG_ACCEL_EASE = 4; // velocity ease-toward-target rate (1/s)
export const DOG_ARRIVE_RADIUS = 12; // stop easing when within this of the target

// ---- Dog fear radii (state-dependent) ----
export const FEAR_RADIUS_TROT = 160;
export const FEAR_RADIUS_STALK = 100;
export const FEAR_RADIUS_PRONE = 50;
export const PRONE_SOFTWALL_RADIUS = 55; // gentle repulsion so prone reads as a wall
export const PRONE_SOFTWALL_FORCE = 40;

// ---- Bark ----
export const BARK_RADIUS = 220;
export const BARK_BURST = 0.5; // one-shot panic added inside bark radius
export const BARK_DURATION = 0.18; // seconds the transient radius is active
export const BARK_COOLDOWN = 0.8; // short enough that a ready bark almost always fires

// ---- Panic ----
export const FLIGHT_THRESHOLD = 0.6; // panic crossing this -> fleeing
export const FLIGHT_HYSTERESIS = 0.15; // must drop below (threshold - this) to stop fleeing
export const PANIC_DECAY_RATE = 0.9; // exponential decay per second (forgiving/fast)
export const PANIC_BASE_INJECT = 4.5; // scales dog injection per second (head-on must cross threshold)
export const PANIC_PROPAGATION_RATE = 4.0; // diffusion pull toward the hottest neighbor (1/s)
export const PANIC_PROPAGATE_MIN = 0.08; // neighbor must exceed this to spread
export const HABITUATION_TIME = 3.0; // seconds of exposure until fully habituated
export const HABITUATED_MIN = 0.25; // surprise multiplier floor once habituated
export const AWARE_RESET_TIME = 1.5; // seconds outside awareness before surprise resets
export const ANGLE_MIN_FACTOR = 0.35; // flanking (tangential) injection multiplier floor

// ---- Gate funnel ----
export const FUNNEL_RADIUS = 140; // how far in front of the gate the current reaches
export const FUNNEL_STRENGTH = 1.2; // steer weight toward the gate mouth
export const FUNNEL_INSET = 26; // how far inside the gate the attractor point sits

// ---- Pen ----
export const PEN_BACK_STRENGTH = 0.3; // gentle push of penned sheep toward the far interior

// ---- Input ----
// Hold left = plant the dog. If the mouse keeps moving while held -> stalk (creep);
// if it goes still -> the dog stops (prone hold). Release -> trot-follow.
export const DRAG_THRESHOLD_PX = 5; // pointer travel to count as "moving while held"
export const STALK_IDLE_MS = 130; // mouse still this long while held -> dog stops (prone)

// ---- Camera ----
export const CAMERA_ZOOM = 0.9; // fixed zoom in Phase 1
export const CAMERA_LOOKAHEAD = 0.35; // seconds of dog velocity to lead the view by
export const CAMERA_EASE = 3.5; // follow ease rate (1/s)

// =====================================================================================
// Phase 2A — flock aliveness. All values grounded where possible in the sheep-behaviour
// literature (see docs/PHASE_2A_PLAN.md). Spatial scale ≈ 11 px/m; durations are
// game-compressed (~100x) but keep real proportions.
// =====================================================================================

// ---- Per-sheep traits (anti-uniformity, §4) ----
// Seeded once at spawn, never mutated. Temperament is heritable & repeatable in real
// sheep (r≈0.1–0.4; breeders select calm-vs-nervous lines — Merino temperament genetics
// 2011). These make the flock read as individuals-in-a-mass rather than clones.
export const SKITTISH_MIN = 0.75; // panic-injection multiplier floor (placid)
export const SKITTISH_MAX = 1.6; // ceiling (jumpy); distribution skewed toward calm (u*u).
// Range chosen so the u*u-skewed mean lands ≈1.0: wiring this into injection (M2) adds
// per-sheep variation without globally raising or lowering how reactive the flock is.
export const SPEED_VAR_MIN = 0.9; // per-sheep max-speed multiplier
export const SPEED_VAR_MAX = 1.1;
export const REST_BIAS_MIN = 0.5; // laziness: scales rest-onset time (low = rests sooner)
export const REST_BIAS_MAX = 1.5;
export const WANDER_MUL_MIN = 0.6; // graze-wander amount multiplier
export const WANDER_MUL_MAX = 1.4;

// ---- Startle wave (§2.2, §3, M1) ----
// Panic propagates outward from a source at a finite speed instead of jumping the whole
// awareness radius in one step: a neighbour only spreads panic once it has been panicked
// long enough for the disturbance to physically travel the gap (panicAge * WAVE_SPEED >=
// distance). This makes a startle read as a visible expanding ripple that fades and dies
// out partway through a large flock (~13.4 m/s agitation wave — Attanasi 2015).
export const WAVE_SPEED = 140; // px/s (~12.7 m/s at 11 px/m) — front propagation speed

// ---- Ambient startle sources (§3, M1) ----
export const MAX_ACTIVE_STARTLES = 4; // fixed capacity for ambient startle emitters
// Birds: an occasional flush pricks up a patch of the flock. Mild — an injection RATE
// (per second), applied over the emitter's short life like a gentle dog nudge, so only
// the nearest few sheep cross the flight threshold. A pretty ripple, never a scatter.
export const BIRD_INTERVAL_MIN = 18; // seconds between bird flushes (min)
export const BIRD_INTERVAL_MAX = 45; // (max); reseeded from the shared RNG on each fire
export const BIRD_STARTLE_MAG = 2.0; // panic injection rate at the emitter centre (per s):
// centre peak ≈ MAG*TTL ≈ 0.6, right at flight threshold, so only a sheep or two nearest
// the flush bolts and a small ring pricks up — a pretty ripple, never a scatter.
export const BIRD_STARTLE_RADIUS = 90; // falloff radius of a bird startle (px)
export const BIRD_STARTLE_TTL = 0.3; // seconds an emitter stays active
export const BIRD_OFFSET_MAX = 60; // how far from the chosen sheep the flush centres (px)
// Wind gusts: the lowest-effort source — a gentle, decaying flock-wide "did you feel that?"
// that briefly nudges calm sheep to ALERT without any panic injection.
export const GUST_INTERVAL_MIN = 45; // seconds between gusts (min)
export const GUST_INTERVAL_MAX = 90; // (max)
export const GUST_ALERT = 0.22; // windAlert set on a gust (unitless alertness)
export const GUST_DECAY = 1.2; // exponential decay of windAlert per second (brief perk)
export const WIND_ALERT_MIN = 0.15; // windAlert above this biases calm sheep toward ALERT
// (with the values above a gust holds the flock's attention only ~0.3s, then it passes)

// ---- Alert (§2.2, M1) ----
// The visible "did you hear that?" beat as a wave passes: a calm sheep whose own panic
// sits in a low band, that sees a panicking neighbour, or that feels a gust stops and
// faces the disturbance, then resolves back to grazing (or escalates to fleeing) as panic
// rises or decays. No dedicated hold timer — the slow panic decay is the natural stare.
export const ALERT_PANIC = 0.12; // own-panic floor to enter ALERT (above GRAZE_PANIC_EPS)
export const ALERT_PANIC_MAX = 0.25; // ...and ceiling: a more-panicked sheep is edgy and MOVES
// (normal walk/flee), it doesn't freeze. A THIN band, so only sheep the wave brushes lightly
// stare — the ripple's leading edge — while the flock coming down from a real fright walks it
// off instead of freezing en masse (which read as stubbornness after the dog pushed them).
export const ALERT_SPEED = 5; // max speed while alert (< HEADING_MIN_SPEED: plants + stares)

// ---- Grazing clusters (§2.3, M3) ----
// Idle grazing cohesion SATURATES with local density: a sheep with GRAZE_SATISFIED_N close
// companions feels no pull and drifts free; a sparser grazer re-gathers. Combined with the
// per-sheep wanderMul desync, sub-groups form, loiter, and dissolve over tens of seconds
// (fission–fusion; most-common sub-group ~12 sheep — Ferdous/Sankey 2023). No group ids.
export const GRAZE_CLUSTER_RADIUS = 55; // "close companion" range, ≈5 m at 11 px/m
export const GRAZE_SATISFIED_N = 8; // close companions at which graze cohesion hits zero
export const W_GRAZE_COHESION = 0.35; // max graze-cohesion weight (when alone); below wander,
// far below the herding W_COHESION 0.9 — aliveness never fights herding. THE feel dial of M3.

// ---- Rest (§1 REST, M4) ----
// A GRAZE-calm, undisturbed sheep counts restTimer down to zero and lies down; the same
// timer then becomes the rest-bout / rise clock. It rises when panic/neighbours/dog wake
// it — but not instantly: a wake trigger only shortens the clock to REST_RISE_DELAY (the
// ~0.4 s reaction latency measured in fish schools), so a startled sleeper is the visible
// laggard before it scrambles up. Real rest bouts run 45–90 min (~2x a graze bout).
export const REST_ONSET_MIN = 20; // seconds calm before a sheep may lie down (min)
export const REST_ONSET_MAX = 60; // (max); scaled per-sheep by restBias
export const REST_DURATION_MIN = 30; // seconds a rest bout lasts (~2x a graze bout, compressed)
export const REST_DURATION_MAX = 90; // (max); scaled per-sheep by restBias
export const REST_WAKE_PANIC = 0.12; // own panic above this wakes a resting sheep
export const REST_RISE_DELAY = 0.4; // seconds between a wake trigger and actually rising (fish latency)

// ---- Lone-sheep return (§2.1, M4) ----
// The topological rejoin already sprints a stray back; this makes it READ as notice-then-
// hurry rather than a tractor beam. The rejoin weight ramps from ~0 to full over
// STRAY_RAMP_TIME once a sheep is stranded, and the stray holds a small arousal floor
// (isolation is measurably arousing — Michelena 2011) that clears the moment it rejoins.
export const STRAY_RAMP_TIME = 0.7; // seconds to ramp the rejoin pull from 0 to full (drift-then-hurry)
export const STRAY_AROUSAL = 0.1; // panic floor held while stranded (below flight threshold)

// ---- Terrain pooling (§2.5, M5) ----
// The undisturbed flock slowly migrates toward per-level attractors (a shade corner, the
// lee of a boulder) instead of freezing in place — glance away, glance back, it has moved.
// A very weak pull (below the graze wander, far below herding) toward the nearest attractor
// whose catchment contains the sheep, active ONLY at low panic so it never fights the dog:
// the instant the flock is spooked (panic past POOL_PANIC_MAX) pooling switches off. Real
// sheep camp on preferred ground ~64% of the time (MSD Vet Manual; Hilder 1966).
export const W_POOL = 0.25; // pull weight toward the pool centre (below WANDER, << W_COHESION)
export const POOL_PANIC_MAX = 0.1; // only sheep calmer than this pool (above it they're too edgy)

// ---- Lead-sheep / FOLLOW (§2.4, M6) ----
// A moving sheep with a flockmate in a tight forward cone chains in behind it: extra
// cohesion+alignment toward that leader. The leader is emergent and rotates — no assigned
// roles — so a moving flock threads single-file (95% follow within ~12 s; Gómez-Nava 2022,
// Pillot 2011). Bonus: sheep line up through the gate. Weaker than the shipped boid terms.
export const FOLLOW_RANGE = 60; // px: how far ahead a leader can be (< AWARENESS_RADIUS)
export const FOLLOW_CONE = 0.82; // cos of the forward half-angle (~35°) that counts as "ahead"
export const FOLLOW_MIN_SPEED = 30; // px/s: only a clearly-moving sheep follows (not a grazer)
export const W_FOLLOW = 0.9; // extra cohesion+alignment weight toward the leader (single-file pull)

// ---- Trample / worn paths (§2.6, M6) ----
// A coarse traffic grid: every sheep (and the dog, ×4) deposits into the cell under it each
// step, clamped to TRAMPLE_MAX, and every cell decays slowly (~100 s fade — a compressed
// weeks-scale recovery, Mwendera 2010). PURELY VISUAL — no behaviour feedback (spec §2.6).
export const TRAMPLE_CELL = 32; // coarse traffic-grid cell size (px)
// Deposit is a RATE (per second in a cell), so a sheep just running across a cell (~0.4 s)
// barely marks it, while dwelling/repeated traffic accumulates. Kept low so wear builds over
// time, not instantly — a single pass stays below the WORN_MIN render threshold; it takes a
// crowd (or a lingering flock) to actually brown the ground. See WornPathsView.
export const TRAMPLE_ADD = 0.12; // deposit rate under a sheep (per second) — a single pass is faint
export const TRAMPLE_DOG_MUL = 3; // the dog packs a path a bit harder than a sheep
export const TRAMPLE_MAX = 1; // per-cell saturation ceiling
export const TRAMPLE_DECAY = 0.01; // exponential fade rate per second (~100 s to 1/e)
