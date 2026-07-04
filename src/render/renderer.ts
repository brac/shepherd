// Pixi app + view registry. Owns a camera-transformed `world` container (all
// world-space views are children, so per-sprite camera math is unnecessary) and a
// screen-space HUD. render() is the dumb read: it transforms the world container by
// the interpolated camera and updates each view. No simulation logic lives here.

import { Application, Container } from "pixi.js";
import type { GameState } from "../state/gameState";
import { GroundView } from "./groundView";
import { WornPathsView } from "./wornPathsView";
import { FieldView } from "./fieldView";
import { ShadowView } from "./shadowView";
import { SheepView } from "./sheepView";
import { DogView } from "./dogView";
import { CloudShadowView } from "./cloudShadowView";
import { DebugView } from "./debugView";
import { HudView } from "./hudView";
import { loadOptionalTextures } from "./assets";
import { lerp, ZOOM } from "./camera";

export class Renderer {
  readonly app: Application;
  private world!: Container;
  private shadowView!: ShadowView;
  private sheepView!: SheepView;
  private dogView!: DogView;
  private debugView!: DebugView;
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

    // Optional external textures (art drop-in). Absence is the norm → procedural fallback.
    await loadOptionalTextures();

    this.world = new Container();
    this.app.stage.addChild(this.world);

    // World layers, bottom → top (z-order is the render contract; see PHASE_2B_PLAN.md).
    const groundView = new GroundView(); // 1. grass (M4; M0 stub — FieldView still fills grass)
    this.world.addChild(groundView.container);

    const wornPathsView = new WornPathsView(); // 2. trodden ground (M4 stub)
    this.world.addChild(wornPathsView.container);

    const fieldView = new FieldView(state.level); // 3. fence, gate, obstacles
    this.world.addChild(fieldView.container);

    this.shadowView = new ShadowView(state); // 4. soft contact shadows
    this.world.addChild(this.shadowView.container);

    this.sheepView = new SheepView(this.app, state); // 5. sheep bodies
    this.world.addChild(this.sheepView.container);

    this.dogView = new DogView(); // 6. dog
    this.world.addChild(this.dogView.container);

    const cloudShadowView = new CloudShadowView(); // 7. drifting cloud shadows (M5 stub)
    this.world.addChild(cloudShadowView.container);

    this.debugView = new DebugView(); // 8. debug overlay (D)
    this.world.addChild(this.debugView.container);

    this.hudView = new HudView();
    this.app.stage.addChild(this.hudView.container);
  }

  viewport(): { width: number; height: number } {
    return { width: this.app.screen.width, height: this.app.screen.height };
  }

  /** Toggle the Phase 2A debug overlay (bound to 'D' in main.ts). */
  toggleDebug(): void {
    this.debugView.toggle();
  }

  render = (state: GameState, alpha: number): void => {
    const w = this.app.screen.width;
    const h = this.app.screen.height;

    const camX = lerp(state.camera.prevX, state.camera.x, alpha);
    const camY = lerp(state.camera.prevY, state.camera.y, alpha);
    this.world.scale.set(ZOOM);
    this.world.x = w / 2 - camX * ZOOM;
    this.world.y = h / 2 - camY * ZOOM;

    this.shadowView.update(state, alpha);
    this.sheepView.update(state, alpha);
    this.dogView.update(state, alpha);
    this.debugView.update(state);
    this.hudView.update(state, w, h);
  };
}
