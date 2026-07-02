// Pointer input -> InputState intent. This layer ONLY writes intent onto
// state.input; the sim (updateDog) consumes it. Screen->world uses the current sim
// camera position. No simulation logic here.
//
// Default (no button): the dog trots to follow the mouse.
// Hold left: the dog is planted.
//   - mouse keeps MOVING while held -> stalk (slow deliberate creep toward the cursor)
//   - mouse goes STILL while held    -> the dog stops (prone hold / the "eye")
// Release left: back to trot-follow.
// Right click: bark (radial panic pulse).
// Shift-click big-bark is deferred (Phase 1 scope).

import type { GameState } from "../state/gameState";
import { screenToWorldX, screenToWorldY, ZOOM } from "../render/camera";
import { DRAG_THRESHOLD_PX, STALK_IDLE_MS } from "../../data/tuning";

export interface Viewport {
  width: number;
  height: number;
}

export function attachInput(
  state: GameState,
  target: HTMLElement,
  getViewport: () => Viewport,
): void {
  let lastX = 0;
  let lastY = 0;
  // Timer that flips dragging (stalk) back off once the mouse holds still while the
  // button is down, so a held-but-static cursor stops the dog.
  let idleTimer: ReturnType<typeof setTimeout> | undefined;

  function clearIdle(): void {
    if (idleTimer !== undefined) {
      clearTimeout(idleTimer);
      idleTimer = undefined;
    }
  }

  function armIdle(): void {
    clearIdle();
    idleTimer = setTimeout(() => {
      state.input.dragging = false; // mouse went still while held -> dog stops
    }, STALK_IDLE_MS);
  }

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
    if (state.input.leftDown) {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      if (dx * dx + dy * dy > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
        state.input.dragging = true; // moving while held -> stalk
        lastX = e.clientX;
        lastY = e.clientY;
        armIdle(); // if movement stops, idle timer will drop back to a stop
      }
    }
  });

  target.addEventListener("pointerdown", (e) => {
    updateWorldFromEvent(e.clientX, e.clientY);
    if (e.button === 0) {
      // Click plants the dog: it stops immediately (dragging=false). Moving the mouse
      // while held promotes it to a stalk.
      state.input.leftDown = true;
      state.input.dragging = false;
      lastX = e.clientX;
      lastY = e.clientY;
      clearIdle();
    } else if (e.button === 2) {
      state.input.barkQueued = true;
    }
  });

  target.addEventListener("pointerup", (e) => {
    if (e.button === 0) {
      updateWorldFromEvent(e.clientX, e.clientY);
      state.input.leftDown = false;
      state.input.dragging = false;
      clearIdle();
    }
  });

  // Also catch right-click via contextmenu (some environments deliver it more
  // reliably than pointerdown button 2) and suppress the menu.
  target.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    state.input.barkQueued = true;
  });

  // If the pointer leaves the canvas while held, release the plant.
  target.addEventListener("pointerleave", () => {
    state.input.leftDown = false;
    state.input.dragging = false;
    clearIdle();
  });
}
