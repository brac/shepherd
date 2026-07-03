// Debug overlay for Phase 2A observability (toggle with 'D'). Dumb view: reads
// GameState, never mutates it. Starts by drawing active ambient startle rings; pooling
// attractors (M5) and the trample heatmap (M6) fill in as those milestones land.

import { Container, Graphics } from "pixi.js";
import type { GameState } from "../state/gameState";

const STARTLE_RING_COLOR = 0xffe066;

export class DebugView {
  readonly container: Container;
  private readonly g = new Graphics();
  private on = false;

  constructor() {
    this.container = new Container();
    this.container.addChild(this.g);
    this.container.visible = false;
  }

  toggle(): void {
    this.on = !this.on;
    this.container.visible = this.on;
  }

  update(state: GameState): void {
    if (!this.on) return;
    const g = this.g;
    g.clear();

    // Active ambient startle emitters (birds / gusts).
    const a = state.ambient;
    for (let k = 0; k < a.startleTtl.length; k++) {
      if (a.startleTtl[k] > 0) {
        g.circle(a.startleX[k], a.startleY[k], 90).stroke({
          color: STARTLE_RING_COLOR,
          width: 2,
          alpha: 0.8,
        });
      }
    }
  }
}
