const DEADZONE = 0.15;

function dz(v: number) {
  return Math.abs(v) < DEADZONE ? 0 : v;
}

/** Tastatur, Maus (Pointer Lock) und Gamepad in einer Schnittstelle. */
export class Input {
  private keys = new Set<string>();
  private justPressed = new Set<string>();
  private lookX = 0;
  private lookY = 0;
  private padPrev: boolean[] = [];

  /** Pro Frame gesetzt: Gamepad-Button wurde neu gedrückt. */
  private padJump = false;
  private padDodge = false;

  constructor(canvas: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.justPressed.add(e.code);
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('click', () => {
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      this.lookX += e.movementX;
      this.lookY += e.movementY;
    });
  }

  private get pad(): Gamepad | null {
    for (const p of navigator.getGamepads()) if (p?.connected) return p;
    return null;
  }

  /** Einmal pro Frame am Anfang aufrufen. */
  poll() {
    const pad = this.pad;
    this.padJump = this.padDodge = false;
    if (pad) {
      const down = pad.buttons.map((b) => b.pressed);
      const edge = (i: number) => down[i] && !this.padPrev[i];
      this.padJump = edge(0); // A
      this.padDodge = edge(1) || edge(5) || edge(7); // B / RB / RT
      this.padPrev = down;
    } else {
      this.padPrev = [];
    }
  }

  /** Einmal pro Frame am Ende aufrufen. */
  endFrame() {
    this.justPressed.clear();
    this.lookX = this.lookY = 0;
  }

  /** x = rechts, y = vorwärts, Länge <= 1 */
  getMove(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;

    const pad = this.pad;
    if (pad) {
      x += dz(pad.axes[0] ?? 0);
      y -= dz(pad.axes[1] ?? 0);
    }
    const len = Math.hypot(x, y);
    return len > 1 ? { x: x / len, y: y / len } : { x, y };
  }

  /** Kamera-Drehung in Radiant für diesen Frame (Maus + rechter Stick). */
  getLook(dt: number): { yaw: number; pitch: number } {
    let yaw = -this.lookX * 0.0025;
    let pitch = this.lookY * 0.0025;
    const pad = this.pad;
    if (pad) {
      yaw -= dz(pad.axes[2] ?? 0) * 2.8 * dt;
      pitch += dz(pad.axes[3] ?? 0) * 2.0 * dt;
    }
    return { yaw, pitch };
  }

  jumpPressed() {
    return this.justPressed.has('Space') || this.padJump;
  }

  dodgePressed() {
    return (
      this.justPressed.has('ShiftLeft') ||
      this.justPressed.has('ShiftRight') ||
      this.padDodge
    );
  }
}
