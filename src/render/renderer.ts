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
import { moodFilter, updateMood } from "./mood";
import { lerp, ZOOM } from "./camera";

export class Renderer {
  readonly app: Application;
  private world!: Container;
  private groundView!: GroundView;
  private wornPathsView!: WornPathsView;
  private shadowView!: ShadowView;
  private cloudShadowView!: CloudShadowView;
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
      // Cap render resolution: on a hi-DPI display (retina/4K) rendering at full devicePixelRatio
      // is 2–4× the fill for the same view. 1.5 keeps it crisp while reclaiming that headroom;
      // harmless at DPR 1.
      resolution: Math.min(window.devicePixelRatio || 1, 1.5),
      autoDensity: true,
    });
    mount.appendChild(this.app.canvas);

    // Optional external textures (art drop-in). Absence is the norm → procedural fallback.
    await loadOptionalTextures();

    this.world = new Container();
    this.app.stage.addChild(this.world);

    // Background layers go in a separate container that the mood filter grades. Keeping the
    // 1000+ sheep/shadow PARTICLES OUT of the filtered subtree preserves their fast direct
    // render path (filtering the whole world forces them through an offscreen texture every
    // frame — a big cost) and keeps the fleece crisp; only the field surface is graded.
    const bg = new Container();
    bg.filters = [moodFilter]; // time-of-day / weather color grade over the field
    this.world.addChild(bg);

    // World layers, bottom → top (z-order is the render contract; see PHASE_2B_PLAN.md).
    this.groundView = new GroundView(state.level); // 1. grass (photo or procedural) + vignette + wind
    bg.addChild(this.groundView.container);

    this.wornPathsView = new WornPathsView(state); // 2. trodden-ground heatmap from the trample grid
    bg.addChild(this.wornPathsView.container);

    const fieldView = new FieldView(state.level); // 3. fence, gate, obstacles
    bg.addChild(fieldView.container);

    this.shadowView = new ShadowView(state); // 4. soft contact shadows
    this.world.addChild(this.shadowView.container);

    this.sheepView = new SheepView(state); // 5. sheep bodies
    this.world.addChild(this.sheepView.container);

    this.dogView = new DogView(); // 6. dog
    this.world.addChild(this.dogView.container);

    this.cloudShadowView = new CloudShadowView(state.level); // 7. drifting cloud shadows
    this.world.addChild(this.cloudShadowView.container);

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

    updateMood(state); // grade + shadow length before the views read them
    this.groundView.update(state);
    this.wornPathsView.update(state);
    this.shadowView.update(state, alpha);
    this.sheepView.update(state, alpha);
    this.dogView.update(state, alpha);
    this.cloudShadowView.update(state);
    this.debugView.update(state);
    this.hudView.update(state, w, h);
  };
}
