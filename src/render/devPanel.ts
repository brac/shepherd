// Dev-tools panel (toggle with `). A plain DOM overlay — NOT a Pixi view — that reads and
// writes GameState.dev, the runtime override bag. Deliberately outside the sim/render split:
// it's a playtest instrument, not game logic. Add a knob with one addSlider() call.

import type { GameState } from "../state/gameState";
import { DOG_TROT_SPEED } from "../../data/tuning";

export class DevPanel {
  private readonly el: HTMLDivElement;
  private on = false;

  constructor(private readonly state: GameState) {
    const el = document.createElement("div");
    el.style.cssText = [
      "position:fixed",
      "top:12px",
      "right:12px",
      "z-index:1000",
      "min-width:230px",
      "padding:12px 14px",
      "border-radius:8px",
      "background:rgba(20,24,18,0.9)",
      "color:#e8f0d8",
      "font:12px/1.4 ui-monospace,Menlo,Consolas,monospace",
      "box-shadow:0 6px 20px rgba(0,0,0,0.45)",
      "display:none",
      "user-select:none",
    ].join(";");

    const title = document.createElement("div");
    title.textContent = "dev tools · ` to close";
    title.style.cssText = "font-weight:bold;margin-bottom:12px;opacity:0.75";
    el.appendChild(title);

    this.el = el;
    document.body.appendChild(el);

    // ---- Knobs ----
    this.addSlider(
      "Dog max speed",
      40,
      400,
      5,
      () => this.state.dev.dogTrotSpeed,
      (v) => (this.state.dev.dogTrotSpeed = v),
      DOG_TROT_SPEED,
    );
  }

  /** Toggle visibility (bound to ` in main.ts). */
  toggle(): void {
    this.on = !this.on;
    this.el.style.display = this.on ? "block" : "none";
  }

  private addSlider(
    label: string,
    min: number,
    max: number,
    step: number,
    get: () => number,
    set: (v: number) => void,
    def: number,
  ): void {
    const row = document.createElement("div");
    row.style.cssText = "margin-bottom:12px";

    const head = document.createElement("div");
    head.style.cssText = "display:flex;justify-content:space-between;margin-bottom:4px";
    const name = document.createElement("span");
    name.textContent = label;
    const val = document.createElement("span");
    val.style.opacity = "0.9";
    val.textContent = String(get());
    head.appendChild(name);
    head.appendChild(val);

    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(get());
    input.style.cssText = "width:100%";
    input.addEventListener("input", () => {
      const v = Number(input.value);
      set(v);
      val.textContent = String(v);
    });

    // Double-click the label to reset to the tuning default.
    name.style.cursor = "pointer";
    name.title = `reset to ${def}`;
    name.addEventListener("dblclick", () => {
      set(def);
      input.value = String(def);
      val.textContent = String(def);
    });

    row.appendChild(head);
    row.appendChild(input);
    this.el.appendChild(row);
  }
}
