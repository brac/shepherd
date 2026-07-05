// Pointer + keyboard input -> InputState intent. This layer ONLY writes intent onto
// state.input; the sim (updateDog) consumes it. Screen->world uses the current sim
// camera position. No simulation logic here.
//
// Controls:
//   Left button (hold)  -> sprint: the dog drives hard toward the cursor.
//   Ctrl (hold)         -> prone: the dog plants (the "eye", hard stop).
//   No button           -> trot to follow the cursor; the sim creeps (stalk) once the
//                          cursor is close to the dog (STALK_RADIUS, resolved in updateDog).
//   Right click         -> bark (radial panic pulse).

import type { GameState } from "../state/gameState";
import { screenToWorldX, screenToWorldY, ZOOM } from "../render/camera";

export interface Viewport {
  width: number;
  height: number;
}

export function attachInput(
  state: GameState,
  target: HTMLElement,
  getViewport: () => Viewport,
): void {
  function updateWorldFromEvent(clientX: number, clientY: number): void {
    const vp = getViewport();
    const rect = target.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    state.input.mouseWorldX = screenToWorldX(sx, state.camera.x, vp.width, ZOOM);
    state.input.mouseWorldY = screenToWorldY(sy, state.camera.y, vp.height, ZOOM);
  }

  target.addEventListener("pointermove", (e) => {
    updateWorldFromEvent(e.clientX, e.clientY);
    // Modifier state rides on every pointer event, so keep prone in sync with Ctrl even if a
    // keydown landed on another element.
    state.input.prone = e.ctrlKey;
  });

  target.addEventListener("pointerdown", (e) => {
    updateWorldFromEvent(e.clientX, e.clientY);
    state.input.prone = e.ctrlKey;
    if (e.button === 0) {
      state.input.sprint = true; // left held -> sprint toward the cursor
    } else if (e.button === 2) {
      state.input.barkQueued = true;
    }
  });

  target.addEventListener("pointerup", (e) => {
    if (e.button === 0) {
      updateWorldFromEvent(e.clientX, e.clientY);
      state.input.sprint = false;
    }
  });

  // Also catch right-click via contextmenu (some environments deliver it more
  // reliably than pointerdown button 2) and suppress the menu.
  target.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    state.input.barkQueued = true;
  });

  // If the pointer leaves the canvas while held, release the sprint.
  target.addEventListener("pointerleave", () => {
    state.input.sprint = false;
  });

  // Ctrl (either side) drives prone. Keyboard is primary; pointer events re-sync above.
  window.addEventListener("keydown", (e) => {
    if (e.key === "Control") state.input.prone = true;
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "Control") state.input.prone = false;
  });

  // Losing focus can swallow the ctrl/left release — clear held intent so the dog doesn't stick.
  window.addEventListener("blur", () => {
    state.input.sprint = false;
    state.input.prone = false;
  });
}
