import * as THREE from 'three';

const COLOR = {
  black: 0x1d1c1a,
  grey: 0x4a4740,
  trim: 0xd8d2c0,
  hair: 0xece8dc,
  skin: 0xdcd2c2,
  red: 0x8a3a2e,
};

const mat = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.15, ...extra });

/** Zustand, den der Spieler jedes Frame an die Animation übergibt. */
export interface AndroidState {
  /** horizontale Geschwindigkeit in m/s */
  speed: number;
  grounded: boolean;
  vy: number;
  dodging: boolean;
  attacking: boolean;
  dead: boolean;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Eigenes Charakter-Design: schwarzes Kleid, weißer Bob, Visier, Stiefel.
 * Gegliedert (Hüfte, Beine, Torso, Arme, Kopf), alle Animationen laufen prozedural.
 * Der rechte Arm samt Schwert hängt am `swordPivot`, den der Nahkampf steuert.
 */
export class Android {
  readonly root = new THREE.Group();
  readonly swordPivot = new THREE.Group();

  private hips = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private hair = new THREE.Group();
  private skirt = new THREE.Group();
  private thighL = new THREE.Group();
  private thighR = new THREE.Group();
  private kneeL = new THREE.Group();
  private kneeR = new THREE.Group();
  private armL = new THREE.Group();
  private elbowL = new THREE.Group();

  private phase = 0;
  private time = 0;
  private run = 0;
  private air = 0;
  private dodge = 0;
  private atk = 0;

  constructor() {
    const black = mat(COLOR.black);
    const grey = mat(COLOR.grey, { metalness: 0.4 });
    const trim = mat(COLOR.trim, { roughness: 0.7 });
    const skin = mat(COLOR.skin, { roughness: 0.8, metalness: 0 });
    const hairM = mat(COLOR.hair, { roughness: 0.7, metalness: 0, side: THREE.DoubleSide });
    const dress = mat(COLOR.black, { side: THREE.DoubleSide, roughness: 0.7 });

    // Hilfsfunktion: Zylinder, der vom Gelenk nach unten hängt
    const limb = (r0: number, r1: number, len: number, m: THREE.Material) => {
      const g = new THREE.CylinderGeometry(r0, r1, len, 12);
      g.translate(0, -len / 2, 0);
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = true;
      return mesh;
    };

    this.hips.position.y = 0.92;
    this.root.add(this.hips);

    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.2), black);
    pelvis.castShadow = true;
    this.hips.add(pelvis);

    // --- Beine ---
    for (const [side, thigh, knee] of [
      [1, this.thighL, this.kneeL],
      [-1, this.thighR, this.kneeR],
    ] as const) {
      thigh.position.set(side * 0.1, -0.04, 0);
      thigh.add(limb(0.085, 0.065, 0.46, black));
      knee.position.y = -0.46;
      const boot = limb(0.068, 0.052, 0.44, grey);
      knee.add(boot);
      // Fuß mit Absatz
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.06, 0.25), black);
      foot.position.set(0, -0.44, 0.07);
      const heel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.05), mat(COLOR.red));
      heel.position.set(0, -0.455, -0.07);
      foot.castShadow = true;
      knee.add(foot, heel);
      thigh.add(knee);
      this.hips.add(thigh);
    }

    // --- Rock ---
    const skirtGeo = new THREE.CylinderGeometry(0.16, 0.36, 0.5, 28, 1, true);
    skirtGeo.translate(0, -0.25, 0);
    const skirtMesh = new THREE.Mesh(skirtGeo, dress);
    skirtMesh.castShadow = true;
    const hemGeo = new THREE.CylinderGeometry(0.363, 0.368, 0.025, 28, 1, true);
    hemGeo.translate(0, -0.5, 0);
    const hem = new THREE.Mesh(hemGeo, mat(COLOR.trim, { side: THREE.DoubleSide, roughness: 0.7 }));
    this.skirt.add(skirtMesh, hem);
    this.skirt.position.y = 0.04;
    this.hips.add(this.skirt);

    // --- Oberkörper ---
    this.torso.position.y = 0.08;
    this.hips.add(this.torso);

    const waistGeo = new THREE.CylinderGeometry(0.125, 0.145, 0.2, 18);
    waistGeo.translate(0, 0.1, 0);
    const waist = new THREE.Mesh(waistGeo, grey);
    waist.scale.z = 0.75;
    const chestGeo = new THREE.CylinderGeometry(0.15, 0.125, 0.3, 18);
    chestGeo.translate(0, 0.35, 0);
    const chest = new THREE.Mesh(chestGeo, black);
    chest.scale.z = 0.78;
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.22), trim);
    belt.position.y = 0.2;
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.035, 0.14), trim);
    collar.position.y = 0.51;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.042, 0.1, 10), skin);
    neck.position.y = 0.55;
    for (const m of [waist, chest]) m.castShadow = true;
    this.torso.add(waist, chest, belt, collar, neck);

    // Schulterplatten
    for (const side of [1, -1]) {
      const pauldron = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), black);
      pauldron.position.set(side * 0.2, 0.46, 0);
      pauldron.scale.set(1, 0.8, 1);
      this.torso.add(pauldron);
    }

    // Linker Arm (frei beweglich)
    this.armL.position.set(0.2, 0.46, 0);
    this.armL.add(limb(0.05, 0.042, 0.26, black));
    this.elbowL.position.y = -0.26;
    this.elbowL.add(limb(0.042, 0.036, 0.25, black));
    const handL = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 8), skin);
    handL.position.y = -0.27;
    this.elbowL.add(handL);
    this.armL.add(this.elbowL);
    this.torso.add(this.armL);

    // --- Kopf ---
    this.head.position.y = 0.67;
    this.torso.add(this.head);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.108, 20, 16), skin);
    face.scale.y = 1.08;
    face.castShadow = true;
    // Visier über den Augen
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.235, 0.05, 0.19), black);
    visor.position.set(0, 0.012, 0.045);
    const visorLine = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.006, 0.01),
      new THREE.MeshBasicMaterial({ color: COLOR.trim }),
    );
    visorLine.position.set(0, 0.012, 0.142);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.008, 0.01), mat(COLOR.red));
    mouth.position.set(0, -0.055, 0.1);
    this.head.add(face, visor, visorLine, mouth);

    // Weißer Bob
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.128, 24, 16), hairM);
    cap.scale.set(1.08, 1.02, 1.12);
    cap.position.set(0, 0.025, -0.012);
    const bobGeo = new THREE.CylinderGeometry(0.142, 0.158, 0.15, 24, 1, true);
    const bob = new THREE.Mesh(bobGeo, hairM);
    bob.position.set(0, -0.045, -0.015);
    bob.scale.z = 1.05;
    const bangs = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.045, 0.05), hairM);
    bangs.position.set(0, 0.075, 0.1);
    bangs.rotation.x = -0.25;
    for (const side of [1, -1]) {
      const strand = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.15, 0.05), hairM);
      strand.position.set(side * 0.138, -0.06, 0.06);
      this.hair.add(strand);
    }
    cap.castShadow = true;
    this.hair.add(cap, bob, bangs);
    this.head.add(this.hair);

    // --- Schwertarm (Pivot wird von Combat gesteuert) ---
    this.swordPivot.position.set(-0.2, 1.46, 0);
    this.swordPivot.rotation.order = 'YXZ';
    const armGeo = new THREE.CylinderGeometry(0.045, 0.038, 0.5, 10);
    armGeo.rotateX(Math.PI / 2);
    armGeo.translate(0, 0, 0.25);
    const arm = new THREE.Mesh(armGeo, black);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), skin);
    hand.position.z = 0.52;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.025, 0.035), grey);
    guard.position.z = 0.6;
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.022, 1.0),
      new THREE.MeshStandardMaterial({ color: 0xf2ecd8, emissive: 0x6f6a58, roughness: 0.25, metalness: 0.7 }),
    );
    blade.position.z = 1.1;
    arm.castShadow = blade.castShadow = true;
    this.swordPivot.add(arm, hand, guard, blade);
    this.root.add(this.swordPivot);
  }

  update(dt: number, s: AndroidState) {
    const k = (rate: number) => 1 - Math.exp(-rate * dt);
    this.time += dt;

    const runT = s.grounded && !s.dodging && !s.dead ? Math.min(s.speed / 7, 1) : 0;
    this.run += (runT - this.run) * k(12);
    this.air += ((!s.grounded && !s.dodging && !s.dead ? 1 : 0) - this.air) * k(14);
    this.dodge += ((s.dodging ? 1 : 0) - this.dodge) * k(25);
    this.atk += ((s.attacking && !s.dead ? 1 : 0) - this.atk) * k(20);
    this.phase += dt * this.run * 11;

    const run = this.run;
    const sp = Math.sin(this.phase);
    const sq = Math.sin(this.phase + Math.PI);

    // Laufen
    let thL = -sp * 0.85 * run;
    let thR = -sq * 0.85 * run;
    let knL = Math.max(0, Math.sin(this.phase + 1.3)) * 1.1 * run;
    let knR = Math.max(0, Math.sin(this.phase + Math.PI + 1.3)) * 1.1 * run;
    let arm = sp * 0.7 * run + 0.05;
    let elbow = -0.2 - 0.4 * run;

    // Luft: steigend = Knie hoch, fallend = Beine strecken
    const up = THREE.MathUtils.clamp(s.vy / 10, -1, 1) * 0.5 + 0.5;
    thL = lerp(thL, lerp(-0.3, -0.95, up), this.air);
    knL = lerp(knL, lerp(0.3, 1.2, up), this.air);
    thR = lerp(thR, lerp(0.25, 0.2, up), this.air);
    knR = lerp(knR, lerp(0.35, 0.6, up), this.air);
    arm = lerp(arm, lerp(-0.4, -1.0, up), this.air);

    // Ausweichen: Beine nach hinten, Arm zurück
    thL = lerp(thL, 0.8, this.dodge);
    thR = lerp(thR, 0.55, this.dodge);
    knL = lerp(knL, 0.4, this.dodge);
    knR = lerp(knR, 0.7, this.dodge);
    arm = lerp(arm, 1.1, this.dodge);

    // Angriff: breiter Stand
    thL = lerp(thL, -0.5, this.atk);
    thR = lerp(thR, 0.45, this.atk);
    knL = lerp(knL, 0.4, this.atk);
    knR = lerp(knR, 0.3, this.atk);
    arm = lerp(arm, -0.4, this.atk);

    // Atmen im Stand
    const idle = 1 - Math.max(run, this.air, this.dodge, this.atk);
    const breathe = Math.sin(this.time * 1.8) * idle;

    this.thighL.rotation.x = thL;
    this.thighR.rotation.x = thR;
    this.kneeL.rotation.x = knL;
    this.kneeR.rotation.x = knR;
    this.armL.rotation.x = arm + breathe * 0.03;
    this.armL.rotation.z = -0.08 - this.air * 0.4;
    this.elbowL.rotation.x = lerp(elbow, -0.5, this.atk);

    // Hüfte senkt sich bei gespreizten Beinen, damit die Füße am Boden bleiben
    this.hips.position.y = 0.93 - 0.12 * run * Math.abs(sp) - 0.05 * this.atk - 0.02 * breathe;

    this.torso.rotation.x = 0.18 * run + 0.1 * this.atk;
    this.torso.rotation.y = this.atk * this.swordPivot.rotation.y * 0.3;
    this.head.rotation.x = -0.1 * run + breathe * 0.02;

    // Rock weht gegen die Laufrichtung, flattert in der Luft
    this.skirt.rotation.x = 0.08 + 0.4 * run + Math.sin(this.phase * 2) * 0.05 * run + this.dodge * 0.5;
    const flare = 1 + this.air * 0.14 + run * 0.05;
    this.skirt.scale.set(flare, 1 - this.air * 0.06, flare);

    // Haar schwingt nach hinten
    this.hair.rotation.x = 0.16 * run + this.air * 0.22 + this.dodge * 0.3 + Math.sin(this.time * 1.7) * 0.02;
  }
}
