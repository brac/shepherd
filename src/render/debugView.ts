// Debug overlay for Phase 2A observability (toggle with 'D'). Dumb view: reads
// GameState, never mutates it. Recolours every sheep by its activity/flee state and rings
// active ambient startle emitters, so behaviour is visible while tuning. Pooling
// attractors (M5) and the trample heatmap (M6) fill in as those milestones land.

import { Container, Graphics } from "pixi.js";
import {
  ACT_ALERT,
  ACT_FOLLOW,
  ACT_REST,
  FLAG_FLEEING,
  type GameState,
} from "../state/gameState";
import { BIRD_STARTLE_RADIUS } from "../../data/tuning";

const STARTLE_RING_COLOR = 0xffe066;
// Activity palette (dot per sheep).
const COL_GRAZE = 0x6ab04c; // green — calm/grazing
const COL_ALERT = 0xffe066; // yellow — planted and staring at a disturbance
const COL_FLEE = 0xff4d4d; // red — fleeing
const COL_REST = 0x7f8fa6; // slate — lying down (M4)
const COL_FOLLOW = 0x4dd0e1; // cyan — following a leader (M6)

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

    // A dot per sheep, coloured by activity (fleeing overrides activity).
    const s = state.sheep;
    for (let i = 0; i < s.count; i++) {
      let color: number;
      if (s.flags[i] & FLAG_FLEEING) color = COL_FLEE;
      else if (s.activity[i] === ACT_ALERT) color = COL_ALERT;
      else if (s.activity[i] === ACT_REST) color = COL_REST;
      else if (s.activity[i] === ACT_FOLLOW) color = COL_FOLLOW;
      else color = COL_GRAZE;
      g.circle(s.posX[i], s.posY[i], 3.5).fill({ color, alpha: 0.9 });
    }

    // Active ambient startle emitters (birds / gusts).
    const a = state.ambient;
    for (let k = 0; k < a.startleTtl.length; k++) {
      if (a.startleTtl[k] > 0) {
        g.circle(a.startleX[k], a.startleY[k], BIRD_STARTLE_RADIUS).stroke({
          color: STARTLE_RING_COLOR,
          width: 2,
          alpha: 0.8,
        });
      }
    }
  }
}
