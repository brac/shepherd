// Seeded spawn of the sheep pool into the level's spawn region.
// Runs once at load; allocation-free use of the shared seeded RNG.

import type { GameState } from "../state/gameState";
import { nextFloat, nextRange } from "./rng";
import {
  BODY_SIZE_MAX,
  BODY_SIZE_MIN,
  GRAZE_MAX_DWELL,
  GRAZE_MIN_DWELL,
  SHEEP_COLLIDE_DIST,
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
  }
}
