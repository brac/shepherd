// Pen accounting: after the move pass, any unpenned sheep now inside the pen
// polygon becomes PENNED (one-way — the gate wall keeps it in from next step).
// Win fires when every sheep is penned. No settle requirement in v1.

import { FLAG_PENNED, type GameState } from "../state/gameState";
import { pointInPolygon } from "./geometry";

export function updatePenning(state: GameState): void {
  const s = state.sheep;
  const poly = state.level.penPoly;
  for (let i = 0; i < s.count; i++) {
    if (s.flags[i] & FLAG_PENNED) continue;
    if (pointInPolygon(s.posX[i], s.posY[i], poly)) {
      s.flags[i] |= FLAG_PENNED;
      state.pennedCount++;
    }
  }
  state.won = state.pennedCount === s.count;
}
