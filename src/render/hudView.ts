// Dumb view: screen-space HUD. Penned counter, win banner, and a dev perf overlay
// (sim ms / step count / FPS). Reads GameState + perfStats; never mutates.

import { Container, Text } from "pixi.js";
import type { GameState } from "../state/gameState";
import { perfStats } from "../loop";

export class HudView {
  readonly container: Container;
  private counter: Text;
  private banner: Text;
  private perf: Text;

  constructor() {
    const c = new Container();

    this.counter = new Text({
      text: "",
      style: { fill: 0xffffff, fontSize: 22, fontFamily: "monospace", fontWeight: "bold" },
    });
    this.counter.x = 16;
    this.counter.y = 12;

    this.perf = new Text({
      text: "",
      style: { fill: 0xdfeecb, fontSize: 13, fontFamily: "monospace" },
    });
    this.perf.x = 16;
    this.perf.y = 44;

    this.banner = new Text({
      text: "",
      style: { fill: 0xfff2a8, fontSize: 64, fontFamily: "monospace", fontWeight: "bold" },
    });
    this.banner.anchor.set(0.5);
    this.banner.visible = false;

    c.addChild(this.counter, this.perf, this.banner);
    this.container = c;
  }

  update(state: GameState, width: number, height: number): void {
    this.counter.text = `Penned: ${state.pennedCount} / ${state.sheep.count}`;
    // sim = CPU sim substeps; render = CPU view-update wall time. If fps is below the cap while
    // BOTH are small, the frame is GPU-bound (fill/overdraw/filter), not CPU-bound.
    this.perf.text =
      `sim ${perfStats.simMs.toFixed(2)}ms  x${perfStats.steps}` +
      `  render ${perfStats.renderMs.toFixed(2)}ms  ${perfStats.fps.toFixed(0)} fps`;

    if (state.won) {
      this.banner.visible = true;
      this.banner.text = "PENNED!";
      this.banner.x = width / 2;
      this.banner.y = height / 2;
    } else {
      this.banner.visible = false;
    }
  }
}
