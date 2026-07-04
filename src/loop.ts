// Fixed-timestep loop: accumulator pattern at 240 Hz. Sim steps are deterministic
// and frame-rate independent; rendering interpolates between the last two sim states
// (alpha = leftover accumulator / DT) for smooth motion at any display refresh.
//
// performance.now() (wall clock) lives HERE, in the driver — never inside sim logic.

import type { GameState } from "./state/gameState";
import { stepSim } from "./sim/step";
import { DT, MAX_FRAME_TIME, RENDER_FPS_CAP } from "../data/tuning";

// Frame limiter interval (seconds), with a buffer so a native-60 Hz display still renders
// every vsync and high-refresh displays settle to a stable cap (120 Hz → 60 fps).
const MIN_FRAME_INTERVAL = 1 / RENDER_FPS_CAP - 0.004;

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
    // Frame limiter: skip this vsync if too little real time has passed since the last
    // rendered frame (keeps a steady cap without desyncing the sim — the full elapsed time
    // still feeds the accumulator when we DO process, so sim-time tracks wall-clock).
    const elapsed = (nowMs - last) / 1000;
    if (elapsed < MIN_FRAME_INTERVAL) {
      requestAnimationFrame(frame);
      return;
    }
    let frameTime = elapsed;
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
