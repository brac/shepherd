// Ground layer (bottom of the world). Phase 2B M4 fills this with a lit grass texture +
// large-scale value patches (optional asset "grass", else procedural). M0 stub: empty, so
// FieldView still supplies the flat grass fill and nothing changes visually yet.

import { Container } from "pixi.js";

export class GroundView {
  readonly container = new Container();
}
