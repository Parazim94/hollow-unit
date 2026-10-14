import * as THREE from 'three';

const DEATH_TIME = 0.5;
const RESPAWN_TIME = 4;
const FLASH_TIME = 0.12;

/** Trainingspuppe (Platzhalter für die Gegner aus Phase 4). */
export class Target {
  readonly position: THREE.Vector3;
  readonly radius = 0.65;
  readonly height = 2.1;
  readonly maxHp = 50;
  hp = this.maxHp;
  alive = true;

  private group = new THREE.Group();
  private mat = new THREE.MeshStandardMaterial({ color: 0x6e6a5c, roughness: 0.5, metalness: 0.4 });
  private vel = new THREE.Vector3();
  private flash = 0;
  private deathT = 0;
  private respawnT = 0;

  constructor(
    scene: THREE.Scene,
    private home: THREE.Vector3,
  ) {
    this.position = home.clone();

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 1.5, 12), this.mat);
    body.position.y = 0.75;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 12), this.mat);
    head.position.y = 1.8;
    const eye = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.08, 0.1),
      new THREE.MeshBasicMaterial({ color: 0xc0392b }),
    );
    eye.position.set(0, 1.82, 0.34);
    for (const m of [body, head]) m.castShadow = true;

    this.group.add(body, head, eye);
    this.group.position.copy(this.position);
    scene.add(this.group);
  }

  takeHit(damage: number, dir: THREE.Vector3, knock: number) {
    if (!this.alive) return;
    this.hp -= damage;
    this.flash = FLASH_TIME;
    this.vel.set(dir.x * knock, 0, dir.z * knock);
    if (this.hp <= 0) {
      this.alive = false;
      this.deathT = DEATH_TIME;
      this.respawnT = RESPAWN_TIME;
    }
  }

  update(dt: number) {
    if (this.alive) {
      this.position.addScaledVector(this.vel, dt);
      this.vel.multiplyScalar(Math.exp(-10 * dt));
    } else {
      this.respawnT -= dt;
      if (this.deathT > 0) this.deathT = Math.max(0, this.deathT - dt);
      if (this.respawnT <= 0) this.respawn();
    }

    this.flash = Math.max(0, this.flash - dt);
    this.mat.emissive.setScalar(this.flash / FLASH_TIME);

    // Sterbeanimation: schrumpfen und einsinken
    const k = this.alive ? 1 : this.deathT / DEATH_TIME;
    this.group.visible = k > 0;
    this.group.scale.set(1, Math.max(k, 0.001), 1);
    this.group.position.copy(this.position);
  }

  private respawn() {
    this.alive = true;
    this.hp = this.maxHp;
    this.position.copy(this.home);
    this.vel.set(0, 0, 0);
  }
}

export class Targets {
  readonly list: Target[] = [];

  constructor(scene: THREE.Scene, spots: Array<[number, number]>) {
    for (const [x, z] of spots) this.list.push(new Target(scene, new THREE.Vector3(x, 0, z)));
  }

  update(dt: number) {
    for (const t of this.list) t.update(dt);
  }
}
