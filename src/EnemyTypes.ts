import * as THREE from 'three';
import { Enemy, type EnemyContext } from './Enemy';
import { fx } from './Fx';
import { BossRig, ShooterRig, WalkerRig } from './EnemyModels';

/** Nahkämpfer: läuft heran, holt aus, springt vor. Sprung über ihn hinweg weicht aus. */
export class Walker extends Enemy {
  private hitDone = false;
  private rig: WalkerRig;

  constructor(scene: THREE.Scene, home: THREE.Vector3) {
    super(scene, home, {
      maxHp: 40, radius: 0.6, height: 1.9, color: 0x6e6a5c, aggro: 12,
      staggerAt: 10, staggerTime: 0.45, knockResist: 1, respawn: 12,
    });
    this.rig = new WalkerRig(this.mat);
    this.group.add(this.rig.root);
  }

  protected animate(dt: number) {
    const dur = { windup: 0.5, attack: 0.2, recover: 0.8, stagger: 0.45 }[this.state as string] ?? 1;
    this.rig.update(dt, {
      speed: Math.min(this.speed, 6),
      time: this.animT,
      state: this.state,
      progress: 1 - Math.max(0, this.t) / dur,
    });
  }

  protected think(dt: number, ctx: EnemyContext) {
    const p = this.toPlayer(ctx);
    switch (this.state) {
      case 'idle':
        if (p.dist < this.cfg.aggro) {
          this.aggro = true;
          this.state = 'chase';
        }
        break;
      case 'chase':
        this.turnTo(p.angle, dt, 10);
        if (p.dist > this.radius + 1.2) {
          this.walk(p.dx, p.dz, 3.6, dt);
        } else {
          this.state = 'windup';
          this.t = 0.5;
        }
        break;
      case 'windup':
        this.turnTo(p.angle, dt, 3);
        this.t -= dt;
        if (this.t <= 0) {
          this.state = 'attack';
          this.t = 0.2;
          this.hitDone = false;
          this.push.x += Math.sin(this.facing) * 10;
          this.push.z += Math.cos(this.facing) * 10;
        }
        break;
      case 'attack':
        this.t -= dt;
        if (!this.hitDone && p.dist < this.radius + 1.5 && ctx.player.position.y < 1.2) {
          if (ctx.player.takeDamage(12)) {
            ctx.player.knock(p.dx / p.dist, p.dz / p.dist, 7);
            this.hitDone = true;
          }
        }
        if (this.t <= 0) {
          this.state = 'recover';
          this.t = 0.8;
        }
        break;
      case 'recover':
        this.t -= dt;
        if (this.t <= 0) this.state = 'chase';
        break;
    }
  }
}

/** Fernkämpfer: hält Abstand, umkreist den Spieler und schießt Dreierserien. */
export class Shooter extends Enemy {
  private strafe = 1;
  private strafeT = 3;
  private shootT = 1.5;
  private shots = 0;
  private rig: ShooterRig;

  constructor(scene: THREE.Scene, home: THREE.Vector3) {
    super(scene, home, {
      maxHp: 30, radius: 0.5, height: 2.3, color: 0x5f6a66, aggro: 18,
      staggerAt: 10, staggerTime: 0.5, knockResist: 1.2, respawn: 14,
    });
    this.rig = new ShooterRig(this.mat);
    this.group.add(this.rig.root);
  }

  protected animate(dt: number) {
    const dur = { windup: 0.7, attack: 0.5, recover: 0.6, stagger: 0.5 }[this.state as string] ?? 1;
    this.rig.update(dt, {
      speed: Math.min(this.speed, 6),
      time: this.animT,
      state: this.state,
      progress: 1 - Math.max(0, this.t) / dur,
    });
  }

  protected think(dt: number, ctx: EnemyContext) {
    const p = this.toPlayer(ctx);
    switch (this.state) {
      case 'idle':
        if (p.dist < this.cfg.aggro) {
          this.aggro = true;
          this.state = 'chase';
        }
        break;
      case 'chase': {
        this.turnTo(p.angle, dt, 8);
        if (p.dist < 7) this.walk(-p.dx, -p.dz, 3.8, dt);
        else if (p.dist > 12) this.walk(p.dx, p.dz, 3.2, dt);
        else this.walk(-p.dz * this.strafe, p.dx * this.strafe, 2.5, dt);

        this.strafeT -= dt;
        if (this.strafeT <= 0) {
          this.strafe = -this.strafe;
          this.strafeT = 2.5 + Math.random() * 1.5;
        }
        this.shootT -= dt;
        if (this.shootT <= 0 && p.dist < 22) {
          this.state = 'windup';
          this.t = 0.7;
        }
        break;
      }
      case 'windup':
        this.turnTo(p.angle, dt, 12);
        this.t -= dt;
        if (this.t <= 0) {
          this.state = 'attack';
          this.shots = 3;
          this.t = 0;
        }
        break;
      case 'attack':
        this.t -= dt;
        if (this.t <= 0 && this.shots > 0) {
          this.fire(ctx);
          this.shots--;
          this.t = 0.16;
        }
        if (this.shots === 0) {
          this.state = 'recover';
          this.t = 0.6;
        }
        break;
      case 'recover':
        this.t -= dt;
        if (this.t <= 0) {
          this.state = 'chase';
          this.shootT = 2 + Math.random() * 1.2;
        }
        break;
    }
  }

  private fire(ctx: EnemyContext) {
    const origin = new THREE.Vector3(
      this.position.x + Math.sin(this.facing) * 0.5,
      1.9,
      this.position.z + Math.cos(this.facing) * 0.5,
    );
    const target = ctx.player.position.clone().setY(ctx.player.position.y + 1);
    const dir = target.sub(origin).normalize();
    this.rig.kick();
    ctx.bullets.spawn(origin, dir.multiplyScalar(13), 8);
  }
}

const SLAM_RADIUS = 4.5;
const RING_TIME = 0.45;

/** Mini-Boss: Stampfen (Schockwelle, überspringbar) und Sturmangriff. Ab 50 % HP aggressiver. */
export class Boss extends Enemy {
  private kind: 'slam' | 'charge' = 'slam';
  private cooldown = 1.5;
  private phase2 = false;
  private hitDone = false;
  private chargeDir = new THREE.Vector2();
  private ring: THREE.Mesh;
  private ringT = 0;
  private rig: BossRig;

  constructor(scene: THREE.Scene, home: THREE.Vector3) {
    super(scene, home, {
      maxHp: 240, radius: 1.5, height: 4.2, color: 0x4f4b40, aggro: 22,
      staggerAt: Infinity, staggerTime: 0, knockResist: 0.1, respawn: Infinity,
    });
    this.rig = new BossRig(this.mat);
    this.group.add(this.rig.root);

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1, 48),
      new THREE.MeshBasicMaterial({ color: 0xd9482b, transparent: true, side: THREE.DoubleSide }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    scene.add(this.ring);
  }

  update(dt: number, ctx: EnemyContext) {
    super.update(dt, ctx);
    if (this.ringT > 0) {
      this.ringT = Math.max(0, this.ringT - dt);
      const k = 1 - this.ringT / RING_TIME;
      this.ring.scale.setScalar(Math.max(0.01, SLAM_RADIUS * k));
      (this.ring.material as THREE.MeshBasicMaterial).opacity = 1 - k;
      this.ring.visible = this.ringT > 0;
    }
  }

  protected animate(dt: number) {
    const dur =
      this.state === 'windup' ? (this.kind === 'slam' ? 0.9 : 0.7)
      : this.state === 'attack' ? (this.kind === 'slam' ? 0.3 : 0.55)
      : this.state === 'recover' ? 1.0
      : 1;
    this.rig.update(dt, {
      speed: Math.min(this.speed, 6),
      time: this.animT,
      state: this.state,
      progress: 1 - Math.max(0, this.t) / dur,
      phase2: this.phase2,
      kind: this.kind,
    });
  }

  protected onReset() {
    this.phase2 = false;
    this.cooldown = 1.5;
    this.ring.visible = false;
    this.ringT = 0;
  }

  protected think(dt: number, ctx: EnemyContext) {
    const p = this.toPlayer(ctx);

    if (!this.phase2 && this.hp <= this.maxHp / 2) {
      this.phase2 = true;
      this.mat.color.setHex(0x5e3d36);
    }

    switch (this.state) {
      case 'idle':
        if (p.dist < this.cfg.aggro) {
          this.aggro = true;
          this.state = 'chase';
        }
        break;
      case 'chase':
        this.turnTo(p.angle, dt, 2.5);
        if (p.dist > this.radius + 2.5) this.walk(p.dx, p.dz, this.phase2 ? 4.2 : 3, dt);
        this.cooldown -= dt;
        if (this.cooldown <= 0) {
          this.kind = p.dist > 7 ? 'charge' : 'slam';
          this.state = 'windup';
          this.t = this.kind === 'slam' ? 0.9 : 0.7;
        }
        break;
      case 'windup':
        // Der Sturmangriff verfolgt das Ziel nur bis kurz vor dem Start
        if (this.kind === 'charge' && this.t > 0.2) this.turnTo(p.angle, dt, 4);
        this.t -= dt;
        if (this.t <= 0) this.beginAttack(ctx, p);
        break;
      case 'attack':
        this.t -= dt;
        if (this.kind === 'charge') this.chargeStep(dt, ctx, p);
        if (this.t <= 0) {
          this.state = 'recover';
          this.t = 1.0;
        }
        break;
      case 'recover':
        this.t -= dt;
        if (this.t <= 0) {
          this.state = 'chase';
          this.cooldown = this.phase2 ? 1.0 : 1.8;
        }
        break;
    }
  }

  private beginAttack(ctx: EnemyContext, p: { dx: number; dz: number; dist: number }) {
    this.state = 'attack';
    this.hitDone = false;
    if (this.kind === 'slam') {
      this.t = 0.3;
      this.ring.position.set(this.position.x, 0.05, this.position.z);
      this.ring.visible = true;
      this.ringT = RING_TIME;
      fx.sound('slam');
      fx.shake += 0.35;
      fx.burst(this.position.x, 0.2, this.position.z, 28, 0xb8b09a, 9);
      if (p.dist < SLAM_RADIUS && ctx.player.position.y < 1.0) {
        if (ctx.player.takeDamage(25)) ctx.player.knock(p.dx / (p.dist || 1), p.dz / (p.dist || 1), 10);
      }
      if (this.phase2) {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const origin = new THREE.Vector3(this.position.x, 1.0, this.position.z);
          ctx.bullets.spawn(origin, new THREE.Vector3(Math.sin(a) * 9, 0, Math.cos(a) * 9), 10, 3);
        }
      }
    } else {
      this.t = 0.55;
      this.chargeDir.set(Math.sin(this.facing), Math.cos(this.facing));
    }
  }

  private chargeStep(dt: number, ctx: EnemyContext, p: { dx: number; dz: number; dist: number }) {
    this.position.x += this.chargeDir.x * 15 * dt;
    this.position.z += this.chargeDir.y * 15 * dt;
    if (!this.hitDone && p.dist < this.radius + 1.0 && ctx.player.position.y < 1.5) {
      if (ctx.player.takeDamage(20)) {
        ctx.player.knock(this.chargeDir.x, this.chargeDir.y, 12);
        this.hitDone = true;
      }
    }
  }
}
