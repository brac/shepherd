// Pixi app + view registry. Owns a camera-transformed `world` container (all
// world-space views are children, so per-sprite camera math is unnecessary) and a
// screen-space HUD. render() is the dumb read: it transforms the world container by
// the interpolated camera and updates each view. No simulation logic lives here.

import { Application, Container } from "pixi.js";
import type { GameState } from "../state/gameState";
import { FieldView } from "./fieldView";
import { SheepView } from "./sheepView";
import { DogView } from "./dogView";
import { HudView } from "./hudView";
import { lerp, ZOOM } from "./camera";

export class Renderer {
  readonly app: Application;
  private world!: Container;
  private sheepView!: SheepView;
  private dogView!: DogView;
  private hudView!: HudView;

  constructor() {
    this.app = new Application();
  }

  async init(state: GameState, mount: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: mount,
      background: 0x4f6b2c,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    mount.appendChild(this.app.canvas);

    this.world = new Container();
    this.app.stage.addChild(this.world);

    const fieldView = new FieldView(state.level);
    this.world.addChild(fieldView.container);

    this.sheepView = new SheepView(this.app, state);
    this.world.addChild(this.sheepView.container);

    this.dogView = new DogView();
    this.world.addChild(this.dogView.container);

    this.hudView = new HudView();
    this.app.stage.addChild(this.hudView.container);
  }

  viewport(): { width: number; height: number } {
    return { width: this.app.screen.width, height: this.app.screen.height };
  }

  render = (state: GameState, alpha: number): void => {
    const w = this.app.screen.width;
    const h = this.app.screen.height;

    const camX = lerp(state.camera.prevX, state.camera.x, alpha);
    const camY = lerp(state.camera.prevY, state.camera.y, alpha);
    this.world.scale.set(ZOOM);
    this.world.x = w / 2 - camX * ZOOM;
    this.world.y = h / 2 - camY * ZOOM;

    this.sheepView.update(state, alpha);
    this.dogView.update(state, alpha);
    this.hudView.update(state, w, h);
  };
}
