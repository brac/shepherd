// Soft contact shadows (above the field, below the bodies). Phase 2B M1 (Pillar 1 — the
// biggest single realism win) fills this: one blurred radial-gradient blob (optional asset
// "shadow", else procedural) batched as a particle per sheep + the dog, offset by the shared
// sun vector. M0 stub: empty container in the correct z-position.

import { Container } from "pixi.js";

export class ShadowView {
  readonly container = new Container();
}
