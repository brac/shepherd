// Entry point: build the GameState, init the renderer, attach input, start the loop.
// Wiring only — no simulation logic.

import { createGameState } from "./state/gameState";
import { level2 } from "../data/levels/level2";
import { Renderer } from "./render/renderer";
import { attachInput } from "./input/input";
import { startLoop } from "./loop";

async function boot(): Promise<void> {
  const mount = document.getElementById("app");
  if (!mount) throw new Error("#app mount not found");

  const state = createGameState(level2);

  const renderer = new Renderer();
  await renderer.init(state, mount);

  attachInput(state, renderer.app.canvas, () => renderer.viewport());

  startLoop(state, renderer.render);

  // Expose for quick console poking during tuning.
  (window as unknown as { shepherd: unknown }).shepherd = { state, renderer };
}

boot().catch((err) => {
  console.error(err);
});
