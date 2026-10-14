import * as THREE from 'three';
import type { Colliders } from './Colliders';
import type { Rand } from './rng';
import { facadeTexture } from './Textures';

export interface Footprint {
  x: number;
  z: number;
  halfW: number;
  halfD: number;
  rot: number;
}

const WALLS = ['#a39b86', '#948d79', '#b0a894'];

function inside(list: Footprint[], x: number, z: number, margin: number) {
  return list.some((f) => Math.abs(x - f.x) < f.halfW + margin && Math.abs(z - f.z) < f.halfD + margin);
}

/** Zerfallene Hochhäuser links und rechts der Straße, mit abgebrochenen Dächern und Efeu. */
export function createBuildings(scene: THREE.Scene, colliders: Colliders, rand: Rand): Footprint[] {
  const footprints: Footprint[] = [];
  const bases = WALLS.map((w, i) => facadeTexture(101 + i * 7, w));
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x77725f, roughness: 1 });
  const clumps: Array<[number, number, number, number]> = []; // x, y, z, Größe

  for (const side of [-1, 1]) {
    let zCursor = 36;
    for (let n = 0; n < 9; n++) {
      const halfW = 4 + rand() * 3.5;
      const halfD = 5 + rand() * 4;
      const h = 24 + rand() * 34;
      const x = side * (15 + halfW + rand() * 5);
      const z = zCursor - halfD;
      const rot = (rand() - 0.5) * 0.12;
      zCursor = z - halfD - 3 - rand() * 6;

      // Abgebrochene Dachkante: Welle plus diagonal weggebrochene Ecke
      const geo = new THREE.BoxGeometry(halfW * 2, h, halfD * 2, 6, 1, 6);
      const pos = geo.attributes.position;
      const seed = rand() * 10;
      const cx = rand() > 0.5 ? 1 : -1;
      const cz = rand() > 0.5 ? 1 : -1;
      for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) < h / 2 - 0.01) continue;
        const px = pos.getX(i);
        const pz = pos.getZ(i);
        const wave = Math.abs(Math.sin(px * 0.9 + seed) * Math.cos(pz * 0.7 + seed * 1.3)) * 6;
        const chunk = Math.max(0, px * cx + pz * cz - halfW * 0.25) * 2.2;
        pos.setY(i, h / 2 - wave - chunk);
      }
      geo.computeVertexNormals();

      // Pro Seitenpaar eine eigene Textur mit passender Wiederholung
      const base = bases[Math.floor(rand() * bases.length)];
      const faceMat = (faceWidth: number) => {
        const t = base.clone();
        t.needsUpdate = true;
        t.repeat.set(Math.max(1, Math.round(faceWidth / 8)), Math.max(1, Math.round(h / 12)));
        t.offset.set(rand(), 0);
        return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
      };
      const matX = faceMat(halfD * 2);
      const matZ = faceMat(halfW * 2);
      const mesh = new THREE.Mesh(geo, [matX, matX, roofMat, roofMat, matZ, matZ]);
      mesh.position.set(x, h / 2, z);
      mesh.rotation.y = rot;
      mesh.castShadow = mesh.receiveShadow = true;
      scene.add(mesh);

      footprints.push({ x, z, halfW, halfD, rot });
      colliders.add({ x, z, halfW, halfD, rot, height: h - 8 });

      // Efeu an der Straßenseite und der Vorderseite, Büsche am Fuß
      const faceX = x - side * halfW - side * 0.15;
      for (let i = 0; i < 38; i++) {
        clumps.push([faceX, 0.4 + rand() * h * 0.5 * rand(), z + (rand() * 2 - 1) * halfD, 0.7 + rand() * 1.1]);
      }
      for (let i = 0; i < 16; i++) {
        clumps.push([x + (rand() * 2 - 1) * halfW, 0.3 + rand() * h * 0.3 * rand(), z + halfD + 0.15, 0.6 + rand() * 1.0]);
      }
    }
  }

  // Alle Efeu-Büschel in einer InstancedMesh
  const palette = [0x6f7a4a, 0x5f6b3f, 0x838a55, 0x8f8c5e].map((c) => new THREE.Color(c));
  const vines = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }),
    clumps.length,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  clumps.forEach(([x, y, z, s], i) => {
    e.set(rand() * 3, rand() * 3, rand() * 3);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s * 1.2, s * 0.8, s * 1.2));
    vines.setMatrixAt(i, m);
    vines.setColorAt(i, palette[Math.floor(rand() * palette.length)]);
  });
  vines.castShadow = true;
  scene.add(vines);

  return footprints;
}

/** Verrostete Autos am Straßenrand. Als Hindernisse mit Kollision. */
export function createCars(scene: THREE.Scene, colliders: Colliders) {
  const colors = [0x8a6a4e, 0x7d8a8c, 0x9c9378, 0x7a6e60];
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2822, roughness: 0.9 });
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 14);
  wheelGeo.rotateZ(Math.PI / 2);

  const spots: Array<[number, number, number]> = [
    [3.6, 16, 0.15], [-3.9, 26, -0.1], [3.4, -18, 0.6], [-3.6, -40, 0.1], [4.2, -34, -0.3], [-4, -13, 0.25], [3.8, 34, 0.05],
  ];
  spots.forEach(([x, z, rot], i) => {
    const color = colors[i % colors.length];
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.25 });
    const car = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.62, 4.3), bodyMat);
    body.position.y = 0.62;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.55, 2.2), bodyMat);
    cabin.position.set(0, 1.2, -0.25);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.67, 0.34, 2.24), dark);
    glass.position.set(0, 1.22, -0.25);
    car.add(body, glass, cabin);
    for (const wx of [-0.95, 0.95]) {
      for (const wz of [-1.4, 1.4]) {
        const wheel = new THREE.Mesh(wheelGeo, dark);
        wheel.position.set(wx, 0.38, wz);
        car.add(wheel);
      }
    }
    car.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    car.position.set(x, 0, z);
    car.rotation.y = rot;
    scene.add(car);
    colliders.add({ x, z, halfW: 1, halfD: 2.2, rot, height: 1.5 });
  });
}

/** Schiefe, abgeknickte Laternenmasten entlang der Straße. */
export function createLamps(scene: THREE.Scene, rand: Rand) {
  const metal = new THREE.MeshStandardMaterial({ color: 0x55524a, roughness: 0.6, metalness: 0.5 });
  const zs = [22, 8, -6, -22, -38, -52];
  zs.forEach((z, i) => {
    const side = i % 2 === 0 ? 1 : -1;
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 7, 8), metal);
    pole.position.y = 3.5;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.08), metal);
    arm.position.set(-side * 0.8, 6.9, 0);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.25), metal);
    head.position.set(-side * 1.6, 6.85, 0);
    g.add(pole, arm, head);
    g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    g.position.set(side * 6.2, 0, z);
    g.rotation.z = side * (0.06 + rand() * 0.16);
    scene.add(g);
  });
}

/** Schutthaufen und schiefe Betonplatten abseits der Straße. */
export function createDebris(
  scene: THREE.Scene,
  colliders: Colliders,
  rand: Rand,
  footprints: Footprint[],
  avoid: Array<[number, number]>,
) {
  const mats = [0x8c8571, 0x9a9482, 0x7f7966].map(
    (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1, flatShading: true }),
  );
  const rock = new THREE.IcosahedronGeometry(1, 0);
  const slabGeo = new THREE.BoxGeometry(4, 0.35, 2.6);
  const rebarMat = new THREE.MeshStandardMaterial({ color: 0x6b4a36, roughness: 0.7, metalness: 0.4 });

  let placed = 0;
  let tries = 0;
  while (placed < 26 && tries++ < 300) {
    const side = rand() > 0.5 ? 1 : -1;
    const x = side * (7 + rand() * 24);
    const z = 32 - rand() * 90;
    if (inside(footprints, x, z, 2)) continue;
    if (avoid.some(([ax, az]) => Math.hypot(ax - x, az - z) < 4)) continue;
    placed++;

    if (rand() < 0.6) {
      // Schutthaufen
      const g = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const r = 0.5 + rand() * 0.8;
        const m = new THREE.Mesh(rock, mats[Math.floor(rand() * mats.length)]);
        m.scale.set(r * 1.2, r * 0.8, r * 1.1);
        m.position.set((rand() - 0.5) * 1.8, r * 0.5, (rand() - 0.5) * 1.8);
        m.rotation.set(rand() * 3, rand() * 3, rand() * 3);
        m.castShadow = m.receiveShadow = true;
        g.add(m);
      }
      g.position.set(x, 0, z);
      scene.add(g);
      colliders.add({ x, z, halfW: 1.3, halfD: 1.3, rot: 0, height: 1.0 });
    } else {
      // Plattenstapel, leicht schräg, mit Bewehrungsstäben
      const slab = new THREE.Mesh(slabGeo, mats[0]);
      const rot = rand() * Math.PI;
      slab.position.set(x, 0.18, z);
      slab.rotation.set((rand() - 0.5) * 0.1, rot, (rand() - 0.5) * 0.1);
      slab.castShadow = slab.receiveShadow = true;
      scene.add(slab);
      for (let i = 0; i < 4; i++) {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1 + rand(), 5), rebarMat);
        bar.position.set(x + (rand() - 0.5) * 3, 0.9, z + (rand() - 0.5) * 2);
        bar.rotation.set((rand() - 0.5) * 0.6, 0, (rand() - 0.5) * 0.6);
        scene.add(bar);
      }
      colliders.add({ x, z, halfW: 2, halfD: 1.3, rot, height: 0.6 });
    }
  }
}

/** Ring aus Hochhaus-Silhouetten am Horizont, die im Nebel verschwimmen. */
export function createSkyline(scene: THREE.Scene, rand: Rand) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x8d8873, roughness: 1 });
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2 + rand() * 0.15;
    const r = 105 + rand() * 25;
    const w = 10 + rand() * 14;
    const h = 28 + rand() * 50;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * (0.6 + rand() * 0.8)), mat);
    m.position.set(Math.cos(a) * r, h / 2 - 2, -12 + Math.sin(a) * r);
    m.rotation.y = rand() * Math.PI;
    scene.add(m);
  }
}

/** Stillgelegtes Riesenrad in der Ferne, dreht sich ganz langsam. */
export function createFerrisWheel(scene: THREE.Scene) {
  const frame = new THREE.MeshStandardMaterial({ color: 0x7a7667, roughness: 0.8, metalness: 0.3 });
  const gondolaColors = [0xb97c6b, 0xcfc8b0, 0x8f9a8a, 0xc6a86a].map(
    (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }),
  );
  const R = 17;
  const group = new THREE.Group();
  const wheel = new THREE.Group();
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(R, 0.35, 8, 48), frame));
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(R * 0.55, 0.2, 6, 36), frame));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, R, 5), frame);
    spoke.position.set(Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5, 0);
    spoke.rotation.z = a + Math.PI / 2;
    wheel.add(spoke);
    // Gondeln hängen immer senkrecht: Gegenrotation in update()
    const gondola = new THREE.Mesh(new THREE.BoxGeometry(2, 1.6, 1.6), gondolaColors[i % gondolaColors.length]);
    gondola.position.set(Math.cos(a) * R, Math.sin(a) * R - 1.1, 0);
    gondola.userData.angle = a;
    gondola.userData.radius = R;
    wheel.add(gondola);
  }
  wheel.position.y = 20;
  group.add(wheel);
  // A-förmige Stützen
  for (const dz of [-1.8, 1.8]) {
    for (const dx of [-8, 8]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 22, 6), frame);
      leg.position.set(dx / 2, 10, dz);
      leg.rotation.z = -Math.sign(dx) * 0.38;
      group.add(leg);
    }
  }
  group.position.set(30, 0, -78);
  group.rotation.y = -0.5;
  scene.add(group);

  const gondolas = wheel.children.filter((c) => c.userData.radius);
  return {
    update(dt: number) {
      wheel.rotation.z += dt * 0.025;
      // Gondeln nach der Drehung wieder aufrichten, damit sie senkrecht hängen
      for (const g of gondolas) {
        const rz = wheel.rotation.z;
        g.rotation.z = -rz;
        // Aufhängepunkt im Rad, die Kabine hängt in Weltrichtung "unten" daran
        g.position.set(
          Math.cos(g.userData.angle) * R - 1.1 * Math.sin(rz),
          Math.sin(g.userData.angle) * R - 1.1 * Math.cos(rz),
          0,
        );
      }
    },
  };
}
