// All sim tunables live here. The sim reads these; it never hardcodes a number.
// Values are placeholders to be tuned (see PHASE_1_SCOPE "First tuning pass").
// Units: distances in world pixels, speeds in px/s, times in seconds, rates per second.

// ---- Timestep ----
export const SIM_HZ = 240;
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
