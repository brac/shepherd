// The dog: resolve mouse-driven input intent into a state (trot / prone / stalk),
// ease velocity toward the target (limited speed, ease-in/out), integrate, and
// collide with fences (push-out + slide, same as sheep). Bark timers ticked here;
// the actual panic burst is applied by the panic pass (reads dog.barkFired).

import {
  DOG_PRONE,
  DOG_STALK,
  DOG_TROT,
  type GameState,
} from "../state/gameState";
import { collideWalls, collideOut } from "./collision";
import {
  BARK_COOLDOWN,
  BARK_DURATION,
  DOG_ACCEL_EASE,
  DOG_ARRIVE_RADIUS,
  DOG_RADIUS,
  DOG_STALK_SPEED,
} from "../../data/tuning";

/** Snap the dog's facing toward the nearest sheep (the "eye"). Called on prone. */
function snapFacingToNearestSheep(state: GameState): void {
  const s = state.sheep;
  const dog = state.dog;
  let best = -1;
  let bestD2 = Infinity;
  for (let i = 0; i < s.count; i++) {
    const dx = s.posX[i] - dog.x;
    const dy = s.posY[i] - dog.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = i;
    }
  }
  if (best >= 0) {
    dog.facing = Math.atan2(s.posY[best] - dog.y, s.posX[best] - dog.x);
  }
}

export function updateDog(state: GameState, dt: number): void {
  const dog = state.dog;
  const input = state.input;

  // ---- Bark timers ----
  dog.barkFired = false;
  if (dog.barkCooldown > 0) {
    dog.barkCooldown -= dt;
    if (dog.barkCooldown < 0) dog.barkCooldown = 0;
  }
  if (dog.barkTimer > 0) {
    dog.barkTimer -= dt;
    if (dog.barkTimer < 0) dog.barkTimer = 0;
  }
  if (input.barkQueued) {
    input.barkQueued = false;
    if (dog.barkCooldown <= 0) {
      dog.barkTimer = BARK_DURATION;
      dog.barkCooldown = BARK_COOLDOWN;
      dog.barkFired = true;
    }
  }

  // ---- State resolution ----
  // Holding left plants the dog: moving the mouse while held stalks, holding still
  // stops it (prone hold). Releasing returns to trot-follow.
  const wasProne = dog.state === DOG_PRONE;
  if (input.leftDown) {
    if (input.dragging) {
      dog.state = DOG_STALK;
    } else {
      dog.state = DOG_PRONE;
      if (!wasProne) snapFacingToNearestSheep(state);
    }
  } else {
    dog.state = DOG_TROT;
  }

  // Prone = hard stop. The dog holds position (soft wall) and does not integrate.
  if (dog.state === DOG_PRONE) {
    dog.velX = 0;
    dog.velY = 0;
    return;
  }

  // ---- Movement target (trot / stalk) ----
  const targetX = input.mouseWorldX;
  const targetY = input.mouseWorldY;
  const maxSpeed = dog.state === DOG_STALK ? DOG_STALK_SPEED : state.dev.dogTrotSpeed;

  // Desired velocity with arrive (ease-out near the target).
  let desiredVX = 0;
  let desiredVY = 0;
  const tdx = targetX - dog.x;
  const tdy = targetY - dog.y;
  const td = Math.hypot(tdx, tdy);
  if (td > 1e-4 && maxSpeed > 0) {
    let speed = maxSpeed;
    if (td < DOG_ARRIVE_RADIUS) speed = maxSpeed * (td / DOG_ARRIVE_RADIUS);
    desiredVX = (tdx / td) * speed;
    desiredVY = (tdy / td) * speed;
  }

  // Ease current velocity toward desired (ease-in).
  const k = Math.min(1, DOG_ACCEL_EASE * dt);
  dog.velX += (desiredVX - dog.velX) * k;
  dog.velY += (desiredVY - dog.velY) * k;

  // Integrate + collide.
  const nx = dog.x + dog.velX * dt;
  const ny = dog.y + dog.velY * dt;
  collideWalls(state.level.walls, state.level.wallCount, nx, ny, dog.velX, dog.velY, DOG_RADIUS);
  dog.x = collideOut.x;
  dog.y = collideOut.y;
  dog.velX = collideOut.vx;
  dog.velY = collideOut.vy;

  // Facing follows motion (prone returned early with its snapped facing).
  const sp2 = dog.velX * dog.velX + dog.velY * dog.velY;
  if (sp2 > 1) dog.facing = Math.atan2(dog.velY, dog.velX);
}

/** Current fear-radius-relevant state helper for the panic pass. */
export function isProne(state: GameState): boolean {
  return state.dog.state === DOG_PRONE;
}
