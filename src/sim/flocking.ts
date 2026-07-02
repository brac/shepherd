// Move pass: per-sheep boids (separation, alignment, cohesion, fear) plus flee,
// graze, gate funnel, and penned circulate-to-back. Hand-written loop over indices,
// zero allocation. Neighbor positions are read from the prev (snapshot) arrays so a
// sheep's contribution is stable across the pass; velocity for i is written in place.
//
// Cohesion is LOCAL ONLY (awareness radius). There is no "flock" object. Splitting
// and regrouping are emergent consequences of local cohesion — do not add split/merge.

import {
  DOG_PRONE,
  DOG_STALK,
  FLAG_FLEEING,
  FLAG_PENNED,
  type GameState,
} from "../state/gameState";
import { colOf, rowOf } from "./spatialHash";
import { collideWalls, collideOneWall, collideOut } from "./collision";
import { nextRange } from "./rng";
import {
  AWARENESS_RADIUS,
  BARK_RADIUS,
  FEAR_RADIUS_PRONE,
  FEAR_RADIUS_STALK,
  FEAR_RADIUS_TROT,
  FLEE_COHESION_DAMP,
  FUNNEL_RADIUS,
  FUNNEL_STRENGTH,
  GRAZE_MAX_DWELL,
  GRAZE_MIN_DWELL,
  GRAZE_TURN,
  PEN_BACK_STRENGTH,
  PRONE_SOFTWALL_FORCE,
  PRONE_SOFTWALL_RADIUS,
  SEPARATION_RADIUS,
  SHEEP_FLEE_SPEED,
  SHEEP_GRAZE_SPEED,
  SHEEP_MAX_FORCE,
  SHEEP_RADIUS,
  SHEEP_WALK_SPEED,
  W_ALIGNMENT,
  W_COHESION,
  W_FEAR,
  W_SEPARATION,
} from "../../data/tuning";

// Import the tuning weights not re-exported above.
import { W_FUNNEL as _WF, W_PEN_BACK as _WPB } from "../../data/tuning";

const GRAZE_PANIC_EPS = 0.05; // panic below this counts as calm
const NEIGHBOR_PANIC_EPS = 0.2; // a neighbor above this suppresses grazing

export function updateFlocking(state: GameState, dt: number): void {
  const s = state.sheep;
  const dog = state.dog;
  const grid = state.grid;
  const level = state.level;
  const cols = grid.cols;
  const rows = grid.rows;
  const heads = grid.heads;
  const next = grid.next;
  const rng = state.rng;

  const aware2 = AWARENESS_RADIUS * AWARENESS_RADIUS;
  const sep2 = SEPARATION_RADIUS * SEPARATION_RADIUS;
  const funnel2 = FUNNEL_RADIUS * FUNNEL_RADIUS;

  // Dog fear radius (state-dependent, bark balloons it) for the avoidance steering.
  const proneNow = dog.state === DOG_PRONE;
  let fearRadius: number;
  if (proneNow) fearRadius = FEAR_RADIUS_PRONE;
  else if (dog.state === DOG_STALK) fearRadius = FEAR_RADIUS_STALK;
  else fearRadius = FEAR_RADIUS_TROT;
  if (dog.barkTimer > 0) fearRadius = Math.max(fearRadius, BARK_RADIUS);
  const fear2 = fearRadius * fearRadius;
  const softwall2 = PRONE_SOFTWALL_RADIUS * PRONE_SOFTWALL_RADIUS;

  for (let i = 0; i < s.count; i++) {
    const flags = s.flags[i];
    const px = s.prevX[i];
    const py = s.prevY[i];
    let vx = s.velX[i];
    let vy = s.velY[i];

    // 3x3 cell block around this sheep.
    const c = colOf(grid, px);
    const r = rowOf(grid, py);
    const c0 = c > 0 ? c - 1 : 0;
    const c1 = c < cols - 1 ? c + 1 : cols - 1;
    const r0 = r > 0 ? r - 1 : 0;
    const r1 = r < rows - 1 ? r + 1 : rows - 1;

    // Neighbor accumulators.
    let cohX = 0;
    let cohY = 0;
    let cohN = 0;
    let alignX = 0;
    let alignY = 0;
    let sepX = 0;
    let sepY = 0;
    let sawPanicNeighbor = false;

    for (let rr = r0; rr <= r1; rr++) {
      const rowBase = rr * cols;
      for (let cc = c0; cc <= c1; cc++) {
        let j = heads[rowBase + cc];
        while (j !== -1) {
          if (j !== i) {
            const dx = s.prevX[j] - px;
            const dy = s.prevY[j] - py;
            const d2 = dx * dx + dy * dy;
            if (d2 < aware2) {
              cohX += s.prevX[j];
              cohY += s.prevY[j];
              alignX += s.velX[j];
              alignY += s.velY[j];
              cohN++;
              if (d2 < sep2 && d2 > 1e-6) {
                const d = Math.sqrt(d2);
                const w = (1 - d / SEPARATION_RADIUS) / d;
                sepX -= dx * w;
                sepY -= dy * w;
              }
              if (s.panicPrev[j] > NEIGHBOR_PANIC_EPS) sawPanicNeighbor = true;
            }
          }
          j = next[j];
        }
      }
    }

    // ---- Penned sheep: cohere gently and vacate toward the pen's far interior ----
    if (flags & FLAG_PENNED) {
      let desX = 0;
      let desY = 0;
      if (cohN > 0) {
        const dxc = cohX / cohN - px;
        const dyc = cohY / cohN - py;
        const l = Math.sqrt(dxc * dxc + dyc * dyc);
        if (l > 1e-4) {
          desX += W_COHESION * (dxc / l);
          desY += W_COHESION * (dyc / l);
        }
      }
      const sl = Math.sqrt(sepX * sepX + sepY * sepY);
      if (sl > 1e-6) {
        desX += W_SEPARATION * (sepX / sl);
        desY += W_SEPARATION * (sepY / sl);
      }
      const bx = level.penBackX - px;
      const by = level.penBackY - py;
      const bl = Math.sqrt(bx * bx + by * by);
      if (bl > 1e-4) {
        desX += _WPB * PEN_BACK_STRENGTH * (bx / bl);
        desY += _WPB * PEN_BACK_STRENGTH * (by / bl);
      }
      integrate(s, i, px, py, vx, vy, desX, desY, SHEEP_WALK_SPEED, dt, level, true);
      continue;
    }

    const fleeing = (flags & FLAG_FLEEING) !== 0;

    // Dog geometry.
    const toDX = dog.x - px;
    const toDY = dog.y - py;
    const dogD2 = toDX * toDX + toDY * toDY;

    let desX = 0;
    let desY = 0;

    // ---- Cohesion / alignment (local only) ----
    if (cohN > 0) {
      const cw = fleeing ? W_COHESION * FLEE_COHESION_DAMP : W_COHESION;
      const aw = fleeing ? W_ALIGNMENT * FLEE_COHESION_DAMP : W_ALIGNMENT;
      const dxc = cohX / cohN - px;
      const dyc = cohY / cohN - py;
      const l = Math.sqrt(dxc * dxc + dyc * dyc);
      if (l > 1e-4) {
        desX += cw * (dxc / l);
        desY += cw * (dyc / l);
      }
      const al = Math.sqrt(alignX * alignX + alignY * alignY);
      if (al > 1e-4) {
        desX += aw * (alignX / al);
        desY += aw * (alignY / al);
      }
    }

    // ---- Separation (always full strength) ----
    const sl = Math.sqrt(sepX * sepX + sepY * sepY);
    if (sl > 1e-6) {
      desX += W_SEPARATION * (sepX / sl);
      desY += W_SEPARATION * (sepY / sl);
    }

    // ---- Dog avoidance ----
    if (proneNow) {
      // Prone reads as a soft wall: gentle positional repulsion, no panic.
      if (dogD2 < softwall2 && dogD2 > 1e-4) {
        const d = Math.sqrt(dogD2);
        const w = (PRONE_SOFTWALL_FORCE / SHEEP_MAX_FORCE) * (1 - d / PRONE_SOFTWALL_RADIUS);
        desX += (-toDX / d) * w;
        desY += (-toDY / d) * w;
      }
    } else if (dogD2 < fear2 && dogD2 > 1e-4) {
      const d = Math.sqrt(dogD2);
      const proximity = 1 - d / fearRadius;
      const fw = fleeing ? W_FEAR * 1.6 : W_FEAR * proximity;
      desX += (-toDX / d) * fw;
      desY += (-toDY / d) * fw;
    }

    // ---- Gate funnel (unpenned, near the gate mouth) ----
    const fdx = level.funnelX - px;
    const fdy = level.funnelY - py;
    const fd2 = fdx * fdx + fdy * fdy;
    if (fd2 < funnel2) {
      const fd = Math.sqrt(fd2) || 1e-3;
      const strength = _WF * FUNNEL_STRENGTH * (1 - fd / FUNNEL_RADIUS);
      desX += (fdx / fd) * strength;
      desY += (fdy / fd) * strength;
    }

    // ---- Grazing (calm, dog far, no panicking neighbor) ----
    let maxSpeed = fleeing ? SHEEP_FLEE_SPEED : SHEEP_WALK_SPEED;
    const calm = !fleeing && s.panic[i] < GRAZE_PANIC_EPS && dogD2 > aware2 && !sawPanicNeighbor;
    if (calm) {
      s.grazeTimer[i] -= dt;
      if (s.grazeTimer[i] <= 0) {
        const ang = s.heading[i] + nextRange(rng, -GRAZE_TURN, GRAZE_TURN);
        s.grazeDX[i] = Math.cos(ang);
        s.grazeDY[i] = Math.sin(ang);
        s.grazeTimer[i] = nextRange(rng, GRAZE_MIN_DWELL, GRAZE_MAX_DWELL);
      }
      desX += s.grazeDX[i] * 0.5;
      desY += s.grazeDY[i] * 0.5;
      maxSpeed = SHEEP_GRAZE_SPEED;
    }

    integrate(s, i, px, py, vx, vy, desX, desY, maxSpeed, dt, level, false);
  }
}

// Shared integrate step: desired direction -> steering (clamped accel) -> velocity
// (clamped speed) -> position -> wall collision (+ one-way gate for penned) -> heading.
function integrate(
  s: GameState["sheep"],
  i: number,
  px: number,
  py: number,
  vx: number,
  vy: number,
  desX: number,
  desY: number,
  maxSpeed: number,
  dt: number,
  level: GameState["level"],
  penned: boolean,
): void {
  let desiredVX = 0;
  let desiredVY = 0;
  const dl = Math.sqrt(desX * desX + desY * desY);
  if (dl > 1e-5) {
    desiredVX = (desX / dl) * maxSpeed;
    desiredVY = (desY / dl) * maxSpeed;
  }

  // Steering as clamped acceleration.
  let steerX = desiredVX - vx;
  let steerY = desiredVY - vy;
  const sm = Math.sqrt(steerX * steerX + steerY * steerY);
  if (sm > SHEEP_MAX_FORCE) {
    const k = SHEEP_MAX_FORCE / sm;
    steerX *= k;
    steerY *= k;
  }
  vx += steerX * dt;
  vy += steerY * dt;

  // Clamp speed.
  const sp = Math.sqrt(vx * vx + vy * vy);
  if (sp > maxSpeed) {
    const k = maxSpeed / sp;
    vx *= k;
    vy *= k;
  }

  // Integrate + collide.
  let nx = px + vx * dt;
  let ny = py + vy * dt;
  collideWalls(level.walls, level.wallCount, nx, ny, vx, vy, SHEEP_RADIUS);
  nx = collideOut.x;
  ny = collideOut.y;
  vx = collideOut.vx;
  vy = collideOut.vy;
  if (penned) {
    collideOneWall(level.gateWall, nx, ny, vx, vy, SHEEP_RADIUS);
    nx = collideOut.x;
    ny = collideOut.y;
    vx = collideOut.vx;
    vy = collideOut.vy;
  }

  s.posX[i] = nx;
  s.posY[i] = ny;
  s.velX[i] = vx;
  s.velY[i] = vy;
  if (sp > 4) s.heading[i] = Math.atan2(vy, vx);
}
