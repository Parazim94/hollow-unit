import * as THREE from 'three';
import type { EnemyState } from './Enemy';

/** Was die Logik der Animation pro Frame mitteilt. */
export interface RigInfo {
  /** horizontale Geschwindigkeit in m/s */
  speed: number;
  /** Sekunden seit Spielstart (für Idle-Bewegung) */
  time: number;
  state: EnemyState;
  /** Fortschritt 0..1 des aktuellen Zustands (Ausholen, Angriff, Erholen ...) */
  progress: number;
  phase2?: boolean;
  kind?: 'slam' | 'charge';
}

const RUST = 0x7a5a42;
const DARK = 0x2a2822;
const PALE = 0xb8b09a;

const std = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.35, ...extra });

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);

/** Leuchtendes Auge; `set` skaliert die Helligkeit (über 1 = Bloom). */
function glowMaterial() {
  const m = new THREE.MeshBasicMaterial({ color: 0xff4a3a });
  return {
    material: m,
    set(i: number) {
      m.color.setRGB(1.0 * i, 0.22 * i, 0.15 * i);
    },
  };
}

function add<T extends THREE.Object3D>(parent: THREE.Object3D, child: T, x = 0, y = 0, z = 0) {
  child.position.set(x, y, z);
  parent.add(child);
  return child;
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  return m;
}

/** Zylinder, der vom Gelenk nach unten hängt. */
function hanging(r0: number, r1: number, len: number, mat: THREE.Material) {
  const g = new THREE.CylinderGeometry(r0, r1, len, 10);
  g.translate(0, -len / 2, 0);
  return mesh(g, mat);
}

/** Schrottläufer: gedrungener Körper, Stummelbeine, Greifarm, einzelnes rotes Auge. */
export class WalkerRig {
  readonly root = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private armR = new THREE.Group();
  private forearmR = new THREE.Group();
  private armL = new THREE.Group();
  private eye = glowMaterial();
  private phase = 0;

  constructor(body: THREE.Material) {
    const rust = std(RUST, { roughness: 0.9 });
    const dark = std(DARK);
    const pale = std(PALE);

    for (const [side, leg] of [[1, this.legL], [-1, this.legR]] as const) {
      leg.position.set(side * 0.2, 0.62, 0);
      leg.add(hanging(0.11, 0.085, 0.52, rust));
      add(leg, mesh(new THREE.BoxGeometry(0.24, 0.1, 0.36), dark), 0, -0.55, 0.06);
      this.root.add(leg);
    }

    this.torso.position.y = 0.6;
    this.root.add(this.torso);
    add(this.torso, mesh(new THREE.CylinderGeometry(0.4, 0.46, 0.85, 14), body), 0, 0.42, 0);
    for (const y of [0.18, 0.66]) add(this.torso, mesh(new THREE.CylinderGeometry(0.475, 0.475, 0.06, 14), rust), 0, y, 0);
    add(this.torso, mesh(new THREE.BoxGeometry(0.34, 0.3, 0.06), pale), 0, 0.45, 0.43);
    add(this.torso, mesh(new THREE.BoxGeometry(0.4, 0.4, 0.12), dark), 0, 0.5, -0.44);

    this.head.position.y = 1.0;
    this.torso.add(this.head);
    const skull = mesh(new THREE.SphereGeometry(0.3, 18, 14), body);
    skull.scale.y = 0.9;
    this.head.add(skull);
    add(this.head, mesh(new THREE.BoxGeometry(0.46, 0.2, 0.1), dark), 0, 0.02, 0.24);
    add(this.head, mesh(new THREE.SphereGeometry(0.085, 12, 10), this.eye.material, false), 0, 0.02, 0.3);
    for (const side of [1, -1]) {
      const ear = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 10), rust);
      ear.rotation.z = Math.PI / 2;
      add(this.head, ear, side * 0.31, 0, 0);
    }
    const ant = add(this.head, mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 5), dark), 0.13, 0.42, -0.05);
    ant.rotation.z = -0.25;
    add(this.head, mesh(new THREE.SphereGeometry(0.035, 8, 6), this.eye.material, false), 0.18, 0.62, -0.05);

    // Greifarm (rechts) und kurzer Arm (links)
    this.armR.position.set(0.52, 0.8, 0);
    this.armR.add(hanging(0.09, 0.075, 0.45, rust));
    this.forearmR.position.y = -0.45;
    this.forearmR.add(hanging(0.075, 0.06, 0.42, dark));
    for (const px of [-0.06, 0.06]) {
      const claw = mesh(new THREE.BoxGeometry(0.04, 0.2, 0.05), pale);
      claw.position.set(px, -0.5, 0.02);
      this.forearmR.add(claw);
    }
    this.armR.add(this.forearmR);
    this.torso.add(this.armR);

    this.armL.position.set(-0.5, 0.8, 0);
    this.armL.add(hanging(0.08, 0.065, 0.5, rust));
    add(this.armL, mesh(new THREE.SphereGeometry(0.075, 8, 6), dark), 0, -0.52, 0);
    this.torso.add(this.armL);
  }

  update(dt: number, s: RigInfo) {
    const run = clamp01(s.speed / 3.6);
    this.phase += dt * s.speed * 2.2;
    const sw = Math.sin(this.phase);
    const p = clamp01(s.progress);

    let lean = 0.06 * run;
    let armR = 0.15 + Math.sin(this.phase + Math.PI) * 0.5 * run;
    let forearm = -0.3;
    let armL = sw * 0.5 * run;
    let headTilt = 0;
    let glow = s.state === 'idle' ? 0.7 : 1.6;

    switch (s.state) {
      case 'windup': // Arm hoch und zurück, Oberkörper kippt nach hinten
        lean = -0.35 * ease(p);
        armR = lerp(0.15, -2.5, ease(p));
        forearm = lerp(-0.3, -0.9, p);
        armL = lerp(0, -0.6, p);
        glow = 1.6 + 2.6 * p + Math.sin(s.time * 40) * 0.5;
        break;
      case 'attack': // Hieb nach vorn
        lean = lerp(-0.35, 0.5, ease(p * 2));
        armR = lerp(-2.5, 0.9, ease(p * 2));
        forearm = -0.1;
        armL = 0.6;
        glow = 4;
        break;
      case 'recover':
        lean = lerp(0.4, 0.15, p);
        armR = lerp(0.9, 0.15, ease(p));
        glow = 0.9;
        break;
      case 'stagger':
        lean = -0.35;
        armR = 0.8 + Math.sin(s.time * 35) * 0.3;
        armL = -0.8 + Math.sin(s.time * 31) * 0.3;
        headTilt = -0.5;
        glow = 1 + Math.sin(s.time * 50) * 0.8;
        break;
    }
    // Im Stand: Kopf schaut langsam umher, Körper atmet
    const idle = s.state === 'idle' ? 1 : 0;
    this.head.rotation.y = Math.sin(s.time * 0.8) * 0.4 * idle;
    this.head.rotation.x = headTilt;

    this.legL.rotation.x = -sw * 0.6 * run;
    this.legR.rotation.x = sw * 0.6 * run;
    this.torso.position.y = 0.6 + Math.abs(sw) * 0.05 * run + Math.sin(s.time * 1.6) * 0.012 * idle;
    this.torso.rotation.x = lean;
    this.armR.rotation.x = armR;
    this.forearmR.rotation.x = forearm;
    this.armL.rotation.x = armL;
    this.eye.set(glow);
  }
}

/** Schwebende Geschützdrohne: Kugelkörper, kreisender Ring, großes Auge, Rohr. */
export class ShooterRig {
  readonly root = new THREE.Group();
  private hover = new THREE.Group();
  private ring = new THREE.Group();
  private lens: THREE.Mesh;
  private barrel: THREE.Mesh;
  private flames: THREE.Mesh[] = [];
  private eye = glowMaterial();
  private recoil = 0;

  constructor(body: THREE.Material) {
    const rust = std(RUST, { roughness: 0.9 });
    const dark = std(DARK);
    const pale = std(PALE);

    this.hover.position.y = 1.4;
    this.root.add(this.hover);
    const core = mesh(new THREE.SphereGeometry(0.42, 20, 16), body);
    core.scale.y = 0.92;
    this.hover.add(core);

    // Ringe: einer waagerecht rotierend, einer schräg
    const ring = mesh(new THREE.TorusGeometry(0.58, 0.045, 8, 32), rust);
    ring.rotation.x = Math.PI / 2;
    this.ring.add(ring);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      add(this.ring, mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), pale), Math.cos(a) * 0.58, 0, Math.sin(a) * 0.58);
    }
    this.hover.add(this.ring);
    const tilted = mesh(new THREE.TorusGeometry(0.5, 0.025, 6, 28), dark);
    tilted.rotation.set(0.5, 0, 0.3);
    this.hover.add(tilted);

    // Auge mit Linse
    const socket = mesh(new THREE.CylinderGeometry(0.23, 0.26, 0.1, 16), dark);
    socket.rotation.x = Math.PI / 2;
    add(this.hover, socket, 0, 0.04, 0.36);
    this.lens = mesh(new THREE.SphereGeometry(0.12, 14, 10), this.eye.material, false);
    add(this.hover, this.lens, 0, 0.04, 0.42);

    // Rohr unter dem Auge
    const barrelGeo = new THREE.CylinderGeometry(0.05, 0.065, 0.5, 8);
    barrelGeo.rotateX(Math.PI / 2);
    this.barrel = mesh(barrelGeo, dark);
    add(this.hover, this.barrel, 0, -0.22, 0.38);

    // Flossen und Triebwerke
    for (const side of [1, -1]) {
      const fin = mesh(new THREE.BoxGeometry(0.45, 0.04, 0.26), rust);
      add(this.hover, fin, side * 0.5, 0.05, -0.1).rotation.z = side * -0.25;
      const flame = mesh(new THREE.ConeGeometry(0.09, 0.3, 8), this.eye.material, false);
      flame.rotation.x = Math.PI;
      add(this.hover, flame, side * 0.24, -0.58, -0.12);
      this.flames.push(flame);
    }
    const ant = add(this.hover, mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.45, 5), dark), -0.1, 0.62, -0.1);
    ant.rotation.z = 0.2;
  }

  /** Beim Abfeuern aufrufen, das Rohr schnellt zurück. */
  kick() {
    this.recoil = 1;
  }

  update(dt: number, s: RigInfo) {
    const p = clamp01(s.progress);
    this.recoil = Math.max(0, this.recoil - dt * 7);
    const windup = s.state === 'windup' ? ease(p) : 0;

    let glow = s.state === 'idle' ? 0.7 : 1.5;
    if (s.state === 'windup') glow = 1.6 + 3 * p + Math.sin(s.time * 40) * 0.5;
    if (s.state === 'attack') glow = 4;
    if (s.state === 'stagger') glow = 1 + Math.sin(s.time * 50) * 0.8;
    this.eye.set(glow);

    // Schweben, in Bewegungsrichtung nach vorn kippen
    this.hover.position.y = 1.4 + Math.sin(s.time * 2.1) * 0.08;
    this.hover.rotation.x = clamp01(s.speed / 4) * 0.18;
    this.hover.rotation.z = s.state === 'stagger' ? Math.sin(s.time * 40) * 0.3 : Math.sin(s.time * 1.3) * 0.04;
    this.ring.rotation.y += dt * (1.2 + windup * 8 + (s.state === 'attack' ? 6 : 0));

    this.lens.scale.setScalar(1 + windup * 0.9);
    this.barrel.position.z = 0.38 + windup * 0.1 - this.recoil * 0.14;
    for (const f of this.flames) {
      f.scale.y = 0.7 + clamp01(s.speed / 3.5) * 0.9 + Math.sin(s.time * 35) * 0.12;
    }
  }
}

/** Colossus: wuchtiger Koloss mit Schulterstacheln, Brustschlitzen und Abgasrohren. */
export class BossRig {
  readonly root = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private elbowL = new THREE.Group();
  private elbowR = new THREE.Group();
  private chest: THREE.Mesh;
  private glowMat = glowMaterial();
  private phase = 0;

  constructor(body: THREE.Material) {
    const rust = std(RUST, { roughness: 0.9 });
    const dark = std(DARK);
    const pale = std(PALE);

    // Beine
    for (const [side, leg] of [[1, this.legL], [-1, this.legR]] as const) {
      leg.position.set(side * 0.8, 1.6, 0);
      const thigh = new THREE.BoxGeometry(0.85, 1.6, 0.9);
      thigh.translate(0, -0.8, 0);
      leg.add(mesh(thigh, body));
      add(leg, mesh(new THREE.BoxGeometry(0.95, 0.12, 1.0), rust), 0, -0.9, 0.02);
      add(leg, mesh(new THREE.BoxGeometry(1.05, 0.35, 1.5), dark), 0, -1.45, 0.25);
      this.root.add(leg);
    }

    // Rumpf
    this.torso.position.y = 1.6;
    this.root.add(this.torso);
    add(this.torso, mesh(new THREE.BoxGeometry(2.0, 0.55, 1.3), dark), 0, 0.2, 0);
    this.chest = mesh(new THREE.BoxGeometry(2.7, 1.8, 1.7), body);
    add(this.torso, this.chest, 0, 1.4, 0);
    for (let i = 0; i < 3; i++) {
      add(this.torso, mesh(new THREE.BoxGeometry(1.5, 0.1, 0.06), this.glowMat.material, false), 0, 1.0 + i * 0.3, 0.86);
    }
    add(this.torso, mesh(new THREE.BoxGeometry(0.4, 1.4, 0.06), pale), -1.0, 1.4, 0.86);
    add(this.torso, mesh(new THREE.BoxGeometry(0.4, 1.4, 0.06), pale), 1.0, 1.4, 0.86);
    // Abgasrohre auf dem Rücken
    for (const side of [1, -1]) {
      add(this.torso, mesh(new THREE.CylinderGeometry(0.2, 0.24, 1.3, 10), dark), side * 0.75, 2.1, -1.0);
      add(this.torso, mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 10), this.glowMat.material, false), side * 0.75, 2.76, -1.0);
    }

    // Kopf mit Visier und Hörnern
    this.head.position.y = 2.6;
    this.torso.add(this.head);
    add(this.head, mesh(new THREE.BoxGeometry(1.1, 0.7, 1.0), body), 0, 0, 0);
    add(this.head, mesh(new THREE.BoxGeometry(0.85, 0.12, 0.1), this.glowMat.material, false), 0, 0.05, 0.52);
    for (const side of [1, -1]) {
      const horn = add(this.head, mesh(new THREE.ConeGeometry(0.12, 0.75, 6), rust), side * 0.45, 0.6, -0.1);
      horn.rotation.z = -side * 0.35;
    }

    // Schultern mit Stacheln, Arme mit Fäusten
    for (const [side, arm, elbow] of [[1, this.armL, this.elbowL], [-1, this.armR, this.elbowR]] as const) {
      arm.position.set(side * 1.75, 2.2, 0);
      add(arm, mesh(new THREE.SphereGeometry(0.62, 14, 12), body));
      for (let k = 0; k < 3; k++) {
        const spike = add(arm, mesh(new THREE.ConeGeometry(0.1, 0.5, 6), rust), side * (0.15 + k * 0.2), 0.55, (k - 1) * 0.3);
        spike.rotation.z = -side * (0.2 + k * 0.15);
      }
      const upper = new THREE.BoxGeometry(0.75, 1.3, 0.75);
      upper.translate(0, -0.75, 0);
      arm.add(mesh(upper, body));
      elbow.position.y = -1.4;
      const fore = new THREE.BoxGeometry(0.85, 1.1, 0.85);
      fore.translate(0, -0.55, 0);
      elbow.add(mesh(fore, dark));
      add(elbow, mesh(new THREE.BoxGeometry(1.05, 0.85, 1.05), rust), 0, -1.45, 0);
      arm.add(elbow);
      this.torso.add(arm);
    }
  }

  update(dt: number, s: RigInfo) {
    const run = clamp01(s.speed / 4);
    this.phase += dt * s.speed * 1.4;
    const sw = Math.sin(this.phase);
    const p = clamp01(s.progress);
    const idle = s.state === 'idle' ? 1 : 0;

    let lean = 0.05 * run;
    let arms = sw * 0.35 * run;
    let elbow = -0.25;
    let crouch = 0;
    let glow = s.state === 'idle' ? 0.6 : 1.3;

    if (s.state === 'windup') {
      if (s.kind === 'charge') {
        lean = 0.35 * ease(p); // duckt sich zum Anlauf
        arms = lerp(0, 1.3, ease(p));
        crouch = 0.25 * ease(p);
      } else {
        lean = -0.25 * ease(p); // reißt die Arme zum Stampfen hoch
        arms = lerp(0, -2.9, ease(p));
        elbow = lerp(-0.25, -0.5, p);
      }
      glow = 1.3 + 2.7 * p + Math.sin(s.time * 40) * 0.5;
    } else if (s.state === 'attack') {
      if (s.kind === 'charge') {
        lean = 0.55;
        arms = 1.4;
        crouch = 0.15;
        this.phase += dt * 14; // Beine hämmern beim Sturmangriff
      } else {
        lean = lerp(-0.25, 0.4, ease(p * 2));
        arms = lerp(-2.9, 0.5, ease(p * 2.5));
        elbow = -0.1;
      }
      glow = 4;
    } else if (s.state === 'recover') {
      lean = lerp(0.3, 0.05, ease(p));
      arms = lerp(0.4, 0, p);
      glow = 1;
    }
    if (s.phase2) glow += 0.8 + Math.sin(s.time * 6) * 0.3;
    this.glowMat.set(glow);

    this.legL.rotation.x = -sw * 0.45 * run - crouch * 0.6;
    this.legR.rotation.x = sw * 0.45 * run - crouch * 0.6;
    this.torso.position.y = 1.6 - crouch + Math.abs(sw) * 0.06 * run + Math.sin(s.time * 1.2) * 0.02 * idle;
    this.torso.rotation.x = lean;
    this.torso.rotation.z = Math.sin(this.phase) * 0.03 * run;
    this.armL.rotation.x = arms;
    this.armR.rotation.x = s.state === 'idle' || s.state === 'chase' ? -sw * 0.35 * run : arms;
    this.elbowL.rotation.x = elbow;
    this.elbowR.rotation.x = elbow;
    this.head.rotation.y = Math.sin(s.time * 0.6) * 0.35 * idle;
    this.chest.scale.y = 1 + Math.sin(s.time * 1.2) * 0.012;
  }
}
