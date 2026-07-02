// Panic pass: one continuous 0-1 scalar per sheep governs everything. Each step,
// per sheep in index order: decay -> dog injection (angle x speed x surprise x
// proximity) -> bark burst -> propagation from neighbors (reads the panicPrev
// snapshot, so it is order-independent) -> clamp -> set/clear the FLEEING flag with
// hysteresis. Zero allocation.

import {
  DOG_PRONE,
  FLAG_FLEEING,
  type GameState,
} from "../state/gameState";
import { colOf, rowOf } from "./spatialHash";
import {
  ANGLE_MIN_FACTOR,
  AWARENESS_RADIUS,
  AWARE_RESET_TIME,
  BARK_BURST,
  BARK_RADIUS,
  DOG_TROT_SPEED,
  FEAR_RADIUS_PRONE,
  FEAR_RADIUS_STALK,
  FEAR_RADIUS_TROT,
  FLIGHT_HYSTERESIS,
  FLIGHT_THRESHOLD,
  HABITUATED_MIN,
  HABITUATION_TIME,
  PANIC_BASE_INJECT,
  PANIC_DECAY_RATE,
  PANIC_PROPAGATE_MIN,
  PANIC_PROPAGATION_RATE,
} from "../../data/tuning";
import { DOG_STALK } from "../state/gameState";

export function updatePanic(state: GameState, dt: number): void {
  const s = state.sheep;
  const dog = state.dog;
  const grid = state.grid;
  const cols = grid.cols;
  const rows = grid.rows;
  const heads = grid.heads;
  const next = grid.next;

  const decayMul = Math.exp(-PANIC_DECAY_RATE * dt);
  const aware2 = AWARENESS_RADIUS * AWARENESS_RADIUS;
  const bark2 = BARK_RADIUS * BARK_RADIUS;

  // Dog state -> fear radius (bark transiently balloons it).
  let fearRadius: number;
  if (dog.state === DOG_PRONE) fearRadius = FEAR_RADIUS_PRONE;
  else if (dog.state === DOG_STALK) fearRadius = FEAR_RADIUS_STALK;
  else fearRadius = FEAR_RADIUS_TROT;
  if (dog.barkTimer > 0) fearRadius = Math.max(fearRadius, BARK_RADIUS);
  const fear2 = fearRadius * fearRadius;

  const dogSpeed = Math.hypot(dog.velX, dog.velY);
  const speedFactor = 0.2 + 0.8 * Math.min(1, dogSpeed / DOG_TROT_SPEED);
  // Normalized dog velocity direction (for head-on vs flanking).
  let dvx = 0;
  let dvy = 0;
  if (dogSpeed > 1e-3) {
    dvx = dog.velX / dogSpeed;
    dvy = dog.velY / dogSpeed;
  }
  const dogMoving = dogSpeed > 1e-3;
  const proneNow = dog.state === DOG_PRONE;

  for (let i = 0; i < s.count; i++) {
    let p = s.panic[i];

    // --- Decay (forgiving) ---
    p *= decayMul;

    // --- Awareness bookkeeping (surprise) ---
    const toDX = dog.x - s.prevX[i];
    const toDY = dog.y - s.prevY[i];
    const dogD2 = toDX * toDX + toDY * toDY;
    if (dogD2 < aware2) {
      s.dogAwareTime[i] += dt;
      s.awareCooldown[i] = 0;
    } else {
      s.awareCooldown[i] += dt;
      if (s.awareCooldown[i] > AWARE_RESET_TIME) s.dogAwareTime[i] = 0;
    }

    // --- Dog injection ---
    if (!proneNow && dogD2 < fear2) {
      const dist = Math.sqrt(dogD2) || 1e-3;
      const proximity = 1 - dist / fearRadius;
      // Head-on: dog velocity points at the sheep -> toSheep aligns with dogVel.
      let angleFactor = 1;
      if (dogMoving) {
        const tsx = -toDX / dist; // dog -> sheep direction
        const tsy = -toDY / dist;
        const align = dvx * tsx + dvy * tsy; // 1 = head-on, 0 = flanking
        const a = align > 0 ? align : 0;
        angleFactor = ANGLE_MIN_FACTOR + (1 - ANGLE_MIN_FACTOR) * a;
      }
      // Surprise: less time in awareness -> higher injection.
      const habit = Math.min(1, s.dogAwareTime[i] / HABITUATION_TIME);
      const surprise = 1 + (HABITUATED_MIN - 1) * habit;
      p += PANIC_BASE_INJECT * speedFactor * angleFactor * surprise * proximity * dt;
    }

    // --- Bark burst (one-shot, radial, angle-independent) ---
    if (dog.barkFired && dogD2 < bark2) {
      const dist = Math.sqrt(dogD2);
      p += BARK_BURST * (1 - dist / BARK_RADIUS);
    }

    // --- Propagation from neighbors (reads panicPrev snapshot) ---
    // Diffusion toward the hottest neighbor's *influence* (its panic scaled by
    // proximity — closer neighbors matter more), pulled at a rate < 1/step. Because
    // the pull never fully offsets decay, a mutually-panicking cluster still relaxes
    // once its source (the dog) leaves: no self-sustaining fixed point, so a scatter
    // is always recoverable. A genuinely terrified neighbor still drags calm sheep
    // over the flight threshold, so cascades remain.
    let maxInfl = 0;
    const px = s.prevX[i];
    const py = s.prevY[i];
    const c = colOf(grid, px);
    const r = rowOf(grid, py);
    const c0 = c > 0 ? c - 1 : 0;
    const c1 = c < cols - 1 ? c + 1 : cols - 1;
    const r0 = r > 0 ? r - 1 : 0;
    const r1 = r < rows - 1 ? r + 1 : rows - 1;
    for (let rr = r0; rr <= r1; rr++) {
      const base = rr * cols;
      for (let cc = c0; cc <= c1; cc++) {
        let j = heads[base + cc];
        while (j !== -1) {
          if (j !== i) {
            const npj = s.panicPrev[j];
            if (npj > PANIC_PROPAGATE_MIN) {
              const dx = s.prevX[j] - px;
              const dy = s.prevY[j] - py;
              const d2 = dx * dx + dy * dy;
              if (d2 < aware2) {
                const d = Math.sqrt(d2);
                const infl = npj * (1 - d / AWARENESS_RADIUS);
                if (infl > maxInfl) maxInfl = infl;
              }
            }
          }
          j = next[j];
        }
      }
    }
    if (maxInfl > p) p += (maxInfl - p) * PANIC_PROPAGATION_RATE * dt;

    // --- Clamp + flight threshold with hysteresis ---
    if (p < 0) p = 0;
    else if (p > 1) p = 1;
    s.panic[i] = p;

    const flags = s.flags[i];
    if (p >= FLIGHT_THRESHOLD) {
      s.flags[i] = flags | FLAG_FLEEING;
    } else if (p < FLIGHT_THRESHOLD - FLIGHT_HYSTERESIS) {
      s.flags[i] = flags & ~FLAG_FLEEING;
    }
  }
}
