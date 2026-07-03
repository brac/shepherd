// Seeded spawn of the sheep pool into the level's spawn region.
// Runs once at load; allocation-free use of the shared seeded RNG.

import type { GameState } from "../state/gameState";
import { nextFloat, nextRange } from "./rng";
import {
  BODY_SIZE_MAX,
  BODY_SIZE_MIN,
  GRAZE_MAX_DWELL,
  GRAZE_MIN_DWELL,
  REST_BIAS_MAX,
  REST_BIAS_MIN,
  REST_ONSET_MAX,
  REST_ONSET_MIN,
  SHEEP_COLLIDE_DIST,
  SKITTISH_MAX,
  SKITTISH_MIN,
  SPEED_VAR_MAX,
  SPEED_VAR_MIN,
  WANDER_MUL_MAX,
  WANDER_MUL_MIN,
} from "../../data/tuning";

export function spawnSheep(state: GameState): void {
  const s = state.sheep;
  const region = state.level.spawn;
  const rng = state.rng;

  for (let i = 0; i < s.count; i++) {
    const x = region.x + nextFloat(rng) * region.w;
    const y = region.y + nextFloat(rng) * region.h;
    s.posX[i] = x;
    s.posY[i] = y;
    s.prevX[i] = x;
    s.prevY[i] = y;
    s.velX[i] = 0;
    s.velY[i] = 0;
    s.heading[i] = nextRange(rng, -Math.PI, Math.PI);
    s.panic[i] = 0;
    s.panicPrev[i] = 0;
    s.dogAwareTime[i] = 0;
    s.awareCooldown[i] = 999;
    s.grazeTimer[i] = nextRange(rng, GRAZE_MIN_DWELL, GRAZE_MAX_DWELL);
    s.grazeDX[i] = 0;
    s.grazeDY[i] = 0;
    // Half-size so two average sheep sit ~SHEEP_COLLIDE_DIST apart; the seeded spread
    // means the de-overlap can't settle into a perfect crystal.
    s.bodyR[i] = (SHEEP_COLLIDE_DIST * 0.5) * nextRange(rng, BODY_SIZE_MIN, BODY_SIZE_MAX);
    s.flags[i] = 0;

    // ---- Phase 2A: per-sheep traits (seeded once, never mutated) ----
    // Skittishness is skewed toward calm (u*u) to match the real distribution: most
    // sheep placid, a jumpy minority (temperament genetics 2011; Animals 2024).
    const u = nextFloat(rng);
    s.skittish[i] = SKITTISH_MIN + (SKITTISH_MAX - SKITTISH_MIN) * u * u;
    s.speedMul[i] = nextRange(rng, SPEED_VAR_MIN, SPEED_VAR_MAX);
    s.restBias[i] = nextRange(rng, REST_BIAS_MIN, REST_BIAS_MAX);
    s.wanderMul[i] = nextRange(rng, WANDER_MUL_MIN, WANDER_MUL_MAX);
    s.idlePhase[i] = nextRange(rng, 0, Math.PI * 2);
    // Activity + timers. Rest onset staggered from t=0 so the flock never lies down in sync.
    s.activity[i] = 0; // ACT_GRAZE
    s.panicAge[i] = 0;
    s.strayTimer[i] = 0;
    s.restTimer[i] = nextRange(rng, REST_ONSET_MIN, REST_ONSET_MAX) * s.restBias[i];
  }
}
