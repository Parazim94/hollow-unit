import * as THREE from 'three';
import { Colliders } from './Colliders';

// Entsättigte NieR-Palette
const PALETTE = {
  sky: 0xd4cdb6,
  ground: 0xb8b09a,
  ruin: 0x8c8571,
  dark: 0x4a463c,
};

export function createWorld(scene: THREE.Scene) {
  const colliders = new Colliders();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.sky, 20, 70);

  // Licht
  scene.add(new THREE.HemisphereLight(0xf2ecd8, 0x6b6552, 1.1));
  const sun = new THREE.DirectionalLight(0xfff4dc, 2.2);
  sun.position.set(12, 20, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 60 });
  scene.add(sun);

  // Boden
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: PALETTE.ground, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Raster als Orientierungshilfe
  const grid = new THREE.GridHelper(200, 100, PALETTE.dark, PALETTE.ruin);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.25;
  grid.position.y = 0.01;
  scene.add(grid);

  // Ruinen aus Primitiven (deterministisch, damit die Szene immer gleich aussieht)
  const ruinMat = new THREE.MeshStandardMaterial({ color: PALETTE.ruin, roughness: 0.95 });
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 30; i++) {
    const w = 1 + rand() * 3;
    const h = 1 + rand() * 7;
    const d = 1 + rand() * 3;
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), ruinMat);
    const angle = rand() * Math.PI * 2;
    const radius = 8 + rand() * 30;
    box.position.set(Math.cos(angle) * radius, h / 2, Math.sin(angle) * radius);
    box.rotation.y = rand() * Math.PI;
    box.castShadow = box.receiveShadow = true;
    scene.add(box);
    colliders.add({ x: box.position.x, z: box.position.z, halfW: w / 2, halfD: d / 2, rot: box.rotation.y, height: h });
  }

  return { colliders };
}
