import { Input, IS_TOUCH } from './Input';

/** Welche Bedienelemente gerade sichtbar sind. */
export type TouchMode = 'off' | 'play' | 'dialogue' | 'dead' | 'hack';

const STICK_RADIUS = 58;
const STICK_DEADZONE = 0.12;
const LOOK_SENSITIVITY = 1.6;

const CSS = `
  #touch { position: fixed; inset: 0; z-index: 20; display: none; pointer-events: none;
    -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; touch-action: none; font-family: monospace; }
  #touch .zone { position: absolute; top: 0; bottom: 0; pointer-events: auto; touch-action: none; }
  #touch .move { left: 0; width: 42%; }
  #touch .look { right: 0; width: 58%; }
  #touch .tap { inset: 0; width: auto; }
  #touch .ring { position: absolute; width: ${STICK_RADIUS * 2}px; height: ${STICK_RADIUS * 2}px; margin: -${STICK_RADIUS}px 0 0 -${STICK_RADIUS}px;
    border: 2px solid rgba(212,205,182,.55); border-radius: 50%; background: rgba(30,28,24,.25); pointer-events: none; opacity: .35; }
  #touch .ring.on { opacity: .9; }
  #touch .knob { position: absolute; left: 50%; top: 50%; width: 52px; height: 52px; margin: -26px 0 0 -26px; border-radius: 50%;
    background: rgba(212,205,182,.55); }
  #touch .btn { position: absolute; border-radius: 50%; border: 2px solid rgba(212,205,182,.7); background: rgba(30,28,24,.45);
    color: #d4cdb6; font-size: 11px; letter-spacing: .08em; display: flex; align-items: center; justify-content: center;
    pointer-events: auto; touch-action: none; }
  #touch .btn.on { background: rgba(212,205,182,.55); color: #1e1c18; }
  #touch .btn.interact { animation: touchpulse 1.2s infinite; border-color: #c0392b; }
  @keyframes touchpulse { 50% { box-shadow: 0 0 0 8px rgba(192,57,43,.25); } }
  #touch .hint { position: absolute; left: 0; right: 0; bottom: 14%; text-align: center; font-size: 13px; letter-spacing: .3em;
    color: #d4cdb6; opacity: .85; pointer-events: none; animation: touchblink 1.4s infinite; }
  @keyframes touchblink { 50% { opacity: .3; } }
`;

interface ButtonDef {
  label: string;
  code: string;
  size: number;
  right: number;
  bottom: number;
}

const BUTTONS: ButtonDef[] = [
  { label: 'HIEB', code: 'KeyJ', size: 92, right: 24, bottom: 24 },
  { label: 'SCHWER', code: 'KeyK', size: 72, right: 132, bottom: 36 },
  { label: 'SPRUNG', code: 'Space', size: 72, right: 40, bottom: 130 },
  { label: 'AUSW.', code: 'ShiftLeft', size: 72, right: 128, bottom: 122 },
  { label: 'POD', code: 'KeyE', size: 64, right: 222, bottom: 58 },
];

const safe = (side: 'right' | 'left' | 'top' | 'bottom', px: number) =>
  `calc(${px}px + env(safe-area-inset-${side}, 0px))`;

/**
 * Bildschirmsteuerung für Handys und Tablets: schwebender Stick links, Wischen für die Kamera,
 * Aktionstasten rechts. Die Tasten lösen dieselben virtuellen Eingaben aus wie die Tastatur.
 */
export class Touch {
  private root = document.createElement('div');
  private controls: HTMLElement[] = [];
  private moveZone = document.createElement('div');
  private lookZone = document.createElement('div');
  private tapZone = document.createElement('div');
  private ring = document.createElement('div');
  private knob = document.createElement('div');
  private interactBtn: HTMLDivElement;
  private pauseBtn: HTMLDivElement;
  private hint = document.createElement('div');
  private mode: TouchMode = 'off';
  private tapCode = 'Enter';

  constructor(private input: Input) {
    this.root.id = 'touch';
    const style = document.createElement('style');
    style.textContent = CSS;
    this.root.appendChild(style);

    // Stick-Zone links
    this.moveZone.className = 'zone move';
    this.ring.className = 'ring';
    this.ring.appendChild(this.knob).className = 'knob';
    this.resetRing();
    this.moveZone.appendChild(this.ring);
    this.setupStick();

    // Kamera-Zone rechts (liegt unter den Tasten)
    this.lookZone.className = 'zone look';
    this.setupLook();

    // Tippen-Fläche für Dialog und Neustart
    this.tapZone.className = 'zone tap';
    this.tapZone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.input.pressVirtual(this.tapCode);
      window.setTimeout(() => this.input.releaseVirtual(this.tapCode), 60);
    });
    this.hint.className = 'hint';

    this.root.append(this.moveZone, this.lookZone, this.tapZone, this.hint);

    for (const def of BUTTONS) this.controls.push(this.makeButton(def));
    this.interactBtn = this.makeButton({ label: 'HACKEN', code: 'KeyF', size: 76, right: 40, bottom: 224 });
    this.interactBtn.classList.add('interact');
    this.pauseBtn = this.makeButton({ label: 'II', code: 'KeyP', size: 44, right: 16, bottom: 0 });
    this.pauseBtn.style.bottom = 'auto';
    this.pauseBtn.style.top = safe('top', 12);

    document.body.appendChild(this.root);
    this.setMode('off');
  }

  setMode(mode: TouchMode) {
    if (mode === this.mode) return;
    this.mode = mode;
    const play = mode === 'play';
    this.root.style.display = mode === 'off' ? 'none' : 'block';
    this.moveZone.style.display = play || mode === 'hack' ? 'block' : 'none';
    this.lookZone.style.display = play ? 'block' : 'none';
    this.tapZone.style.display = mode === 'dialogue' || mode === 'dead' ? 'block' : 'none';
    this.tapCode = mode === 'dead' ? 'KeyR' : 'Enter';
    this.hint.style.display = mode === 'dead' ? 'block' : 'none';
    this.hint.textContent = 'TIPPEN = NEUSTART';
    for (const c of this.controls) c.style.display = play ? 'flex' : 'none';
    this.pauseBtn.style.display = play ? 'flex' : 'none';
    if (!play) this.interactBtn.style.display = 'none';
    // Beim Moduswechsel nichts hängen lassen
    this.input.setTouchMove(0, 0);
    this.resetRing();
  }

  /** Zeigt die Hack-Taste, solange man am Terminal steht. */
  setInteract(visible: boolean) {
    this.interactBtn.style.display = visible && this.mode === 'play' ? 'flex' : 'none';
  }

  private makeButton(def: ButtonDef) {
    const b = document.createElement('div');
    b.className = 'btn';
    b.textContent = def.label;
    Object.assign(b.style, {
      width: `${def.size}px`,
      height: `${def.size}px`,
      right: safe('right', def.right),
      bottom: safe('bottom', def.bottom),
    });
    const release = () => {
      b.classList.remove('on');
      this.input.releaseVirtual(def.code);
    };
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      b.classList.add('on');
      this.input.pressVirtual(def.code);
      navigator.vibrate?.(8);
    });
    b.addEventListener('pointerup', release);
    b.addEventListener('pointercancel', release);
    b.addEventListener('lostpointercapture', release);
    this.root.appendChild(b);
    return b;
  }

  private resetRing() {
    this.ring.classList.remove('on');
    this.ring.style.left = '22%';
    this.ring.style.top = '68%';
    this.knob.style.transform = 'translate(0,0)';
  }

  private setupStick() {
    let id = -1;
    let ox = 0;
    let oy = 0;
    const update = (x: number, y: number) => {
      let dx = x - ox;
      let dy = y - oy;
      const len = Math.hypot(dx, dy);
      if (len > STICK_RADIUS) {
        dx = (dx / len) * STICK_RADIUS;
        dy = (dy / len) * STICK_RADIUS;
      }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      let nx = dx / STICK_RADIUS;
      let ny = dy / STICK_RADIUS;
      if (Math.hypot(nx, ny) < STICK_DEADZONE) nx = ny = 0;
      this.input.setTouchMove(nx, -ny);
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = -1;
      this.input.setTouchMove(0, 0);
      this.resetRing();
    };
    this.moveZone.addEventListener('pointerdown', (e) => {
      if (id !== -1) return;
      e.preventDefault();
      id = e.pointerId;
      this.moveZone.setPointerCapture(id);
      // Schwebend: der Stick entsteht dort, wo der Daumen aufsetzt
      ox = e.clientX;
      oy = e.clientY;
      this.ring.style.left = `${ox}px`;
      this.ring.style.top = `${oy}px`;
      this.ring.classList.add('on');
      update(ox, oy);
    });
    this.moveZone.addEventListener('pointermove', (e) => {
      if (e.pointerId === id) update(e.clientX, e.clientY);
    });
    this.moveZone.addEventListener('pointerup', end);
    this.moveZone.addEventListener('pointercancel', end);
  }

  private setupLook() {
    let id = -1;
    let lx = 0;
    let ly = 0;
    this.lookZone.addEventListener('pointerdown', (e) => {
      if (id !== -1) return;
      e.preventDefault();
      id = e.pointerId;
      this.lookZone.setPointerCapture(id);
      lx = e.clientX;
      ly = e.clientY;
    });
    this.lookZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      this.input.addLook((e.clientX - lx) * LOOK_SENSITIVITY, (e.clientY - ly) * LOOK_SENSITIVITY);
      lx = e.clientX;
      ly = e.clientY;
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId === id) id = -1;
    };
    this.lookZone.addEventListener('pointerup', end);
    this.lookZone.addEventListener('pointercancel', end);
  }
}

export { IS_TOUCH };
