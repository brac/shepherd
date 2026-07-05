// Entry point: build the GameState, init the renderer, attach input, start the loop.
// Wiring only — no simulation logic.

import { createGameState } from "./state/gameState";
import { level2 } from "../data/levels/level2";
import { Renderer } from "./render/renderer";
import { DevPanel } from "./render/devPanel";
import { attachInput } from "./input/input";
import { visuals } from "./render/visualsRuntime";
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
  // 'A'/'M' are perf A/B toggles: freeze per-sheep animation / drop the mood filter, to isolate
  // each suspect's frame cost against the HUD's sim/render/fps readout.
  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k === "d") renderer.toggleDebug();
    else if (e.key === "`") devPanel.toggle();
    else if (k === "a") {
      visuals.animateSheep = !visuals.animateSheep;
      console.log(`[perf] sheep animation ${visuals.animateSheep ? "ON" : "OFF"}`);
    } else if (k === "m") {
      visuals.moodGrade = !visuals.moodGrade;
      console.log(`[perf] mood grade ${visuals.moodGrade ? "ON" : "OFF"}`);
    }
  });

  startLoop(state, renderer.render);

  // Expose for quick console poking during tuning.
  (window as unknown as { shepherd: unknown }).shepherd = { state, renderer, devPanel, visuals };
}

boot().catch((err) => {
  console.error(err);
});
