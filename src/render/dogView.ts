// Dumb view: the dog as a simple shape whose color reads its state (trot / stalk /
// prone), plus a transient ring while barking. Position interpolated prev->cur.

import { Container, Graphics } from "pixi.js";
import { DOG_PRONE, DOG_STALK, type GameState } from "../state/gameState";
import { lerp } from "./camera";
import { BARK_RADIUS, DOG_RADIUS } from "../../data/tuning";

const TROT_COLOR = 0x3a2a1a;
const STALK_COLOR = 0xc8781e;
const PRONE_COLOR = 0x2f6bb0;

export class DogView {
  readonly container: Container;
  private body: Graphics;
  private snout: Graphics;
  private bark: Graphics;

  constructor() {
    const c = new Container();
    this.bark = new Graphics();
    this.body = new Graphics();
    this.snout = new Graphics();
    c.addChild(this.bark, this.body, this.snout);
    this.container = c;
  }

  update(state: GameState, alpha: number): void {
    const dog = state.dog;
    const x = lerp(dog.prevX, dog.x, alpha);
    const y = lerp(dog.prevY, dog.y, alpha);

    let color = TROT_COLOR;
    if (dog.state === DOG_PRONE) color = PRONE_COLOR;
    else if (dog.state === DOG_STALK) color = STALK_COLOR;

    // Body.
    this.body.clear();
    this.body.circle(x, y, DOG_RADIUS).fill({ color });

    // Snout (facing indicator).
    this.snout.clear();
    const fx = x + Math.cos(dog.facing) * DOG_RADIUS * 1.8;
    const fy = y + Math.sin(dog.facing) * DOG_RADIUS * 1.8;
    this.snout
      .moveTo(x, y)
      .lineTo(fx, fy)
      .stroke({ width: 3, color: 0xffffff, alpha: 0.9 });

    // Bark ring (transient).
    this.bark.clear();
    if (dog.barkTimer > 0) {
      const t = dog.barkTimer; // shrinks as it decays
      this.bark
        .circle(x, y, BARK_RADIUS * (0.4 + 0.6 * Math.min(1, t / 0.12)))
        .stroke({ width: 4, color: 0xffffff, alpha: 0.5 });
    }
  }
}
