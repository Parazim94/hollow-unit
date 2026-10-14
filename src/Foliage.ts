import * as THREE from 'three';
import type { Colliders } from './Colliders';
import type { Rand } from './rng';
import type { Footprint } from './Props';

function inside(list: Footprint[], x: number, z: number, margin: number) {
  return list.some((f) => Math.abs(x - f.x) < f.halfW + margin && Math.abs(z - f.z) < f.halfD + margin);
}

/** Gras in Büscheln, das sich im Wind wiegt, dazu kleine helle Blumen. */
export function createGrass(scene: THREE.Scene, rand: Rand, footprints: Footprint[]) {
  // Halm: schmales Dreieck, am Fuß dunkel, an der Spitze hell
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [-0.075, 0, 0, 0.075, 0, 0, -0.05, 0.3, 0.02, 0.05, 0.3, 0.02, 0, 0.62, 0.08],
      3,
    ),
  );
  geo.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(
      [0.4, 0.4, 0.36, 0.4, 0.4, 0.36, 0.75, 0.75, 0.66, 0.75, 0.75, 0.66, 1, 1, 0.9],
      3,
    ),
  );
  geo.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
  geo.computeVertexNormals();

  const time = { value: 0 };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      /* glsl */ `
        vec3 transformed = vec3(position);
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.27;
          transformed.x += sin(uTime * 1.6 + ph) * 0.2 * position.y * position.y;
          transformed.z += cos(uTime * 1.3 + ph) * 0.1 * position.y * position.y;
        #endif`,
    );
  };

  const palette = [0x8a8f62, 0x98986a, 0xa5a177, 0x7a8456, 0xb0aa80].map((c) => new THREE.Color(c));
  const blades: THREE.Matrix4[] = [];
  const bladeColors: THREE.Color[] = [];
  const flowers: Array<[number, number, number, THREE.Color]> = [];
  const flowerPalette = [0xf0e6c8, 0xe8d58a, 0xe3b8b0, 0xd9d4e6].map((c) => new THREE.Color(c));

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let clump = 0; clump < 1000; clump++) {
    const cx = (rand() * 2 - 1) * 75;
    const cz = 45 - rand() * 125;
    // Die Straße bleibt weitgehend frei, nur vereinzeltes Unkraut
    if (Math.abs(cx) < 5.3 && rand() > 0.12) continue;
    if (inside(footprints, cx, cz, 1.5)) continue;
    const count = 16 + Math.floor(rand() * 20);
    const color = palette[Math.floor(rand() * palette.length)];
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * 1.7;
      const s = 0.55 + rand() * 0.9;
      e.set((rand() - 0.5) * 0.3, rand() * Math.PI * 2, (rand() - 0.5) * 0.3);
      q.setFromEuler(e);
      m.compose(
        new THREE.Vector3(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r),
        q,
        new THREE.Vector3(s * 1.2, s * (0.7 + rand() * 0.9), s),
      );
      blades.push(m.clone());
      bladeColors.push(color);
    }
    if (rand() < 0.45) {
      flowers.push([cx + (rand() - 0.5) * 2, 0.35 + rand() * 0.3, cz + (rand() - 0.5) * 2, flowerPalette[Math.floor(rand() * flowerPalette.length)]]);
    }
  }

  const grass = new THREE.InstancedMesh(geo, mat, blades.length);
  blades.forEach((mm, i) => {
    grass.setMatrixAt(i, mm);
    grass.setColorAt(i, bladeColors[i]);
  });
  grass.frustumCulled = false;
  scene.add(grass);

  const flowerMesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.07, 0),
    new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true }),
    flowers.length,
  );
  flowers.forEach(([x, y, z, c], i) => {
    m.makeTranslation(x, y, z);
    flowerMesh.setMatrixAt(i, m);
    flowerMesh.setColorAt(i, c);
  });
  scene.add(flowerMesh);

  return {
    update(t: number) {
      time.value = t;
    },
  };
}

/** Verwilderte Bäume am Rand der Straße. */
export function createTrees(
  scene: THREE.Scene,
  colliders: Colliders,
  rand: Rand,
  footprints: Footprint[],
  avoid: Array<[number, number]>,
) {
  const bark = new THREE.MeshStandardMaterial({ color: 0x5b4f40, roughness: 1 });
  const leafMats = [0x8c9166, 0x9c9a74, 0x7d8660].map(
    (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1, flatShading: true }),
  );
  const blob = new THREE.IcosahedronGeometry(1, 1);

  for (let i = 0; i < 14; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const x = side * (10 + rand() * 5);
    const z = 30 - i * 7 - rand() * 3;
    if (inside(footprints, x, z, 1)) continue;
    if (avoid.some(([ax, az]) => Math.hypot(ax - x, az - z) < 3)) continue;

    const h = 3.5 + rand() * 2.2;
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.32, h, 7), bark);
    trunk.position.y = h / 2;
    trunk.castShadow = true;
    tree.add(trunk);
    for (let k = 0; k < 3 + Math.floor(rand() * 2); k++) {
      const s = 0.9 + rand() * 0.8;
      const crown = new THREE.Mesh(blob, leafMats[Math.floor(rand() * leafMats.length)]);
      crown.scale.set(s * 1.2, s * 0.85, s * 1.2);
      crown.position.set((rand() - 0.5) * 1.6, h - 0.3 + rand() * 1.0, (rand() - 0.5) * 1.6);
      crown.castShadow = true;
      tree.add(crown);
    }
    tree.position.set(x, 0, z);
    tree.rotation.set((rand() - 0.5) * 0.12, rand() * 3, (rand() - 0.5) * 0.12);
    scene.add(tree);
    colliders.add({ x, z, halfW: 0.3, halfD: 0.3, rot: 0, height: h });
  }
}
