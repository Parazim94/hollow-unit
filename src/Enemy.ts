import * as THREE from 'three';
import type { Player } from './Player';
import type { Colliders } from './Colliders';
import { fx } from './Fx';

export interface EnemyContext {
  scene: THREE.Scene;
  player: Player;
  colliders: Colliders;
  bullets: EnemyBullets;
  enemies: Enemy[];
}

/** Projektile der Gegner. Ausweichen (Unverwundbarkeit) lässt sie durchfliegen. */
export class EnemyBullets {
  private list: Array<{ mesh: THREE.Mesh; vel: THREE.Vector3; life: number; damage: number }> = [];
  private geo = new THREE.SphereGeometry(0.2, 8, 6);
  private mat = new THREE.MeshBasicMaterial({ color: 0xd9482b });

  constructor(private scene: THREE.Scene) {}

  spawn(pos: THREE.Vector3, vel: THREE.Vector3, damage: number, life = 4) {
    const mesh = new THREE.Mesh(this.geo, this.mat);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.list.push({ mesh, vel, life, damage });
  }

  clear() {
    for (const b of this.list) this.scene.remove(b.mesh);
    this.list.length = 0;
  }

  update(dt: number, player: Player, colliders: Colliders) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      b.life -= dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      const p = b.mesh.position;

      let remove = b.life <= 0 || p.y < 0 || colliders.blocks(p.x, p.y, p.z);
      if (!remove && !player.dead) {
        const dx = p.x - player.position.x;
        const dz = p.z - player.position.z;
        const dy = p.y - (player.position.y + 0.9);
        if (dx * dx + dz * dz < 0.55 * 0.55 && Math.abs(dy) < 1.0) {
          if (player.takeDamage(b.damage)) {
            const len = Math.hypot(b.vel.x, b.vel.z) || 1;
            player.knock(b.vel.x / len, b.vel.z / len, 4);
            remove = true;
          }
        }
      }
      if (remove) {
        this.scene.remove(b.mesh);
        this.list.splice(i, 1);
      }
    }
  }
}

export type EnemyState = 'idle' | 'chase' | 'windup' | 'attack' | 'recover' | 'stagger';

export interface EnemyConfig {
  maxHp: number;
  radius: number;
  height: number;
  color: number;
  /** Entfernung, ab der der Gegner den Spieler bemerkt */
  aggro: number;
  /** Mindestschaden, der den Gegner taumeln lässt */
  staggerAt: number;
  staggerTime: number;
  /** Faktor auf den Rückstoß (1 = voll) */
  knockResist: number;
  /** Sekunden bis zum Respawn (Infinity = nie) */
  respawn: number;
}

const FLASH_TIME = 0.12;
const DEATH_TIME = 0.5;

export abstract class Enemy {
  readonly position: THREE.Vector3;
  readonly radius: number;
  readonly height: number;
  readonly maxHp: number;
  hp: number;
  alive = true;
  aggro = false;

  protected state: EnemyState = 'idle';
  protected t = 0;
  protected facing = 0;
  protected group = new THREE.Group();
  protected mat: THREE.MeshStandardMaterial;
  protected push = new THREE.Vector3();

  private flash = 0;
  private clock = 0;
  private deathT = 0;
  private respawnT = 0;

  constructor(
    protected scene: THREE.Scene,
    private home: THREE.Vector3,
    protected cfg: EnemyConfig,
  ) {
    this.position = home.clone();
    this.radius = cfg.radius;
    this.height = cfg.height;
    this.maxHp = this.hp = cfg.maxHp;
    this.mat = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.5, metalness: 0.4 });
    this.group.position.copy(this.position);
    scene.add(this.group);
  }

  /** Wird von Nahkampf und Pod aufgerufen. */
  takeHit(damage: number, dir: THREE.Vector3, knock: number) {
    if (!this.alive) return;
    this.hp -= damage;
    this.flash = FLASH_TIME;
    this.push.x += dir.x * knock * this.cfg.knockResist;
    this.push.z += dir.z * knock * this.cfg.knockResist;
    if (!this.aggro) {
      this.aggro = true;
      this.state = 'chase';
    }
    if (this.hp <= 0) {
      this.alive = false;
      this.deathT = DEATH_TIME;
      this.respawnT = this.cfg.respawn;
      fx.sound('kill');
      fx.burst(this.position.x, this.position.y + this.height / 2, this.position.z, 30, 0xc0392b, 7);
      this.onDeath();
    } else if (damage >= this.cfg.staggerAt) {
      this.state = 'stagger';
      this.t = this.cfg.staggerTime;
    }
  }

  reset() {
    this.alive = true;
    this.aggro = false;
    this.hp = this.maxHp;
    this.state = 'idle';
    this.position.copy(this.home);
    this.push.set(0, 0, 0);
    this.mat.color.setHex(this.cfg.color);
    this.onReset();
  }

  update(dt: number, ctx: EnemyContext) {
    this.clock += dt;
    const prevState = this.state;
    this.flash = Math.max(0, this.flash - dt);

    if (!this.alive) {
      this.deathT = Math.max(0, this.deathT - dt);
      this.respawnT -= dt;
      if (this.respawnT <= 0) this.reset();
      this.syncVisuals();
      return;
    }

    if (ctx.player.dead) {
      this.state = 'idle';
      this.aggro = false;
    } else if (this.state === 'stagger') {
      this.t -= dt;
      if (this.t <= 0) this.state = 'chase';
    } else {
      this.think(dt, ctx);
    }

    if (this.state === 'windup' && prevState !== 'windup') fx.sound('warn');

    // Rückstoß und Sprünge nach vorn
    this.position.addScaledVector(this.push, dt);
    this.push.multiplyScalar(Math.exp(-8 * dt));

    // Nicht ineinander laufen
    for (const o of ctx.enemies) {
      if (o === this || !o.alive) continue;
      const dx = this.position.x - o.position.x;
      const dz = this.position.z - o.position.z;
      const d = Math.hypot(dx, dz);
      const min = this.radius + o.radius;
      if (d < min && d > 0.001) {
        const k = (min - d) / 2 / d;
        this.position.x += dx * k;
        this.position.z += dz * k;
      }
    }
    ctx.colliders.resolve(this.position, this.radius, 0);
    this.syncVisuals();
  }

  protected abstract think(dt: number, ctx: EnemyContext): void;
  protected onDeath() {}
  protected onReset() {}

  protected toPlayer(ctx: EnemyContext) {
    const dx = ctx.player.position.x - this.position.x;
    const dz = ctx.player.position.z - this.position.z;
    return { dx, dz, dist: Math.hypot(dx, dz), angle: Math.atan2(dx, dz) };
  }

  protected turnTo(angle: number, dt: number, rate: number) {
    let d = (angle - this.facing) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    this.facing += d * (1 - Math.exp(-rate * dt));
  }

  protected walk(dx: number, dz: number, speed: number, dt: number) {
    const len = Math.hypot(dx, dz);
    if (len < 0.0001) return;
    this.position.x += (dx / len) * speed * dt;
    this.position.z += (dz / len) * speed * dt;
  }

  private syncVisuals() {
    // Vor einem Angriff pulsiert der Gegner rot, bei Treffern blitzt er weiß
    const tele = this.state === 'windup' && this.alive ? 0.35 + 0.35 * Math.sin(this.clock * 28) : 0;
    const f = this.flash / FLASH_TIME;
    this.mat.emissive.setRGB(Math.max(f, tele), f, f);

    const k = this.alive ? 1 : this.deathT / DEATH_TIME;
    this.group.visible = k > 0;
    this.group.scale.set(1, Math.max(k, 0.001), 1);
    this.group.position.copy(this.position);
    this.group.rotation.y = this.facing;
  }
}
