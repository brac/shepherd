// Move pass: per-sheep boids (separation, alignment, cohesion, fear) plus flee,
// graze, gate funnel, and penned circulate-to-back. Hand-written loop over indices,
// zero allocation. Neighbor positions are read from the prev (snapshot) arrays so a
// sheep's contribution is stable across the pass; velocity for i is written in place.
//
// Cohesion is LOCAL ONLY (awareness radius). There is no "flock" object. Splitting
// and regrouping are emergent consequences of local cohesion — do not add split/merge.

import {
  ACT_ALERT,
  ACT_GRAZE,
  DOG_PRONE,
  DOG_STALK,
  FLAG_FLEEING,
  FLAG_PENNED,
  type GameState,
} from "../state/gameState";
import { colOf, rowOf } from "./spatialHash";
import { collideWalls, collideOut } from "./collision";
import { nextRange, nextSigned } from "./rng";
import {
  ALERT_PANIC,
  ALERT_PANIC_MAX,
  ALERT_SPEED,
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
  HEADING_EASE,
  HEADING_MIN_SPEED,
  PANIC_COHESION_GAIN,
  PENNED_SPEED,
  PEN_BACK_STRENGTH,
  PRONE_SOFTWALL_FORCE,
  PRONE_SOFTWALL_RADIUS,
  REAR_WEIGHT,
  REJOIN_MIN_NEIGHBORS,
  SEPARATION_RADIUS,
  SHEEP_FLEE_SPEED,
  SHEEP_GRAZE_SPEED,
  SHEEP_MAX_FORCE,
  SHEEP_RADIUS,
  SHEEP_WALK_SPEED,
  TOPO_K,
  W_ALIGNMENT,
  W_COHESION,
  W_FEAR,
  W_NOISE,
  W_REJOIN,
  W_SEPARATION,
  WIND_ALERT_MIN,
} from "../../data/tuning";

// Import the tuning weights not re-exported above.
import { W_FUNNEL as _WF, W_PEN_BACK as _WPB } from "../../data/tuning";

const GRAZE_PANIC_EPS = 0.05; // panic below this counts as calm
const NEIGHBOR_PANIC_EPS = 0.2; // a neighbor above this suppresses grazing
const TWO_PI = Math.PI * 2;

// Scratch for the topological k-nearest search (reused; single-threaded => safe).
const kIdx = new Int32Array(TOPO_K);
const kD2 = new Float32Array(TOPO_K);
const rejoinOut = { x: 0, y: 0, found: false };

/**
 * Fill rejoinOut with the centre of mass of sheep i's TOPO_K nearest neighbours,
 * searching outward ring by ring over the grid (so it finds the flock even when it
 * is beyond the 3x3 metric block). Reads snapshot (prev) positions. Zero allocation.
 */
function findKNearestCentroid(state: GameState, i: number, px: number, py: number): void {
  const grid = state.grid;
  const s = state.sheep;
  const cols = grid.cols;
  const rows = grid.rows;
  const ci = colOf(grid, px);
  const ri = rowOf(grid, py);
  let cnt = 0;
  let worstIdx = -1;
  let worstD2 = -1;
  const maxRing = cols > rows ? cols : rows;

  for (let ring = 0; ring <= maxRing; ring++) {
    const rLo = ri - ring;
    const rHi = ri + ring;
    const cLo = ci - ring;
    const cHi = ci + ring;
    for (let rr = rLo; rr <= rHi; rr++) {
      if (rr < 0 || rr >= rows) continue;
      const onRowEdge = rr === rLo || rr === rHi;
      const rowBase = rr * cols;
      for (let cc = cLo; cc <= cHi; cc++) {
        if (cc < 0 || cc >= cols) continue;
        // Only the border cells of this ring (interior was covered by smaller rings).
        if (!onRowEdge && cc !== cLo && cc !== cHi) continue;
        let j = grid.heads[rowBase + cc];
        while (j !== -1) {
          if (j !== i) {
            const dx = s.prevX[j] - px;
            const dy = s.prevY[j] - py;
            const d2 = dx * dx + dy * dy;
            if (cnt < TOPO_K) {
              kIdx[cnt] = j;
              kD2[cnt] = d2;
              cnt++;
              if (cnt === TOPO_K) {
                worstD2 = -1;
                for (let m = 0; m < TOPO_K; m++) {
                  if (kD2[m] > worstD2) {
                    worstD2 = kD2[m];
                    worstIdx = m;
                  }
                }
              }
            } else if (d2 < worstD2) {
              kIdx[worstIdx] = j;
              kD2[worstIdx] = d2;
              worstD2 = -1;
              for (let m = 0; m < TOPO_K; m++) {
                if (kD2[m] > worstD2) {
                  worstD2 = kD2[m];
                  worstIdx = m;
                }
              }
            }
          }
          j = grid.next[j];
        }
      }
    }
    // Once we have K, stop when no closer neighbour can exist in further rings.
    if (cnt >= TOPO_K) {
      const bound = ring * grid.cellSize;
      if (bound * bound > worstD2) break;
    }
  }

  if (cnt === 0) {
    rejoinOut.found = false;
    return;
  }
  let sx = 0;
  let sy = 0;
  for (let m = 0; m < cnt; m++) {
    sx += s.prevX[kIdx[m]];
    sy += s.prevY[kIdx[m]];
  }
  rejoinOut.x = sx / cnt;
  rejoinOut.y = sy / cnt;
  rejoinOut.found = true;
}

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
  const gustAlert = state.ambient.windAlert > WIND_ALERT_MIN; // a gust perks the whole flock

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

    // Forward direction (from velocity) for the vision / blind-rear weighting: a
    // neighbour behind a moving sheep counts less, so the flock elongates along motion
    // instead of settling into an isotropic disc.
    let fwdX = 0;
    let fwdY = 0;
    let hasFwd = false;
    const spd0 = Math.sqrt(vx * vx + vy * vy);
    if (spd0 > HEADING_MIN_SPEED) {
      fwdX = vx / spd0;
      fwdY = vy / spd0;
      hasFwd = true;
    }

    // Neighbor accumulators. cohWsum is the vision-weighted count for the centroid;
    // cohN is the raw count used to decide whether this sheep is a stray.
    let cohX = 0;
    let cohY = 0;
    let cohWsum = 0;
    let cohN = 0;
    let alignX = 0;
    let alignY = 0;
    let sepX = 0;
    let sepY = 0;
    let sawPanicNeighbor = false;
    // Track the most-panicked neighbour so an ALERT sheep can turn to face the disturbance.
    let hotPanic = 0;
    let hotDX = 0;
    let hotDY = 0;

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
              let vw = 1;
              if (hasFwd && fwdX * dx + fwdY * dy < 0) vw = REAR_WEIGHT; // behind = blind zone
              cohX += s.prevX[j] * vw;
              cohY += s.prevY[j] * vw;
              cohWsum += vw;
              alignX += s.velX[j] * vw;
              alignY += s.velY[j] * vw;
              cohN++;
              if (d2 < sep2 && d2 > 1e-6) {
                const d = Math.sqrt(d2);
                const w = (1 - d / SEPARATION_RADIUS) / d;
                sepX -= dx * w;
                sepY -= dy * w;
              }
              if (s.panicPrev[j] > NEIGHBOR_PANIC_EPS) {
                sawPanicNeighbor = true;
                if (s.panicPrev[j] > hotPanic) {
                  hotPanic = s.panicPrev[j];
                  hotDX = dx;
                  hotDY = dy;
                }
              }
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
      if (cohWsum > 0) {
        const dxc = cohX / cohWsum - px;
        const dyc = cohY / cohWsum - py;
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
      integrate(s, i, px, py, vx, vy, desX, desY, PENNED_SPEED, dt, level, true);
      continue;
    }

    const fleeing = (flags & FLAG_FLEEING) !== 0;
    const panicI = s.panic[i];

    // Dog geometry.
    const toDX = dog.x - px;
    const toDY = dog.y - py;
    const dogD2 = toDX * toDX + toDY * toDY;

    let desX = 0;
    let desY = 0;

    // ---- Cohesion / alignment (local only) ----
    // Cohesion tightens with panic (selfish herd: a pressured flock bunches and rounds
    // up rather than shearing into singletons).
    if (cohWsum > 0) {
      const cohBase = fleeing ? W_COHESION * FLEE_COHESION_DAMP : W_COHESION;
      const cw = cohBase * (1 + PANIC_COHESION_GAIN * panicI);
      const aw = fleeing ? W_ALIGNMENT * FLEE_COHESION_DAMP : W_ALIGNMENT;
      const dxc = cohX / cohWsum - px;
      const dyc = cohY / cohWsum - py;
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

    // ---- Topological rejoin (stray sheep sprint back to the flock) ----
    // A sheep with too few metric neighbours steers toward the centre of mass of its
    // K nearest flockmates (found via an outward ring search, so distance is no object).
    // The pull scales with isolation, so a fully lone sheep is pulled hardest while a
    // sheared-off *group* (still has internal neighbours) is left free to drift.
    if (cohN < REJOIN_MIN_NEIGHBORS) {
      findKNearestCentroid(state, i, px, py);
      if (rejoinOut.found) {
        const rdx = rejoinOut.x - px;
        const rdy = rejoinOut.y - py;
        const rl = Math.sqrt(rdx * rdx + rdy * rdy);
        if (rl > 1e-3) {
          const iso = (REJOIN_MIN_NEIGHBORS - cohN) / REJOIN_MIN_NEIGHBORS; // 1 when alone
          const w = W_REJOIN * iso;
          desX += (rdx / rl) * w;
          desY += (rdy / rl) * w;
        }
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

    // ---- Activity: GRAZE (calm) / ALERT (a disturbance passing) ----
    // A stranded sheep is anxious, not content — it hurries back at walk speed rather
    // than grazing slowly, so the rejoin pull isn't throttled to graze speed.
    let maxSpeed = fleeing ? SHEEP_FLEE_SPEED : SHEEP_WALK_SPEED;
    const calm =
      !fleeing &&
      panicI < GRAZE_PANIC_EPS &&
      dogD2 > aware2 &&
      !sawPanicNeighbor &&
      !gustAlert &&
      cohN >= REJOIN_MIN_NEIGHBORS;
    // ALERT: a passing-disturbance beat, ONLY when the dog isn't actively pressuring this
    // sheep (dog beyond its fear reach) and the sheep is only lightly disturbed — own panic
    // in a thin low band (the wave brushing past), or a gust. It plants and stares (heading
    // set below). Within fear range, or more panicked than the band, it stays responsive
    // (walks/flees) and never freezes — so a herded flock keeps flowing.
    const alert =
      !calm &&
      !fleeing &&
      dogD2 > fear2 &&
      ((panicI >= ALERT_PANIC && panicI < ALERT_PANIC_MAX) || gustAlert);
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
      s.activity[i] = ACT_GRAZE;
    } else if (alert) {
      maxSpeed = ALERT_SPEED; // below HEADING_MIN_SPEED, so it plants and the stare holds
      s.activity[i] = ACT_ALERT;
    } else {
      s.activity[i] = ACT_GRAZE; // walking normally (settling / fleeing owns its own motion)
    }

    // ---- Angular noise (per-sheep individuality; breaks the perfect-lattice/disc) ----
    desX += nextSigned(rng, W_NOISE);
    desY += nextSigned(rng, W_NOISE);

    integrate(s, i, px, py, vx, vy, desX, desY, maxSpeed, dt, level, false);

    // An ALERT sheep turns to face the disturbance (the most-panicked neighbour, or the
    // dog if it's the source). Done after integrate so it wins over velocity-facing.
    if (alert) {
      const dX = hotPanic > 0 ? hotDX : toDX;
      const dY = hotPanic > 0 ? hotDY : toDY;
      if (dX * dX + dY * dY > 1e-4) {
        const target = Math.atan2(dY, dX);
        let d = target - s.heading[i];
        if (d > Math.PI) d -= TWO_PI;
        else if (d < -Math.PI) d += TWO_PI;
        s.heading[i] += d * Math.min(1, HEADING_EASE * dt);
      }
    }
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

  // Integrate + collide. Penned sheep use the fully-enclosed inward pen boundary so
  // they can never be pulled out; everyone else uses the open-gate wall set.
  let nx = px + vx * dt;
  let ny = py + vy * dt;
  const walls = penned ? level.pennedWalls : level.walls;
  const wallCount = penned ? level.pennedWallCount : level.wallCount;
  collideWalls(walls, wallCount, nx, ny, vx, vy, SHEEP_RADIUS);
  nx = collideOut.x;
  ny = collideOut.y;
  vx = collideOut.vx;
  vy = collideOut.vy;

  s.posX[i] = nx;
  s.posY[i] = ny;
  s.velX[i] = vx;
  s.velY[i] = vy;

  // Heading eases toward the velocity direction (only while actually moving) so a
  // jittering sheep can't spin — no per-frame 180 degrees snaps. Angle delta wrapped
  // to [-pi, pi] arithmetically (one atan2, no extra trig).
  if (sp > HEADING_MIN_SPEED) {
    const target = Math.atan2(vy, vx);
    let d = target - s.heading[i];
    if (d > Math.PI) d -= TWO_PI;
    else if (d < -Math.PI) d += TWO_PI;
    s.heading[i] += d * Math.min(1, HEADING_EASE * dt);
  }
}
