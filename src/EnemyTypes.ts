import * as THREE from 'three';
import { Enemy, type EnemyContext } from './Enemy';
import { fx } from './Fx';

const eyeMat = () => new THREE.MeshBasicMaterial({ color: 0xc0392b });

function cast(...objs: THREE.Object3D[]) {
  for (const o of objs) o.castShadow = true;
}

/** Nahkämpfer: läuft heran, holt aus, springt vor. Sprung über ihn hinweg weicht aus. */
export class Walker extends Enemy {
  private hitDone = false;

  constructor(scene: THREE.Scene, home: THREE.Vector3) {
    super(scene, home, {
      maxHp: 40, radius: 0.6, height: 1.9, color: 0x6e6a5c, aggro: 12,
      staggerAt: 10, staggerTime: 0.45, knockResist: 1, respawn: 12,
    });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 1.4, 12), this.mat);
    body.position.y = 0.7;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 12), this.mat);
    head.position.y = 1.6;
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.1), eyeMat());
    eye.position.set(0, 1.62, 0.32);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.9), this.mat);
    arm.position.set(0.6, 1.0, 0.35);
    cast(body, head, arm);
    this.group.add(body, head, eye, arm);
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

  constructor(scene: THREE.Scene, home: THREE.Vector3) {
    super(scene, home, {
      maxHp: 30, radius: 0.5, height: 2.3, color: 0x5f6a66, aggro: 18,
      staggerAt: 10, staggerTime: 0.5, knockResist: 1.2, respawn: 14,
    });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 1.7, 10), this.mat);
    body.position.y = 0.85;
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12), this.mat);
    orb.position.y = 1.95;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), eyeMat());
    eye.position.set(0, 1.97, 0.32);
    cast(body, orb);
    this.group.add(body, orb, eye);
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

  constructor(scene: THREE.Scene, home: THREE.Vector3) {
    super(scene, home, {
      maxHp: 240, radius: 1.5, height: 4.2, color: 0x4f4b40, aggro: 22,
      staggerAt: Infinity, staggerTime: 0, knockResist: 0.1, respawn: Infinity,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.8, 2.0), this.mat);
    body.position.y = 1.8;
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.9, 1.2), this.mat);
    head.position.y = 3.65;
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.14, 0.1), eyeMat());
    eye.position.set(0, 3.7, 0.62);
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.2, 0.8), this.mat);
    armL.position.set(-1.7, 1.6, 0.2);
    const armR = armL.clone();
    armR.position.x = 1.7;
    cast(body, head, armL, armR);
    this.group.add(body, head, eye, armL, armR);

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
