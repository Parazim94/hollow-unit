import type { Input } from './Input';

const W = 640;
const H = 480;
const TIME_LIMIT = 45;
const PLAYER_SPEED = 230;
const CORE_HP = 50;
const INK = '#2b2923';
const PAPER = '#d4cdb6';

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * Hacking-Minispiel: Top-Down-Shooter auf einem 2D-Canvas.
 * Bewegen mit WASD / linker Stick, zielen mit Maus / rechter Stick,
 * schießen mit Mausklick / Leertaste / A / RT. Den Kern zerstören, bevor die Zeit abläuft.
 */
export class Hacking {
  private root: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private running = false;

  private mouse = { x: W / 2, y: 0, down: false, used: false };
  private px = W / 2;
  private py = H - 70;
  private hp = 3;
  private inv = 0;
  private aim = -Math.PI / 2;
  private fireCd = 0;
  private time = 0;
  private core = { x: W / 2, y: 90, hp: CORE_HP, spin: 0 };
  private mine: Bullet[] = [];
  private theirs: Bullet[] = [];
  private ringT = 1;
  private aimT = 0.8;
  private spiralT = 0;
  private spiralA = 0;

  constructor(
    private input: Input,
    private onFinish: (won: boolean) => void,
  ) {
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'fixed', inset: '0', display: 'none', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(30,28,24,.82)',
    });
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    Object.assign(this.canvas.style, {
      width: 'min(92vw, calc(92vh * 4 / 3))', aspectRatio: '4 / 3', cursor: 'crosshair',
      boxShadow: '0 0 0 3px #4a463c',
    });
    this.root.appendChild(this.canvas);
    document.body.appendChild(this.root);
    this.ctx = this.canvas.getContext('2d')!;

    this.canvas.addEventListener('pointermove', (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - r.left) / r.width) * W;
      this.mouse.y = ((e.clientY - r.top) / r.height) * H;
      this.mouse.used = true;
    });
    this.canvas.addEventListener('pointerdown', () => (this.mouse.down = true));
    window.addEventListener('pointerup', () => (this.mouse.down = false));
  }

  get active() {
    return this.running;
  }

  start() {
    this.px = W / 2;
    this.py = H - 70;
    this.hp = 3;
    this.inv = 0;
    this.aim = -Math.PI / 2;
    this.fireCd = 0;
    this.time = 0;
    this.core = { x: W / 2, y: 90, hp: CORE_HP, spin: 0 };
    this.mine = [];
    this.theirs = [];
    this.ringT = 1;
    this.aimT = 0.8;
    this.spiralT = 0;
    this.mouse.down = false;
    this.mouse.used = false;
    this.root.style.display = 'flex';
    this.running = true;
  }

  update(dt: number) {
    if (!this.running) return;
    this.time += dt;
    this.inv = Math.max(0, this.inv - dt);
    this.fireCd = Math.max(0, this.fireCd - dt);

    // Spieler
    const m = this.input.getMove();
    this.px = clamp(this.px + m.x * PLAYER_SPEED * dt, 14, W - 14);
    this.py = clamp(this.py - m.y * PLAYER_SPEED * dt, 150, H - 14);

    // Zielen: rechter Stick überschreibt die Maus, solange er benutzt wird
    const stick = this.input.getAimStick();
    if (Math.hypot(stick.x, stick.y) > 0.3) {
      this.aim = Math.atan2(stick.y, stick.x);
      this.mouse.used = false;
    } else if (this.mouse.used) {
      this.aim = Math.atan2(this.mouse.y - this.py, this.mouse.x - this.px);
    }

    if ((this.mouse.down || this.input.isDown('Space') || this.input.padFireHeld()) && this.fireCd === 0) {
      this.mine.push({ x: this.px, y: this.py, vx: Math.cos(this.aim) * 520, vy: Math.sin(this.aim) * 520 });
      this.fireCd = 0.11;
    }

    this.updateCore(dt);
    this.moveBullets(this.mine, dt);
    this.moveBullets(this.theirs, dt);

    // Treffer auf den Kern
    for (let i = this.mine.length - 1; i >= 0; i--) {
      const b = this.mine[i];
      if (Math.abs(b.x - this.core.x) < 36 && Math.abs(b.y - this.core.y) < 36) {
        this.core.hp--;
        this.mine.splice(i, 1);
      }
    }
    // Treffer auf den Spieler
    if (this.inv === 0) {
      for (let i = this.theirs.length - 1; i >= 0; i--) {
        const b = this.theirs[i];
        if (Math.hypot(b.x - this.px, b.y - this.py) < 10) {
          this.hp--;
          this.inv = 1.2;
          this.theirs.splice(i, 1);
          break;
        }
      }
    }

    this.draw();

    if (this.core.hp <= 0) this.finish(true);
    else if (this.hp <= 0 || this.time >= TIME_LIMIT) this.finish(false);
  }

  private updateCore(dt: number) {
    const c = this.core;
    c.x = W / 2 + Math.sin(this.time * 0.8) * 200;
    c.spin += dt * 1.5;

    this.ringT -= dt;
    if (this.ringT <= 0) {
      this.ringT = 1.4;
      const off = Math.random() * Math.PI;
      for (let i = 0; i < 12; i++) this.shoot(off + (i / 12) * Math.PI * 2, 110);
    }
    this.aimT -= dt;
    if (this.aimT <= 0) {
      this.aimT = 0.7;
      this.shoot(Math.atan2(this.py - c.y, this.px - c.x), 170);
    }
    // Zweite Phase: zusätzlich eine Spirale
    if (c.hp < CORE_HP / 2) {
      this.spiralT -= dt;
      if (this.spiralT <= 0) {
        this.spiralT = 0.14;
        this.spiralA += 0.5;
        this.shoot(this.spiralA, 130);
      }
    }
  }

  private shoot(angle: number, speed: number) {
    this.theirs.push({
      x: this.core.x, y: this.core.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    });
  }

  private moveBullets(list: Bullet[], dt: number) {
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) list.splice(i, 1);
    }
  }

  private finish(won: boolean) {
    this.running = false;
    this.root.style.display = 'none';
    this.mouse.down = false;
    this.onFinish(won);
  }

  private draw() {
    const g = this.ctx;
    g.fillStyle = PAPER;
    g.fillRect(0, 0, W, H);

    // Raster
    g.strokeStyle = 'rgba(74,70,60,.12)';
    g.lineWidth = 1;
    g.beginPath();
    for (let x = 0; x <= W; x += 32) { g.moveTo(x, 0); g.lineTo(x, H); }
    for (let y = 0; y <= H; y += 32) { g.moveTo(0, y); g.lineTo(W, y); }
    g.stroke();

    // Kern
    const c = this.core;
    g.save();
    g.translate(c.x, c.y);
    g.rotate(c.spin);
    g.strokeStyle = INK;
    g.lineWidth = 3;
    g.strokeRect(-30, -30, 60, 60);
    g.rotate(-c.spin * 2);
    g.fillStyle = INK;
    g.fillRect(-14, -14, 28, 28);
    g.restore();

    // Gegnerische Geschosse: Ring mit Punkt
    g.strokeStyle = INK;
    g.lineWidth = 2;
    for (const b of this.theirs) {
      g.beginPath();
      g.arc(b.x, b.y, 6, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = INK;
      g.fillRect(b.x - 1.5, b.y - 1.5, 3, 3);
    }
    // Eigene Geschosse
    g.fillStyle = INK;
    for (const b of this.mine) g.fillRect(b.x - 2, b.y - 2, 4, 4);

    // Spieler (blinkt bei Unverwundbarkeit)
    if (this.inv === 0 || Math.floor(this.inv * 14) % 2 === 0) {
      g.save();
      g.translate(this.px, this.py);
      g.rotate(this.aim + Math.PI / 2);
      g.fillStyle = INK;
      g.beginPath();
      g.moveTo(0, -11);
      g.lineTo(8, 8);
      g.lineTo(0, 4);
      g.lineTo(-8, 8);
      g.closePath();
      g.fill();
      g.restore();
    }

    // Anzeigen
    g.font = '12px monospace';
    g.fillStyle = INK;
    g.textBaseline = 'top';
    g.fillText('HACKING', 14, 12);
    g.textAlign = 'right';
    g.fillText(`${Math.max(0, TIME_LIMIT - this.time).toFixed(1)} s`, W - 14, 12);
    g.textAlign = 'left';
    // Kern-Balken
    g.strokeRect(W / 2 - 160, 12, 320, 8);
    g.fillRect(W / 2 - 160, 12, 320 * Math.max(0, c.hp / CORE_HP), 8);
    // Lebenspunkte
    for (let i = 0; i < 3; i++) {
      if (i < this.hp) g.fillRect(14 + i * 18, H - 24, 12, 12);
      else g.strokeRect(14 + i * 18, H - 24, 12, 12);
    }
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
