import * as THREE from 'three';
import type { Input } from './Input';
import type { Player } from './Player';
import type { CameraRig } from './CameraRig';
import type { Enemies } from './Enemies';
import { fx } from './Fx';

const FIRE_INTERVAL = 0.14;
const BULLET_SPEED = 45;
const BULLET_LIFE = 1.2;
const BULLET_RADIUS = 0.15;
const DAMAGE = 4;
const AIM_DISTANCE = 40;

interface Bullet {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
}

/** Schwebender Begleiter, der in Blickrichtung der Kamera schießt. */
export class Pod {
  private mesh = new THREE.Group();
  private bullets: Bullet[] = [];
  private bulletGeo = new THREE.SphereGeometry(BULLET_RADIUS, 8, 6);
  private bulletMat = new THREE.MeshBasicMaterial({ color: 0xfff4dc });
  private cooldown = 0;
  private home = new THREE.Vector3();
  private tmp = new THREE.Vector3();

  constructor(
    private scene: THREE.Scene,
    private player: Player,
    private cam: CameraRig,
    private input: Input,
    private targets: Enemies,
  ) {
    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.3, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xcfc8b0, roughness: 0.4, metalness: 0.5 }),
    );
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.08, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x2b2923 }),
    );
    const lens = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.1, 0.06),
      new THREE.MeshBasicMaterial({ color: 0xc0392b }),
    );
    lens.position.z = 0.27;
    shell.castShadow = true;
    this.mesh.add(shell, band, lens);
    this.mesh.position.set(1, 2.5, 4);
    scene.add(this.mesh);
  }

  update(dt: number, t: number) {
    // Position: rechts hinter dem Spieler (relativ zur Kamera), leicht schwebend
    const yaw = this.cam.yaw;
    const p = this.player.position;
    this.home.set(
      p.x + Math.cos(yaw) * 1.2 + Math.sin(yaw) * 0.8,
      p.y + 2.3 + Math.sin(t * 2.2) * 0.08,
      p.z - Math.sin(yaw) * 1.2 + Math.cos(yaw) * 0.8,
    );
    this.mesh.position.lerp(this.home, 1 - Math.exp(-8 * dt));

    // Zielpunkt entlang des Kamerablicks
    const camera = this.cam.camera;
    const dir = camera.getWorldDirection(this.tmp);
    const aim = camera.position.clone().addScaledVector(dir, AIM_DISTANCE);
    const shotDir = aim.sub(this.mesh.position).normalize();
    this.mesh.lookAt(this.mesh.position.clone().add(shotDir));

    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.input.podHeld() && !this.player.dead && this.cooldown === 0) {
      this.fire(shotDir);
      this.cooldown = FIRE_INTERVAL;
    }

    this.updateBullets(dt);
  }

  private fire(dir: THREE.Vector3) {
    const mesh = new THREE.Mesh(this.bulletGeo, this.bulletMat);
    mesh.position.copy(this.mesh.position).addScaledVector(dir, 0.4);
    this.scene.add(mesh);
    fx.sound('shoot');
    this.bullets.push({ mesh, vel: dir.clone().multiplyScalar(BULLET_SPEED), life: BULLET_LIFE });
  }

  private updateBullets(dt: number) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.life -= dt;
      b.mesh.position.addScaledVector(b.vel, dt);

      let remove = b.life <= 0 || b.mesh.position.y < 0;
      if (!remove) {
        const bp = b.mesh.position;
        for (const target of this.targets.list) {
          if (!target.alive) continue;
          const dx = bp.x - target.position.x;
          const dz = bp.z - target.position.z;
          if (Math.hypot(dx, dz) < target.radius + BULLET_RADIUS && bp.y < target.height) {
            const dir = b.vel.clone().setY(0).normalize();
            target.takeHit(DAMAGE, dir, 1.5);
            fx.shake += 0.02;
            fx.burst(bp.x, bp.y, bp.z, 4, 0xfff4dc, 3);
            remove = true;
            break;
          }
        }
      }
      if (remove) {
        this.scene.remove(b.mesh);
        this.bullets.splice(i, 1);
      }
    }
  }
}
