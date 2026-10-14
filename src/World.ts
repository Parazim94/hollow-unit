import * as THREE from 'three';
import { Colliders } from './Colliders';
import { rng } from './rng';
import { groundTexture, roadTexture } from './Textures';
import { createSky, FOG_COLOR, SUN_DIR } from './Sky';
import { createBuildings, createCars, createDebris, createFerrisWheel, createLamps, createSkyline } from './Props';
import { createGrass, createTrees } from './Foliage';
import { createMist } from './Mist';

/** Orte, die frei bleiben sollen (Gegner-Spawns, Terminal, Start). */
const AVOID: Array<[number, number]> = [
  [0, -9], [-6, -7], [6, -7], [-11, -14], [11, -14], [0, -28], [-3, 5], [0, 4],
];

/** Verfallene, überwucherte Stadt: Straße, Hochhaus-Ruinen, Autos, Gras, Bäume, Himmel. */
export function createWorld(scene: THREE.Scene) {
  const colliders = new Colliders();
  const rand = rng(7);

  scene.fog = new THREE.Fog(FOG_COLOR, 28, 135);
  const sky = createSky(scene);

  // Licht: tiefe, warme Sonne und kühles Himmelslicht
  scene.add(new THREE.HemisphereLight(0xf2ecd8, 0x6b6552, 1.0));
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -35, right: 35, top: 35, bottom: -35, near: 1, far: 120 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  // Kühles Gegenlicht aus der Gegenrichtung: trennt die schwarze Figur vom Hintergrund
  // und hellt die Schattenseiten leicht auf
  const rim = new THREE.DirectionalLight(0xbfd0e0, 0.55);
  scene.add(rim, rim.target);
  const rimOffset = new THREE.Vector3(-SUN_DIR.x, 0.35, -SUN_DIR.z).normalize().multiplyScalar(40);
  const sunOffset = SUN_DIR.clone().multiplyScalar(60);

  // Boden: Beton mit Moos und Rissen
  const gTex = groundTexture();
  gTex.repeat.set(80, 80);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ map: gTex, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Straße, die zum Boss führt
  const rTex = roadTexture();
  rTex.repeat.set(1, 19);
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 190),
    new THREE.MeshStandardMaterial({ map: rTex, roughness: 0.95 }),
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.02, -25);
  road.receiveShadow = true;
  scene.add(road);

  const footprints = createBuildings(scene, colliders, rand);
  createCars(scene, colliders);
  createLamps(scene, rand);
  createDebris(scene, colliders, rand, footprints, AVOID);
  createTrees(scene, colliders, rand, footprints, AVOID);
  createSkyline(scene, rand);
  const grass = createGrass(scene, rand, footprints);
  const wheel = createFerrisWheel(scene);
  const mist = createMist(scene);

  return {
    colliders,
    /** Pro Frame: Himmel, Gras und Riesenrad animieren, Sonne und Schatten dem Spieler folgen lassen. */
    update(dt: number, t: number, focus: THREE.Vector3) {
      sky.update(t, focus);
      grass.update(t);
      mist.update(t, focus);
      wheel.update(dt);
      sun.target.position.set(focus.x, 0, focus.z);
      sun.position.copy(sun.target.position).add(sunOffset);
      rim.target.position.set(focus.x, 1, focus.z);
      rim.position.copy(rim.target.position).add(rimOffset);
    },
  };
}
