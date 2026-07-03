// Worn-paths pass (Phase 2A §2.6, M6). Accumulates where sheep and the dog have trodden
// into a coarse traffic grid and fades it slowly. PURELY VISUAL — nothing in the sim reads
// this back, so it can be deleted and the flock behaves identically. Runs after the final
// positions are settled (post de-overlap). Zero allocation; hand-written index loops.

import type { GameState } from "../state/gameState";
import { TRAMPLE_ADD, TRAMPLE_DECAY, TRAMPLE_DOG_MUL, TRAMPLE_MAX } from "../../data/tuning";

export function updateTrample(state: GameState, dt: number): void {
  const tr = state.trample;
  const val = tr.val;
  const cols = tr.cols;
  const rows = tr.rows;
  const inv = 1 / tr.cellSize;

  // Slow, framerate-independent fade of every cell (weeks-scale recovery, compressed).
  const keep = Math.exp(-TRAMPLE_DECAY * dt);
  for (let k = 0; k < val.length; k++) val[k] *= keep;

  // Deposit under each sheep.
  const s = state.sheep;
  const add = TRAMPLE_ADD * dt;
  for (let i = 0; i < s.count; i++) {
    const cx = ((s.posX[i] - tr.minX) * inv) | 0;
    const cy = ((s.posY[i] - tr.minY) * inv) | 0;
    if (cx < 0 || cx >= cols || cy < 0 || cy >= rows) continue;
    const idx = cy * cols + cx;
    const v = val[idx] + add;
    val[idx] = v > TRAMPLE_MAX ? TRAMPLE_MAX : v;
  }

  // The dog packs a path harder than a sheep.
  const dcx = ((state.dog.x - tr.minX) * inv) | 0;
  const dcy = ((state.dog.y - tr.minY) * inv) | 0;
  if (dcx >= 0 && dcx < cols && dcy >= 0 && dcy < rows) {
    const idx = dcy * cols + dcx;
    const v = val[idx] + add * TRAMPLE_DOG_MUL;
    val[idx] = v > TRAMPLE_MAX ? TRAMPLE_MAX : v;
  }
}
