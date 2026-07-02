import type { LevelDef } from "../../src/state/level";

// Level 2: same field and pen as level 1, but with a large boulder in the middle of
// the field. It blocks both sheep and dog, so the flock must be routed around it
// (over the top or under the bottom) on the way to the pen. Geometry is authoring
// data only — the sim needs no changes to support obstacles.

// Field boundary (inset from the 2000x1200 world).
const FIELD = [40, 40, 1960, 40, 1960, 1160, 40, 1160];

// Pen on the right with a narrow gate in its left edge (edge index 4), facing the flock.
const PEN_LEFT = 1500;
const PEN_RIGHT = 1850;
const PEN_TOP = 460;
const PEN_BOTTOM = 820;
const GATE_TOP = 605;
const GATE_BOTTOM = 675;

const PEN = [
  PEN_LEFT, PEN_TOP,        // 0 top-left
  PEN_RIGHT, PEN_TOP,       // 1 top-right
  PEN_RIGHT, PEN_BOTTOM,    // 2 bottom-right
  PEN_LEFT, PEN_BOTTOM,     // 3 bottom-left
  PEN_LEFT, GATE_BOTTOM,    // 4 gate lower post
  PEN_LEFT, GATE_TOP,       // 5 gate upper post
];

// Octagonal boulder centered at (1000, 600), ~220 wide x ~340 tall. Leaves roughly
// 390px of open pasture above and below to route the flock through.
const BOULDER = [
  1110, 600,
  1078, 720,
  1000, 770,
  922, 720,
  890, 600,
  922, 480,
  1000, 430,
  1078, 480,
];

export const level2: LevelDef = {
  name: "Standing Stone",
  seed: 4242,
  sheepCount: 500,
  field: FIELD,
  pen: PEN,
  gateEdge: 4,
  obstacles: [BOULDER],
  spawn: { x: 180, y: 460, w: 420, h: 360 },
  dogStart: { x: 640, y: 640 },
  penBack: { x: PEN_RIGHT - 70, y: (PEN_TOP + PEN_BOTTOM) / 2 },
};
