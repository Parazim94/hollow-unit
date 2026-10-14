import * as THREE from 'three';

const MAX = 500;
const GRAVITY = 12;

/** Funken und Staub als eine einzige InstancedMesh (ein Draw-Call). */
export class Particles {
  private mesh: THREE.InstancedMesh;
  private pos = new Float32Array(MAX * 3);
  private vel = new Float32Array(MAX * 3);
  private life = new Float32Array(MAX);
  private maxLife = new Float32Array(MAX);
  private size = new Float32Array(MAX);
  private next = 0;
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
      MAX,
    );
    this.mesh.frustumCulled = false;
    // Alle Instanzen unsichtbar starten
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    for (let i = 0; i < MAX; i++) {
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, this.color.set(0xffffff));
    }
    scene.add(this.mesh);
  }

  burst(x: number, y: number, z: number, count: number, color: number, speed: number) {
    this.color.set(color);
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      // Zufällige Richtung, leicht nach oben verzerrt
      const a = Math.random() * Math.PI * 2;
      const u = Math.random() * 2 - 1;
      const r = Math.sqrt(1 - u * u);
      const s = speed * (0.4 + Math.random() * 0.6);
      this.pos.set([x, y, z], i * 3);
      this.vel.set([Math.cos(a) * r * s, Math.abs(u) * s * 0.8 + s * 0.2, Math.sin(a) * r * s], i * 3);
      this.maxLife[i] = this.life[i] = 0.35 + Math.random() * 0.4;
      this.size[i] = 0.05 + Math.random() * 0.08;
      this.mesh.setColorAt(i, this.color);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number) {
    const d = this.dummy;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const i3 = i * 3;
      this.vel[i3 + 1] -= GRAVITY * dt;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < 0.02) {
        this.pos[i3 + 1] = 0.02;
        this.vel[i3 + 1] *= -0.3;
        this.vel[i3] *= 0.7;
        this.vel[i3 + 2] *= 0.7;
      }
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      d.position.set(this.pos[i3], this.pos[i3 + 1], this.pos[i3 + 2]);
      d.scale.setScalar(this.size[i] * k);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Schwebende Staubkörner um den Spieler für Atmosphäre. */
export class Dust {
  private points: THREE.Points;
  private pos: Float32Array;
  private seed: Float32Array;
  private static readonly COUNT = 220;
  private static readonly SIZE = new THREE.Vector3(50, 14, 50);

  constructor(scene: THREE.Scene) {
    const n = Dust.COUNT;
    this.pos = new Float32Array(n * 3);
    this.seed = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) this.seed[i] = Math.random();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xf2ecd8, size: 0.09, transparent: true, opacity: 0.55, depthWrite: false,
      }),
    );
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  update(t: number, center: THREE.Vector3) {
    const S = Dust.SIZE;
    for (let i = 0; i < Dust.COUNT; i++) {
      const i3 = i * 3;
      // Langsam treibende Körner, die um den Spieler herum umgebrochen werden
      const wx = this.seed[i3] * S.x + t * 0.25 * (0.5 + this.seed[i3 + 1]);
      const wy = this.seed[i3 + 1] * S.y + Math.sin(t * 0.3 + this.seed[i3 + 2] * 20) * 0.5;
      const wz = this.seed[i3 + 2] * S.z + t * 0.12;
      this.pos[i3] = center.x + wrap(wx - center.x, S.x);
      this.pos[i3 + 1] = wrap(wy, S.y) + S.y / 2; // 0..14 m über dem Boden
      this.pos[i3 + 2] = center.z + wrap(wz - center.z, S.z);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

/** Bringt v in den Bereich [-size/2, size/2). */
function wrap(v: number, size: number) {
  return ((((v + size / 2) % size) + size) % size) - size / 2;
}
