import type { LevelDef } from "../../src/state/level";

// Phase 1 level: one rectangular field, one pen with a narrow gate on the side
// facing the incoming flock, one spawn region on the left. No obstacles yet.
// Geometry is authoring data only — no sim code depends on these numbers.

// Field boundary (inset from the 2000x1200 world so sheep never sit on the edge).
const FIELD = [40, 40, 1960, 40, 1960, 1160, 40, 1160];

// Pen rectangle on the right. The gate is a gap in the LEFT edge (faces the flock).
const PEN_LEFT = 1500;
const PEN_RIGHT = 1850;
const PEN_TOP = 460;
const PEN_BOTTOM = 820;
const GATE_TOP = 605; // narrow ~70px opening centered on the left edge
const GATE_BOTTOM = 675;

// Vertices ordered so edge index 4 (gateBottom -> gateTop) is the open gate.
const PEN = [
  PEN_LEFT, PEN_TOP,        // 0 top-left
  PEN_RIGHT, PEN_TOP,       // 1 top-right
  PEN_RIGHT, PEN_BOTTOM,    // 2 bottom-right
  PEN_LEFT, PEN_BOTTOM,     // 3 bottom-left
  PEN_LEFT, GATE_BOTTOM,    // 4 gate lower post
  PEN_LEFT, GATE_TOP,       // 5 gate upper post
];

export const level1: LevelDef = {
  name: "Open Pasture",
  seed: 1337,
  sheepCount: 500,
  field: FIELD,
  pen: PEN,
  gateEdge: 4, // edge (4 -> 5) is the gate opening
  spawn: { x: 180, y: 460, w: 420, h: 360 },
  dogStart: { x: 640, y: 640 },
  penBack: { x: PEN_RIGHT - 70, y: (PEN_TOP + PEN_BOTTOM) / 2 },
};
