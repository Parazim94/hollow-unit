/** Handy oder Tablet: der primäre Zeiger ist ein Finger. Hybrid-Laptops mit Maus zählen nicht. */
export const IS_TOUCH = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

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
  private touchMove = { x: 0, y: 0 };

  /** Pro Frame gesetzt aus dem Gamepad. */
  private padJump = false;
  private padDodge = false;
  private padLight = false;
  private padHeavy = false;
  private padRestart = false;
  private padPodHeld = false;
  private padInteract = false;
  private padFire = false;

  constructor(canvas: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.justPressed.add(e.code);
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    // Auf Touch-Geräten gibt es keinen Pointer Lock, dort steuert Touch.ts die Kamera
    if (!IS_TOUCH) {
      canvas.addEventListener('click', () => {
        if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
      });
    }
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => {
      // Der erste Klick fängt nur die Maus, er löst keinen Angriff aus
      if (document.pointerLockElement === canvas) this.justPressed.add(`Mouse${e.button}`);
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      this.lookX += e.movementX;
      this.lookY += e.movementY;
    });
  }

  // --- Touch (wird von Touch.ts befüllt) ---

  /** x = rechts, y = vorwärts, jeweils -1..1 */
  setTouchMove(x: number, y: number) {
    this.touchMove.x = x;
    this.touchMove.y = y;
  }

  addLook(dx: number, dy: number) {
    this.lookX += dx;
    this.lookY += dy;
  }

  /** Simuliert einen Tastendruck (Bildschirmtasten). */
  pressVirtual(code: string) {
    if (!this.keys.has(code)) this.justPressed.add(code);
    this.keys.add(code);
  }

  releaseVirtual(code: string) {
    this.keys.delete(code);
  }

  private get pad(): Gamepad | null {
    for (const p of navigator.getGamepads()) if (p?.connected) return p;
    return null;
  }

  /** Einmal pro Frame am Anfang aufrufen. */
  poll() {
    const pad = this.pad;
    this.padJump = this.padDodge = this.padLight = this.padHeavy = this.padRestart = false;
    this.padPodHeld = false;
    this.padInteract = this.padFire = false;
    if (pad) {
      const down = pad.buttons.map((b) => b.pressed);
      const edge = (i: number) => down[i] && !this.padPrev[i];
      this.padJump = edge(0); // A
      this.padDodge = edge(1) || edge(5) || edge(7); // B / RB / RT
      this.padLight = edge(2); // X
      this.padHeavy = edge(3); // Y
      this.padRestart = edge(9); // Start
      this.padPodHeld = !!(down[4] || down[6]); // LB / LT
      this.padInteract = edge(12); // Steuerkreuz oben
      this.padFire = !!(down[0] || down[7]); // A / RT (Hacking)
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

    x += this.touchMove.x;
    y += this.touchMove.y;

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

  /** Leichter Angriff: linke Maustaste / J / X */
  lightPressed() {
    return this.justPressed.has('Mouse0') || this.justPressed.has('KeyJ') || this.padLight;
  }

  /** Schwerer Angriff: rechte Maustaste / K / Y */
  heavyPressed() {
    return this.justPressed.has('Mouse2') || this.justPressed.has('KeyK') || this.padHeavy;
  }

  /** Pod-Schuss (gehalten): E / LB / LT */
  podHeld() {
    return this.keys.has('KeyE') || this.padPodHeld;
  }

  /** Terminal benutzen: F / Steuerkreuz oben */
  interactPressed() {
    return this.justPressed.has('KeyF') || this.padInteract;
  }

  /** Pause: P / Start */
  pausePressed() {
    return this.justPressed.has('KeyP') || this.padRestart;
  }

  /** Menü und Dialoge bestätigen: Enter / Leertaste / linke Maustaste / A */
  confirmPressed() {
    return (
      this.justPressed.has('Enter') ||
      this.justPressed.has('NumpadEnter') ||
      this.justPressed.has('Space') ||
      this.justPressed.has('Mouse0') ||
      this.padJump
    );
  }

  isDown(code: string) {
    return this.keys.has(code);
  }

  padFireHeld() {
    return this.padFire;
  }

  /** Rechter Stick roh (x rechts, y unten), mit Deadzone. */
  getAimStick(): { x: number; y: number } {
    const pad = this.pad;
    return pad ? { x: dz(pad.axes[2] ?? 0), y: dz(pad.axes[3] ?? 0) } : { x: 0, y: 0 };
  }

  restartPressed() {
    return this.justPressed.has('KeyR') || this.padRestart;
  }

  /** Nur zum Testen im Dev-Modus: H verursacht Schaden. */
  debugHurtPressed() {
    return this.justPressed.has('KeyH');
  }
}
