// Dumb view: a key-config legend locked to the WORLD (not the HUD), sitting just below
// the field's bottom edge. Static — built once at construction from the control list, no
// per-frame update. Lists every player control; the sim never reads any of this.

import { Container, Graphics, Text } from "pixi.js";
import type { Level } from "../state/level";

// Each row: the key/button the player presses, and what it does.
const CONTROLS: { key: string; action: string }[] = [
  { key: "Move Mouse", action: "Guide dog" },
  { key: "Hold Left", action: "Dash" },
  { key: "Ctrl", action: "Prone" },
  { key: "Right Click", action: "Bark" },
  { key: "D", action: "Debug overlay" },
  { key: "`", action: "Dev panel" },
];

const CHIP_BG = 0x2a3a1c;
const CHIP_EDGE = 0x6f8a4a;
const KEY_FILL = 0xf2f6e6;
const ACTION_FILL = 0xcdd9b6;

const KEY_SIZE = 24; // world-unit font sizes; the world container scales these by ZOOM
const ACTION_SIZE = 22;
const CHIP_PAD_X = 12;
const CHIP_PAD_Y = 7;
const GAP = 10; // chip -> action label
const ENTRY_GAP = 42; // between entries
const TOP_MARGIN = 40; // below the field's bottom edge

export class LegendView {
  readonly container: Container;

  constructor(level: Level) {
    const c = new Container();

    // Build each entry (key chip + action label) and lay them out in a single centered row.
    const entries: Container[] = [];
    let totalWidth = 0;

    for (const ctrl of CONTROLS) {
      const entry = new Container();

      const keyText = new Text({
        text: ctrl.key,
        style: { fill: KEY_FILL, fontSize: KEY_SIZE, fontFamily: "monospace", fontWeight: "bold" },
      });
      keyText.x = CHIP_PAD_X;
      keyText.y = CHIP_PAD_Y;

      const chipW = keyText.width + CHIP_PAD_X * 2;
      const chipH = keyText.height + CHIP_PAD_Y * 2;
      const chip = new Graphics();
      chip.roundRect(0, 0, chipW, chipH, 6).fill({ color: CHIP_BG }).stroke({ width: 2, color: CHIP_EDGE });

      const actionText = new Text({
        text: ctrl.action,
        style: { fill: ACTION_FILL, fontSize: ACTION_SIZE, fontFamily: "monospace" },
      });
      actionText.x = chipW + GAP;
      actionText.y = (chipH - actionText.height) / 2;

      entry.addChild(chip, keyText, actionText);
      entries.push(entry);
      totalWidth += entry.width + ENTRY_GAP;
    }
    totalWidth -= ENTRY_GAP; // no trailing gap after the last entry

    // Field bottom edge from the level polygon (min/max Y of the field vertices).
    const fp = level.fieldPoly;
    let minX = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < fp.length; i += 2) {
      if (fp[i] < minX) minX = fp[i];
      if (fp[i] > maxX) maxX = fp[i];
      if (fp[i + 1] > maxY) maxY = fp[i + 1];
    }
    const centerX = (minX + maxX) / 2;

    // Center the row horizontally under the field, seated below the bottom edge.
    let x = centerX - totalWidth / 2;
    const y = maxY + TOP_MARGIN;
    for (const entry of entries) {
      entry.x = x;
      entry.y = y;
      c.addChild(entry);
      x += entry.width + ENTRY_GAP;
    }

    this.container = c;
  }
}
