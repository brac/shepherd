// Fixed-timestep loop: accumulator pattern at 240 Hz. Sim steps are deterministic
// and frame-rate independent; rendering interpolates between the last two sim states
// (alpha = leftover accumulator / DT) for smooth motion at any display refresh.
//
// performance.now() (wall clock) lives HERE, in the driver — never inside sim logic.

import type { GameState } from "./state/gameState";
import { stepSim } from "./sim/step";
import { DT, MAX_FRAME_TIME } from "../data/tuning";

export interface PerfStats {
  simMs: number; // sim time spent this frame (all substeps)
  fps: number;
  steps: number; // substeps run this frame
}

export const perfStats: PerfStats = { simMs: 0, fps: 0, steps: 0 };

const MAX_STEPS_PER_FRAME = 8; // spiral-of-death guard

export function startLoop(state: GameState, render: (state: GameState, alpha: number) => void): void {
  let last = performance.now();
  let acc = 0;
  let fpsAccum = 0;
  let fpsCount = 0;

  function frame(nowMs: number): void {
    let frameTime = (nowMs - last) / 1000;
    last = nowMs;
    if (frameTime > MAX_FRAME_TIME) frameTime = MAX_FRAME_TIME;
    acc += frameTime;

    const simStart = performance.now();
    let steps = 0;
    while (acc >= DT && steps < MAX_STEPS_PER_FRAME) {
      stepSim(state, DT);
      acc -= DT;
      steps++;
    }
    // If we hit the step cap, drop the backlog rather than spiraling.
    if (steps >= MAX_STEPS_PER_FRAME) acc = 0;
    const simMs = performance.now() - simStart;

    const alpha = acc / DT;
    render(state, alpha);

    // Perf stats (smoothed FPS).
    perfStats.simMs = simMs;
    perfStats.steps = steps;
    fpsAccum += frameTime;
    fpsCount++;
    if (fpsAccum >= 0.5) {
      perfStats.fps = fpsCount / fpsAccum;
      fpsAccum = 0;
      fpsCount = 0;
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
