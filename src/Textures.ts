import * as THREE from 'three';
import { rng } from './rng';

type Ctx = CanvasRenderingContext2D;

function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function toTexture(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Feine Körnung über die ganze Fläche. */
function speckle(g: Ctx, w: number, h: number, rand: () => number, count: number, maxSize = 3) {
  for (let i = 0; i < count; i++) {
    const light = rand() > 0.5;
    g.fillStyle = light ? `rgba(255,250,235,${0.04 + rand() * 0.12})` : `rgba(30,26,20,${0.05 + rand() * 0.14})`;
    const s = 1 + rand() * maxSize;
    g.fillRect(rand() * w, rand() * h, s, s);
  }
}

/** Weicher Fleck, der an den Rändern umbricht (damit die Textur nahtlos kachelt). */
function blotch(g: Ctx, w: number, h: number, x: number, y: number, r: number, color: string) {
  for (const dx of [-w, 0, w]) {
    for (const dy of [-h, 0, h]) {
      const grad = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
    }
  }
}

/** Risse als verzweigte Linien (nur im Inneren, daher ohne sichtbare Naht). */
function cracks(g: Ctx, w: number, h: number, rand: () => number, count: number, color: string) {
  g.strokeStyle = color;
  g.lineCap = 'round';
  const walk = (x: number, y: number, ang: number, len: number, width: number, depth: number) => {
    g.lineWidth = width;
    g.beginPath();
    g.moveTo(x, y);
    for (let i = 0; i < len; i += 8) {
      ang += (rand() - 0.5) * 0.7;
      x += Math.cos(ang) * 8;
      y += Math.sin(ang) * 8;
      if (x < 24 || x > w - 24 || y < 24 || y > h - 24) break;
      g.lineTo(x, y);
      if (depth < 2 && rand() < 0.05) {
        g.stroke();
        walk(x, y, ang + (rand() > 0.5 ? 1 : -1) * (0.6 + rand() * 0.6), len * 0.5, width * 0.6, depth + 1);
        g.lineWidth = width;
        g.beginPath();
        g.moveTo(x, y);
      }
    }
    g.stroke();
  };
  for (let i = 0; i < count; i++) {
    walk(40 + rand() * (w - 80), 40 + rand() * (h - 80), rand() * Math.PI * 2, 80 + rand() * 220, 1 + rand() * 1.8, 0);
  }
}

/** Betonboden mit Moos und Rissen (kachelbar, ~5 m pro Kachel). */
export function groundTexture() {
  const rand = rng(11);
  const [c, g] = makeCanvas(1024, 1024);
  g.fillStyle = '#b3ab94';
  g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 70; i++) {
    blotch(g, 1024, 1024, rand() * 1024, rand() * 1024, 40 + rand() * 110, rand() > 0.5 ? 'rgba(255,248,225,.14)' : 'rgba(60,52,40,.14)');
  }
  for (let i = 0; i < 18; i++) {
    blotch(g, 1024, 1024, rand() * 1024, rand() * 1024, 30 + rand() * 80, 'rgba(105,120,72,.33)');
  }
  speckle(g, 1024, 1024, rand, 16000, 4);
  cracks(g, 1024, 1024, rand, 22, 'rgba(70,62,50,.55)');
  return toTexture(c);
}

/** Asphalt mit Fahrbahnmarkierung (10 × 10 m pro Kachel, Länge in Z kachelt). */
export function roadTexture() {
  const rand = rng(23);
  const [c, g] = makeCanvas(512, 512);
  g.fillStyle = '#6c6b64';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 40; i++) {
    blotch(g, 512, 512, rand() * 512, rand() * 512, 30 + rand() * 70, rand() > 0.5 ? 'rgba(200,195,180,.08)' : 'rgba(20,18,15,.14)');
  }
  speckle(g, 512, 512, rand, 9000, 3);

  // Markierungen: durchgezogene Randlinien, gestrichelte Mitte
  g.fillStyle = '#d8d2c0';
  g.fillRect(34, 0, 8, 512);
  g.fillRect(470, 0, 8, 512);
  g.fillRect(252, 20, 8, 130);
  g.fillRect(252, 276, 8, 130);
  // Abnutzung: Asphalt über die Linien streuen
  for (let i = 0; i < 1800; i++) {
    g.fillStyle = `rgba(108,107,100,${0.4 + rand() * 0.5})`;
    const zone = rand();
    const x = zone < 0.33 ? 30 + rand() * 16 : zone < 0.66 ? 466 + rand() * 16 : 248 + rand() * 16;
    g.fillRect(x, rand() * 512, 2 + rand() * 5, 2 + rand() * 9);
  }
  cracks(g, 512, 512, rand, 7, 'rgba(25,22,18,.32)');
  for (let i = 0; i < 4; i++) blotch(g, 512, 512, 60 + rand() * 390, 60 + rand() * 390, 14 + rand() * 24, 'rgba(25,22,18,.5)');
  return toTexture(c);
}

/**
 * Fassade eines Hochhauses: Betonwand mit Fenstern, Verwitterung und Moos.
 * Eine Kachel deckt 8 m × 12 m ab (4 × 4 Fenster).
 */
export function facadeTexture(seed: number, wall: string) {
  const rand = rng(seed);
  const W = 512;
  const H = 768;
  const [c, g] = makeCanvas(W, H);
  g.fillStyle = wall;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 25; i++) {
    blotch(g, W, H, rand() * W, rand() * H, 40 + rand() * 90, rand() > 0.5 ? 'rgba(255,250,235,.1)' : 'rgba(40,34,26,.12)');
  }
  speckle(g, W, H, rand, 9000, 3);

  const cw = W / 4;
  const ch = H / 4;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const x = col * cw + 20;
      const y = row * ch + 34;
      const w = cw - 40;
      const h = ch - 78;
      // Fensterhöhle
      g.fillStyle = '#26241f';
      g.fillRect(x, y, w, h);
      // Himmel-Reflexion in manchen Scheiben
      if (rand() < 0.45) {
        const grad = g.createLinearGradient(x, y, x + w, y + h);
        grad.addColorStop(0, 'rgba(190,185,165,.5)');
        grad.addColorStop(1, 'rgba(70,66,56,.1)');
        g.fillStyle = grad;
        g.fillRect(x + 4, y + 4, w - 8, h - 8);
      }
      // Gesprungene Scheiben
      if (rand() < 0.5) {
        g.strokeStyle = 'rgba(220,215,195,.55)';
        g.lineWidth = 1;
        g.beginPath();
        const cx = x + rand() * w;
        const cy = y + rand() * h;
        for (let k = 0; k < 5; k++) {
          g.moveTo(cx, cy);
          g.lineTo(cx + (rand() - 0.5) * w, cy + (rand() - 0.5) * h);
        }
        g.stroke();
      }
      // Fensterbank und Schmutzstreifen darunter
      g.fillStyle = 'rgba(210,203,184,.55)';
      g.fillRect(x - 4, y + h, w + 8, 6);
      const streak = g.createLinearGradient(0, y + h + 6, 0, y + h + 70);
      streak.addColorStop(0, 'rgba(35,30,22,.3)');
      streak.addColorStop(1, 'rgba(35,30,22,0)');
      g.fillStyle = streak;
      g.fillRect(x + w * 0.15, y + h + 6, w * 0.7, 64);
      // Efeu, das aus dem Fenster hängt
      if (rand() < 0.3) {
        g.strokeStyle = 'rgba(88,102,58,.85)';
        g.lineWidth = 3;
        for (let k = 0; k < 6; k++) {
          const vx = x + rand() * w;
          g.beginPath();
          g.moveTo(vx, y + h);
          g.lineTo(vx + (rand() - 0.5) * 12, y + h + 20 + rand() * 50);
          g.stroke();
        }
      }
    }
    // Geschossbänder
    g.fillStyle = 'rgba(40,35,28,.35)';
    g.fillRect(0, row * ch + ch - 4, W, 4);
  }
  cracks(g, W, H, rand, 4, 'rgba(40,34,26,.45)');
  return toTexture(c);
}

/** Weicher Verlauf für Lichtkegel o. Ä. */
export function softGradientTexture() {
  const [c, g] = makeCanvas(64, 256);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.3, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Weiche, kachelbare Nebelschwaden (Alpha-Textur). */
export function mistTexture() {
  const rand = rng(31);
  const [c, g] = makeCanvas(256, 256);
  for (let i = 0; i < 70; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const r = 25 + rand() * 60;
    const a = 0.1 + rand() * 0.22;
    // Umbrechen, damit die Kachel nahtlos ist; Farbe bleibt Weiß, nur Alpha läuft aus
    for (const dx of [-256, 0, 256]) {
      for (const dy of [-256, 0, 256]) {
        const grad = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
        grad.addColorStop(0, `rgba(255,252,240,${a})`);
        grad.addColorStop(1, 'rgba(255,252,240,0)');
        g.fillStyle = grad;
        g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
      }
    }
  }
  return toTexture(c);
}
