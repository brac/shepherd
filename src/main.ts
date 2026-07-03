// Entry point: build the GameState, init the renderer, attach input, start the loop.
// Wiring only — no simulation logic.

import { createGameState } from "./state/gameState";
import { level2 } from "../data/levels/level2";
import { Renderer } from "./render/renderer";
import { DevPanel } from "./render/devPanel";
import { attachInput } from "./input/input";
import { startLoop } from "./loop";

async function boot(): Promise<void> {
  const mount = document.getElementById("app");
  if (!mount) throw new Error("#app mount not found");

  const state = createGameState(level2);

  const renderer = new Renderer();
  await renderer.init(state, mount);

  attachInput(state, renderer.app.canvas, () => renderer.viewport());

  const devPanel = new DevPanel(state);

  // 'D' toggles the Phase 2A debug overlay; ` toggles the dev-tools panel.
  window.addEventListener("keydown", (e) => {
    if (e.key === "d" || e.key === "D") renderer.toggleDebug();
    else if (e.key === "`") devPanel.toggle();
  });

  startLoop(state, renderer.render);

  // Expose for quick console poking during tuning.
  (window as unknown as { shepherd: unknown }).shepherd = { state, renderer, devPanel };
}

boot().catch((err) => {
  console.error(err);
});
