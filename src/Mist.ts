import * as THREE from 'three';
import { mistTexture } from './Textures';

const SIZE = 220;
const TILES = 6;

/** Flache Nebelschichten knapp über dem Boden. Sie bleiben in der Welt verankert und treiben langsam. */
export function createMist(scene: THREE.Scene) {
  const base = mistTexture();
  const layers = [0.3, 0.8, 1.5, 2.6].map((h, i) => {
    const tex = base.clone();
    tex.needsUpdate = true;
    tex.repeat.set(TILES, TILES);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(SIZE, SIZE),
      new THREE.MeshBasicMaterial({
        map: tex,
        color: 0xe6dfc9,
        transparent: true,
        opacity: 0.13 - i * 0.03,
        depthWrite: false,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = h;
    mesh.renderOrder = 2;
    scene.add(mesh);
    return { tex, mesh, drift: [0.004 + i * 0.002, 0.002 + i * 0.0015] };
  });

  return {
    update(t: number, focus: THREE.Vector3) {
      for (const l of layers) {
        l.mesh.position.x = focus.x;
        l.mesh.position.z = focus.z;
        // Verankerung: Plane folgt dem Spieler, die Textur läuft gegen
        l.tex.offset.x = (focus.x / SIZE) * TILES + t * l.drift[0];
        l.tex.offset.y = -(focus.z / SIZE) * TILES + t * l.drift[1];
      }
    },
  };
}
