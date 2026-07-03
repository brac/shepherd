// The single mutable GameState. One object owns everything: sheep SoA, dog, input,
// camera, spatial grid, level. Systems mutate it in place. No per-entity classes.

import { buildLevel, type Level, type LevelDef } from "./level";
import { createRng, type Rng } from "../sim/rng";
import { spawnSheep } from "../sim/spawn";
import {
  AWARENESS_RADIUS,
  BIRD_INTERVAL_MIN,
  GUST_INTERVAL_MIN,
  MAX_ACTIVE_STARTLES,
  TRAMPLE_CELL,
} from "../../data/tuning";

// Sheep flag bits (stored in the flags Uint8Array).
export const FLAG_FLEEING = 1 << 0;
export const FLAG_PENNED = 1 << 1;

// Sheep activity state (Phase 2A). Orthogonal to panic/FLAG_FLEEING: activity governs
// LOW-panic behavior (what a sheep does when the dog isn't pressuring it). Stored in the
// `activity` Uint8Array. GRAZE is the zero default.
export const ACT_GRAZE = 0;
export const ACT_REST = 1;
export const ACT_ALERT = 2;
export const ACT_FOLLOW = 3;

// Dog states.
export const DOG_TROT = 0;
export const DOG_PRONE = 1;
export const DOG_STALK = 2;
export type DogState = 0 | 1 | 2;

/** Structure-of-Arrays sheep pool. Index i is one sheep across every array. */
export interface SheepPool {
  count: number;
  posX: Float32Array;
  posY: Float32Array;
  prevX: Float32Array; // position at the start of the current step (render interp + neighbor snapshot)
  prevY: Float32Array;
  velX: Float32Array;
  velY: Float32Array;
  heading: Float32Array;
  panic: Float32Array;
  panicPrev: Float32Array; // panic snapshot read by propagation (double buffer)
  dogAwareTime: Float32Array; // seconds the dog has been within awareness (surprise attenuation)
  awareCooldown: Float32Array; // seconds since dog last inside awareness (resets surprise)
  grazeTimer: Float32Array; // seconds until the next seeded wander decision
  grazeDX: Float32Array; // current graze wander direction
  grazeDY: Float32Array;
  corrX: Float32Array; // scratch: per-step positional de-overlap correction
  corrY: Float32Array;
  bodyR: Float32Array; // per-sheep de-overlap half-size (seeded variation breaks the lattice)
  flags: Uint8Array;
  // ---- Phase 2A aliveness ----
  activity: Uint8Array; // ACT_GRAZE | ACT_REST | ACT_ALERT | ACT_FOLLOW
  panicAge: Float32Array; // seconds since panic last crossed PANIC_PROPAGATE_MIN (wave front)
  restTimer: Float32Array; // countdown to a GRAZE->REST transition, then rest/rise clock
  strayTimer: Float32Array; // seconds spent stranded (drift-then-hurry rejoin ramp)
  // Per-sheep traits: seeded once at spawn, never mutated (anti-uniformity).
  skittish: Float32Array; // panic-injection sensitivity multiplier
  speedMul: Float32Array; // max-speed multiplier
  restBias: Float32Array; // laziness: scales rest-onset time
  wanderMul: Float32Array; // graze-wander amount multiplier
  idlePhase: Float32Array; // per-sheep phase offset for idle micro-motion (Phase 2B)
}

export interface DogStateObj {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  velX: number;
  velY: number;
  facing: number; // radians
  state: DogState;
  barkCooldown: number; // seconds until bark ready again
  barkTimer: number; // seconds of transient bark radius remaining
  barkFired: boolean; // bark triggered this step -> panic pass applies the one-shot burst
}

export interface InputState {
  mouseWorldX: number;
  mouseWorldY: number;
  leftDown: boolean; // left button held -> dog is planted (stalk or stop)
  dragging: boolean; // mouse moving while held -> stalk; still -> the dog stops
  barkQueued: boolean; // consumed once by the sim
}

export interface CameraState {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  zoom: number;
}

export interface Grid {
  cellSize: number;
  cols: number;
  rows: number;
  minX: number;
  minY: number;
  heads: Int32Array; // heads[cell] = first sheep index, or -1
  next: Int32Array; // next[i] = next sheep in the same cell, or -1
}

/** Fixed-capacity pool of ambient startle emitters (birds, gusts). Phase 2A §3. */
export interface AmbientState {
  startleX: Float32Array;
  startleY: Float32Array;
  startleMag: Float32Array; // peak panic injected at the emitter centre
  startleTtl: Float32Array; // seconds of life remaining (<=0 = slot free)
  birdCountdown: number; // seconds until the next bird flush
  gustCountdown: number; // seconds until the next wind gust
  windAlert: number; // decaying flock-wide alertness from the last gust
}

/** Coarse traffic grid for worn paths (Phase 2A §2.6). Purely visual; no sim feedback. */
export interface TrampleGrid {
  cellSize: number;
  cols: number;
  rows: number;
  minX: number;
  minY: number;
  val: Float32Array; // per-cell accumulated, slowly-decaying traffic
}

export interface GameState {
  seed: number;
  rng: Rng;
  tick: number;
  simTime: number;
  sheep: SheepPool;
  pennedCount: number;
  won: boolean;
  dog: DogStateObj;
  input: InputState;
  camera: CameraState;
  level: Level;
  grid: Grid;
  ambient: AmbientState;
  trample: TrampleGrid;
}

function polyBounds(poly: Float32Array): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < poly.length; i += 2) {
    const x = poly[i];
    const y = poly[i + 1];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

function createSheepPool(count: number): SheepPool {
  return {
    count,
    posX: new Float32Array(count),
    posY: new Float32Array(count),
    prevX: new Float32Array(count),
    prevY: new Float32Array(count),
    velX: new Float32Array(count),
    velY: new Float32Array(count),
    heading: new Float32Array(count),
    panic: new Float32Array(count),
    panicPrev: new Float32Array(count),
    dogAwareTime: new Float32Array(count),
    awareCooldown: new Float32Array(count),
    grazeTimer: new Float32Array(count),
    grazeDX: new Float32Array(count),
    grazeDY: new Float32Array(count),
    corrX: new Float32Array(count),
    corrY: new Float32Array(count),
    bodyR: new Float32Array(count),
    flags: new Uint8Array(count),
    activity: new Uint8Array(count),
    panicAge: new Float32Array(count),
    restTimer: new Float32Array(count),
    strayTimer: new Float32Array(count),
    skittish: new Float32Array(count),
    speedMul: new Float32Array(count),
    restBias: new Float32Array(count),
    wanderMul: new Float32Array(count),
    idlePhase: new Float32Array(count),
  };
}

function createAmbient(): AmbientState {
  return {
    startleX: new Float32Array(MAX_ACTIVE_STARTLES),
    startleY: new Float32Array(MAX_ACTIVE_STARTLES),
    startleMag: new Float32Array(MAX_ACTIVE_STARTLES),
    startleTtl: new Float32Array(MAX_ACTIVE_STARTLES),
    // First events fire after a natural delay (not at t=0), then reseed from the RNG.
    birdCountdown: BIRD_INTERVAL_MIN,
    gustCountdown: GUST_INTERVAL_MIN,
    windAlert: 0,
  };
}

function createTrample(level: Level): TrampleGrid {
  const cellSize = TRAMPLE_CELL;
  const b = polyBounds(level.fieldPoly);
  const minX = b.minX;
  const minY = b.minY;
  const cols = Math.ceil((b.maxX - b.minX) / cellSize) + 1;
  const rows = Math.ceil((b.maxY - b.minY) / cellSize) + 1;
  return { cellSize, cols, rows, minX, minY, val: new Float32Array(cols * rows) };
}

function createGrid(level: Level): Grid {
  const cellSize = AWARENESS_RADIUS;
  const b = polyBounds(level.fieldPoly);
  // Pad by one cell so the pen (which extends to the field edge) and edge sheep are covered.
  const minX = b.minX - cellSize;
  const minY = b.minY - cellSize;
  const cols = Math.ceil((b.maxX - b.minX) / cellSize) + 2;
  const rows = Math.ceil((b.maxY - b.minY) / cellSize) + 2;
  return {
    cellSize,
    cols,
    rows,
    minX,
    minY,
    heads: new Int32Array(cols * rows),
    next: new Int32Array(0), // sized to sheep count below
  };
}

export function createGameState(def: LevelDef, seedOverride?: number): GameState {
  const seed = seedOverride ?? def.seed;
  const level = buildLevel(def);
  const rng = createRng(seed);
  const sheep = createSheepPool(def.sheepCount);
  const grid = createGrid(level);
  grid.next = new Int32Array(sheep.count);

  const state: GameState = {
    seed,
    rng,
    tick: 0,
    simTime: 0,
    sheep,
    pennedCount: 0,
    won: false,
    dog: {
      x: level.dogStartX,
      y: level.dogStartY,
      prevX: level.dogStartX,
      prevY: level.dogStartY,
      velX: 0,
      velY: 0,
      facing: 0,
      state: DOG_TROT,
      barkCooldown: 0,
      barkTimer: 0,
      barkFired: false,
    },
    input: {
      mouseWorldX: level.dogStartX,
      mouseWorldY: level.dogStartY,
      leftDown: false,
      dragging: false,
      barkQueued: false,
    },
    camera: {
      x: level.dogStartX,
      y: level.dogStartY,
      prevX: level.dogStartX,
      prevY: level.dogStartY,
      zoom: 1,
    },
    level,
    grid,
    ambient: createAmbient(),
    trample: createTrample(level),
  };

  spawnSheep(state);
  return state;
}
