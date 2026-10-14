import * as THREE from 'three';
import type { Input } from './Input';
import type { Colliders } from './Colliders';
import type { CameraRig } from './CameraRig';

const RADIUS = 0.4;
const HEIGHT = 1.8;
const RUN_SPEED = 7;
const ACCEL = 40;
const AIR_ACCEL = 18;
const GRAVITY = 28;
const JUMP_SPEED = 10;
const MAX_JUMPS = 2;

const DODGE_SPEED = 16;
const DODGE_TIME = 0.22;
const DODGE_COOLDOWN = 0.45;

export class Player {
  readonly mesh: THREE.Group;
  readonly position = new THREE.Vector3(0, 0, 4);

  private velocity = new THREE.Vector3();
  private onGround = true;
  private jumpsLeft = MAX_JUMPS;
  private facing = 0;

  private dodgeTimer = 0;
  private dodgeCooldown = 0;
  private dodgeDir = new THREE.Vector3();

  /** Unverwundbar während des Ausweichens (für den Kampf in Phase 3). */
  get invulnerable() {
    return this.dodgeTimer > 0;
  }

  constructor(
    scene: THREE.Scene,
    private input: Input,
    private colliders: Colliders,
    private cam: CameraRig,
  ) {
    this.mesh = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(RADIUS, HEIGHT - RADIUS * 2, 6, 12),
      new THREE.MeshStandardMaterial({ color: 0x2b2923, roughness: 0.6 }),
    );
    body.position.y = HEIGHT / 2;
    body.castShadow = true;

    // Heller "Visor"-Streifen, damit man die Blickrichtung (+Z lokal) sieht
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.1, 0.2),
      new THREE.MeshBasicMaterial({ color: 0xf2ecd8 }),
    );
    visor.position.set(0, HEIGHT - 0.35, RADIUS - 0.05);

    this.mesh.add(body, visor);
    scene.add(this.mesh);
  }

  update(dt: number) {
    const move = this.input.getMove();
    const yaw = this.cam.yaw;
    // Kamera-relative Richtung (Kamera blickt entlang (-sin, -cos))
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const wishX = rx * move.x + fx * move.y;
    const wishZ = rz * move.x + fz * move.y;
    const hasInput = move.x !== 0 || move.y !== 0;

    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);

    // Ausweichen
    if (this.input.dodgePressed() && this.dodgeCooldown === 0 && this.dodgeTimer === 0) {
      this.dodgeTimer = DODGE_TIME;
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
      this.velocity.x = approach(this.velocity.x, wishX * RUN_SPEED, accel);
      this.velocity.z = approach(this.velocity.z, wishZ * RUN_SPEED, accel);

      // Springen (Doppelsprung)
      if (this.input.jumpPressed() && this.jumpsLeft > 0) {
        this.velocity.y = JUMP_SPEED;
        this.jumpsLeft--;
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
      this.velocity.y = 0;
      this.onGround = true;
      this.jumpsLeft = MAX_JUMPS;
    } else {
      this.onGround = false;
      if (this.jumpsLeft === MAX_JUMPS) this.jumpsLeft = MAX_JUMPS - 1; // von Kante gefallen
    }

    // Blickrichtung zur Bewegung drehen
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (speed > 0.5) {
      const target = Math.atan2(this.velocity.x, this.velocity.z);
      this.facing = lerpAngle(this.facing, target, 1 - Math.exp(-18 * dt));
    }

    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.facing;
    // Beim Ausweichen leicht nach vorn kippen
    this.mesh.rotation.x = this.dodgeTimer > 0 ? 0.5 : 0;
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
