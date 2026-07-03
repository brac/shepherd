// Ambient startle pass (Phase 2A §3, M1). Runs BEFORE panic so the emitters it seeds are
// visible to updatePanic the same step. Advances the bird/gust timers and, on fire, drops
// a short-lived startle emitter into the fixed-capacity pool (birds) or raises a decaying
// flock-wide alertness (gusts). All randomness draws from the shared seeded RNG in a fixed
// order so the step stays deterministic. Zero allocation.

import type { GameState } from "../state/gameState";
import { nextFloat, nextRange } from "./rng";
import {
  BIRD_INTERVAL_MAX,
  BIRD_INTERVAL_MIN,
  BIRD_OFFSET_MAX,
  BIRD_STARTLE_MAG,
  BIRD_STARTLE_TTL,
  GUST_ALERT,
  GUST_DECAY,
  GUST_INTERVAL_MAX,
  GUST_INTERVAL_MIN,
} from "../../data/tuning";

const TWO_PI = Math.PI * 2;

export function updateAmbient(state: GameState, dt: number): void {
  const a = state.ambient;
  const s = state.sheep;
  const rng = state.rng;
  const cap = a.startleTtl.length;

  // Age out active emitters.
  for (let k = 0; k < cap; k++) {
    if (a.startleTtl[k] > 0) a.startleTtl[k] -= dt;
  }

  // Decaying flock-wide wind alertness from the last gust.
  if (a.windAlert > 0) {
    a.windAlert *= Math.exp(-GUST_DECAY * dt);
    if (a.windAlert < 1e-4) a.windAlert = 0;
  }

  // --- Birds: an occasional flush startles a patch of the flock. ---
  a.birdCountdown -= dt;
  if (a.birdCountdown <= 0) {
    a.birdCountdown = nextRange(rng, BIRD_INTERVAL_MIN, BIRD_INTERVAL_MAX);
    if (s.count > 0) {
      // Pick a seeded sheep and an offset near it — the flush lands on the flock, not in
      // empty field, so it always reads. (Positions are still last step's, == the snapshot.)
      const idx = Math.min(s.count - 1, (nextFloat(rng) * s.count) | 0);
      const ang = nextFloat(rng) * TWO_PI;
      const off = nextFloat(rng) * BIRD_OFFSET_MAX;
      const x = s.posX[idx] + Math.cos(ang) * off;
      const y = s.posY[idx] + Math.sin(ang) * off;
      // Reuse the freeest slot (smallest remaining ttl) so the fixed pool never overflows.
      let slot = 0;
      let minTtl = a.startleTtl[0];
      for (let k = 1; k < cap; k++) {
        if (a.startleTtl[k] < minTtl) {
          minTtl = a.startleTtl[k];
          slot = k;
        }
      }
      a.startleX[slot] = x;
      a.startleY[slot] = y;
      a.startleMag[slot] = BIRD_STARTLE_MAG;
      a.startleTtl[slot] = BIRD_STARTLE_TTL;
    }
  }

  // --- Wind gusts: a gentle, decaying flock-wide alert (no panic injection). ---
  a.gustCountdown -= dt;
  if (a.gustCountdown <= 0) {
    a.gustCountdown = nextRange(rng, GUST_INTERVAL_MIN, GUST_INTERVAL_MAX);
    a.windAlert = GUST_ALERT;
  }
}
