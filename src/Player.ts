import * as THREE from 'three';
import type { Input } from './Input';
import type { Colliders } from './Colliders';
import type { CameraRig } from './CameraRig';
import type { Enemies } from './Enemies';
import { Combat } from './Combat';
import { Android } from './Android';
import { fx } from './Fx';

const RADIUS = 0.4;
const RUN_SPEED = 7;
const ACCEL = 40;
const AIR_ACCEL = 18;
const GRAVITY = 28;
const JUMP_SPEED = 10;
const MAX_JUMPS = 2;

const DODGE_SPEED = 16;
const DODGE_TIME = 0.22;
const DODGE_COOLDOWN = 0.45;

const MAX_HP = 100;
const HURT_INVULN = 0.7;
const SPAWN = new THREE.Vector3(0, 0, 4);

export class Player {
  readonly mesh: THREE.Group;
  readonly position = SPAWN.clone();
  readonly velocity = new THREE.Vector3();
  readonly maxHp = MAX_HP;
  hp = MAX_HP;
  /** Blickwinkel um Y (0 = +Z) */
  facing = 0;

  /** Wird nach dem Neustart aufgerufen (z. B. um Gegner zurückzusetzen). */
  onRespawn?: () => void;

  private combat: Combat;
  private android: Android;
  private onGround = true;
  private jumpsLeft = MAX_JUMPS;

  private dodgeTimer = 0;
  private dodgeCooldown = 0;
  private dodgeDir = new THREE.Vector3();
  private hurtTimer = 0;

  /** Unverwundbar während des Ausweichens und kurz nach einem Treffer. */
  get invulnerable() {
    return this.dodgeTimer > 0 || this.hurtTimer > 0;
  }

  get dead() {
    return this.hp <= 0;
  }

  constructor(
    scene: THREE.Scene,
    private input: Input,
    private colliders: Colliders,
    private cam: CameraRig,
    targets: Enemies,
  ) {
    this.mesh = new THREE.Group();
    this.android = new Android();
    this.mesh.add(this.android.root);
    scene.add(this.mesh);
    this.android.onStep = () => fx.sound('step');
    this.combat = new Combat(this.android.swordPivot, this, input, targets);
  }

  /** @returns true, wenn der Schaden angenommen wurde */
  takeDamage(amount: number) {
    if (this.dead || this.invulnerable) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.hurtTimer = HURT_INVULN;
    this.combat.cancel();
    fx.shake += 0.25;
    fx.glitch = 1;
    fx.sound('hurt');
    fx.burst(this.position.x, this.position.y + 1, this.position.z, 14, 0xc0392b, 5);
    fx.hitstop = Math.max(fx.hitstop, 0.06);
    return true;
  }

  heal() {
    this.hp = MAX_HP;
  }

  /** Rückstoß in Richtung (dx, dz) (normalisiert). */
  knock(dx: number, dz: number, force: number) {
    this.velocity.x = dx * force;
    this.velocity.z = dz * force;
  }

  private respawn() {
    this.hp = MAX_HP;
    this.position.copy(SPAWN);
    this.velocity.set(0, 0, 0);
    this.hurtTimer = 0;
    this.dodgeTimer = 0;
    this.jumpsLeft = MAX_JUMPS;
    fx.fade = 1;
    this.onRespawn?.();
  }

  update(dt: number) {
    if (import.meta.env.DEV && this.input.debugHurtPressed()) this.takeDamage(15);
    if (this.dead && this.input.restartPressed()) this.respawn();

    const move = this.dead ? { x: 0, y: 0 } : this.input.getMove();
    const yaw = this.cam.yaw;
    // Kamera-relative Richtung (Kamera blickt entlang (-sin, -cos))
    const fx_ = -Math.sin(yaw);
    const fz_ = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const wishX = rx * move.x + fx_ * move.y;
    const wishZ = rz * move.x + fz_ * move.y;
    const hasInput = move.x !== 0 || move.y !== 0;

    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);

    // Nahkampf (Eingabe gilt nur, solange man nicht ausweicht)
    const aim = hasInput ? Math.atan2(wishX, wishZ) : null;
    const moveScale = this.dodgeTimer > 0 ? 1 : this.combat.update(dt, aim);

    // Ausweichen (bricht Angriffe ab)
    if (!this.dead && this.input.dodgePressed() && this.dodgeCooldown === 0 && this.dodgeTimer === 0) {
      this.combat.cancel();
      this.dodgeTimer = DODGE_TIME;
      fx.kick = 1;
      fx.sound('dodge');
      this.dodgeCooldown = DODGE_COOLDOWN;
      if (hasInput) this.dodgeDir.set(wishX, 0, wishZ).normalize();
      else this.dodgeDir.set(Math.sin(this.facing), 0, Math.cos(this.facing)); // nach vorne
      this.velocity.y = Math.max(this.velocity.y, 0);
    }

    if (this.dodgeTimer > 0) {
      this.dodgeTimer -= dt;
      this.velocity.x = this.dodgeDir.x * DODGE_SPEED;
      this.velocity.z = this.dodgeDir.z * DODGE_SPEED;
      this.velocity.y = 0; // kurzer Schwebeflug
    } else {
      // Horizontale Beschleunigung Richtung Wunschgeschwindigkeit
      const accel = (this.onGround ? ACCEL : AIR_ACCEL) * dt;
      const speed = RUN_SPEED * moveScale;
      this.velocity.x = approach(this.velocity.x, wishX * speed, accel);
      this.velocity.z = approach(this.velocity.z, wishZ * speed, accel);

      // Springen (Doppelsprung)
      if (!this.dead && this.input.jumpPressed() && this.jumpsLeft > 0) {
        this.velocity.y = JUMP_SPEED;
        this.jumpsLeft--;
        fx.sound('jump');
        this.onGround = false;
      }
      this.velocity.y -= GRAVITY * dt;
    }

    // Integrieren
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.position.y += this.velocity.y * dt;

    // Kollision
    this.colliders.resolve(this.position, RADIUS, this.position.y);
    const floor = this.colliders.floorAt(this.position.x, this.position.z, this.position.y);
    if (this.position.y <= floor && this.velocity.y <= 0) {
      this.position.y = floor;
      // Harte Landung: Staub und Aufprall
      if (!this.onGround && this.velocity.y < -9) {
        fx.sound('land');
        fx.burst(this.position.x, floor + 0.1, this.position.z, 10, 0xb8b09a, 3.5);
      }
      this.velocity.y = 0;
      this.onGround = true;
      this.jumpsLeft = MAX_JUMPS;
    } else {
      this.onGround = false;
      if (this.jumpsLeft === MAX_JUMPS) this.jumpsLeft = MAX_JUMPS - 1; // von Kante gefallen
    }

    // Blickrichtung zur Bewegung drehen (nicht während eines Angriffs)
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (speed > 0.5 && !this.combat.attacking) {
      const target = Math.atan2(this.velocity.x, this.velocity.z);
      this.facing = lerpAngle(this.facing, target, 1 - Math.exp(-18 * dt));
    }

    this.android.update(dt, {
      speed,
      grounded: this.onGround,
      vy: this.velocity.y,
      dodging: this.dodgeTimer > 0,
      attacking: this.combat.attacking,
      dead: this.dead,
    });
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.facing;
    // Beim Ausweichen nach vorn kippen, bei Niederlage hinfallen
    this.mesh.rotation.x = this.dead ? -1.45 : this.dodgeTimer > 0 ? 0.5 : 0;
    // Nach einem Treffer blinken
    this.mesh.visible = this.hurtTimer <= 0 || Math.floor(this.hurtTimer * 20) % 2 === 0;
  }
}

function approach(v: number, target: number, step: number) {
  if (v < target) return Math.min(v + step, target);
  return Math.max(v - step, target);
}

function lerpAngle(a: number, b: number, t: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
