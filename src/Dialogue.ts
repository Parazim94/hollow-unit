import { fx } from './Fx';

const CHARS_PER_SEC = 45;
/** Kurze Sperre, damit Kampf-Tasten den ersten Dialog nicht sofort wegklicken. */
const MIN_OPEN_TIME = 0.4;

/** Dialogbox unten im Bild mit Typewriter-Effekt. */
export class Dialogue {
  private box: HTMLDivElement;
  private nameEl: HTMLDivElement;
  private textEl: HTMLDivElement;
  private hintEl: HTMLDivElement;

  private lines: string[] = [];
  private idx = 0;
  private shown = 0;
  private openTime = 0;
  private onDone: (() => void) | null = null;

  get active() {
    return this.onDone !== null;
  }

  constructor() {
    const root = document.createElement('div');
    root.innerHTML = `
      <style>
        #dlg { position: fixed; left: 50%; bottom: 7vh; width: min(760px, 88vw); transform: translateX(-50%); display: none;
          background: rgba(212,205,182,.94); color: #2b2923; font-family: monospace; padding: 16px 22px 20px;
          border-top: 3px solid #4a463c; border-bottom: 3px solid #4a463c; box-shadow: 0 6px 30px rgba(0,0,0,.25); pointer-events: none; }
        #dlg .name { font-size: 12px; letter-spacing: .3em; opacity: .65; margin-bottom: 8px; }
        #dlg .text { font-size: 16px; line-height: 1.6; min-height: 3.2em; }
        #dlg .hint { position: absolute; right: 16px; bottom: 6px; font-size: 12px; animation: dlgblink 1s infinite; }
        @keyframes dlgblink { 50% { opacity: 0; } }
        @media (max-height: 500px) { #dlg { bottom: 4vh; padding: 10px 16px 14px; } #dlg .text { font-size: 13px; min-height: 2.6em; } #dlg .name { margin-bottom: 4px; } }
      </style>
      <div id="dlg"><div class="name"></div><div class="text"></div><div class="hint">▼</div></div>`;
    document.body.appendChild(root);
    this.box = root.querySelector('#dlg') as HTMLDivElement;
    this.nameEl = root.querySelector('.name') as HTMLDivElement;
    this.textEl = root.querySelector('.text') as HTMLDivElement;
    this.hintEl = root.querySelector('.hint') as HTMLDivElement;
  }

  start(speaker: string, lines: string[], onDone: () => void) {
    this.lines = lines;
    this.idx = 0;
    this.shown = 0;
    this.openTime = 0;
    this.onDone = onDone;
    this.nameEl.textContent = speaker;
    this.box.style.display = 'block';
  }

  update(dt: number, advance: boolean) {
    if (!this.active) return;
    this.openTime += dt;
    const line = this.lines[this.idx];

    const before = Math.floor(this.shown);
    this.shown = Math.min(line.length, this.shown + dt * CHARS_PER_SEC);
    const now = Math.floor(this.shown);
    if (now > before && now % 2 === 0) fx.sound('blip');

    this.textEl.textContent = line.slice(0, now);
    this.hintEl.style.visibility = now >= line.length ? 'visible' : 'hidden';

    if (advance && this.openTime > MIN_OPEN_TIME) {
      if (now < line.length) {
        this.shown = line.length;
      } else if (this.idx < this.lines.length - 1) {
        this.idx++;
        this.shown = 0;
      } else {
        const done = this.onDone;
        this.onDone = null;
        this.box.style.display = 'none';
        done?.();
      }
    }
  }
}
