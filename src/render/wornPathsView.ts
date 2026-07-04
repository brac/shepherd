// Worn-paths layer (above ground, below fence). Phase 2B M4 renders the Phase 2A trample
// grid as faint flattened/discoloured grass via a small texture updated at ~4 Hz. M0 stub:
// empty. First real consumer of the M6-2A trample field.

import { Container } from "pixi.js";

export class WornPathsView {
  readonly container = new Container();
}
