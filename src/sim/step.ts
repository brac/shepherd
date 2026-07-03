// One fixed 1/240 s sim step. The ORDER of these calls is the determinism contract:
// same level + same seed + same input sequence => identical result. No wall-clock
// time, no Math.random, no allocation in the hot systems.

import type { GameState } from "../state/gameState";
import { rebuildGrid } from "./spatialHash";
import { updateDog } from "./dog";
import { updateAmbient } from "./ambient";
import { updatePanic } from "./panic";
import { updateFlocking } from "./flocking";
import { resolveOverlap } from "./overlap";
import { updateTrample } from "./trample";
import { updatePenning } from "./gate";
import { CAMERA_EASE, CAMERA_LOOKAHEAD } from "../../data/tuning";

export function stepSim(state: GameState, dt: number): void {
  const s = state.sheep;
  const dog = state.dog;
  const cam = state.camera;

  // 1. Snapshot: prev <- current (position + panic), for neighbor reads & render interp.
  s.prevX.set(s.posX);
  s.prevY.set(s.posY);
  s.panicPrev.set(s.panic);
  dog.prevX = dog.x;
  dog.prevY = dog.y;
  cam.prevX = cam.x;
  cam.prevY = cam.y;

  // 2. Dog (consumes input intent).
  updateDog(state, dt);

  // 3. Spatial hash rebuilt from snapshot positions.
  rebuildGrid(state);

  // 3.5 Ambient startle sources (birds/gusts) seed emitters BEFORE panic reads them.
  updateAmbient(state, dt);

  // 4. Panic pass.
  updatePanic(state, dt);

  // 5. Move pass (boids + flee + graze + funnel + penned).
  updateFlocking(state, dt);

  // 5b. Hard positional de-overlap so bodies bump instead of stacking.
  resolveOverlap(state);

  // 6.5 Worn paths: accumulate traffic from the now-final positions (purely visual).
  updateTrample(state, dt);

  // 6. Pen accounting + win.
  updatePenning(state);

  // 7. Camera follow with velocity lookahead.
  const targetX = dog.x + dog.velX * CAMERA_LOOKAHEAD;
  const targetY = dog.y + dog.velY * CAMERA_LOOKAHEAD;
  const k = Math.min(1, CAMERA_EASE * dt);
  cam.x += (targetX - cam.x) * k;
  cam.y += (targetY - cam.y) * k;

  // 8. Advance sim clock.
  state.tick++;
  state.simTime += dt;
}
