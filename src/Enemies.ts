import * as THREE from 'three';
import type { Colliders } from './Colliders';
import type { Player } from './Player';
import { Enemy, EnemyBullets } from './Enemy';
import { Boss, Shooter, Walker } from './EnemyTypes';

const v = (x: number, z: number) => new THREE.Vector3(x, 0, z);

export class Enemies {
  readonly list: Enemy[] = [];
  readonly boss: Boss;
  private bullets: EnemyBullets;

  constructor(
    private scene: THREE.Scene,
    private colliders: Colliders,
  ) {
    this.bullets = new EnemyBullets(scene);
    for (const [x, z] of [[0, -9], [-6, -7], [6, -7]]) this.list.push(new Walker(scene, v(x, z)));
    for (const [x, z] of [[-11, -14], [11, -14]]) this.list.push(new Shooter(scene, v(x, z)));
    this.boss = new Boss(scene, v(0, -28));
    this.list.push(this.boss);
  }

  update(dt: number, player: Player) {
    const ctx = {
      scene: this.scene,
      player,
      colliders: this.colliders,
      bullets: this.bullets,
      enemies: this.list,
    };
    for (const e of this.list) e.update(dt, ctx);
    this.bullets.update(dt, player, this.colliders);
  }

  /** Alles auf Anfang (nach dem Tod des Spielers). */
  reset() {
    for (const e of this.list) e.reset();
    this.bullets.clear();
  }
}
