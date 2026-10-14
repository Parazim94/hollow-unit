import * as THREE from 'three';
import type { Input } from './Input';
import type { Player } from './Player';
import type { Enemies } from './Enemies';
import { fx } from './Fx';

interface AttackDef {
  duration: number;
  hitStart: number;
  hitEnd: number;
  damage: number;
  reach: number;
  /** Gesamtwinkel des Trefferbereichs in Radiant */
  arc: number;
  lunge: number;
  knock: number;
  hitstop: number;
  shake: number;
  moveScale: number;
  yaw: [number, number];
  pitch: [number, number];
}

const LIGHT: AttackDef[] = [
  { duration: 0.36, hitStart: 0.08, hitEnd: 0.2, damage: 10, reach: 2.6, arc: 2.2, lunge: 5, knock: 4, hitstop: 0.05, shake: 0.08, moveScale: 0.25, yaw: [1.5, -1.3], pitch: [-0.15, -0.15] },
  { duration: 0.36, hitStart: 0.08, hitEnd: 0.2, damage: 10, reach: 2.6, arc: 2.2, lunge: 5, knock: 4, hitstop: 0.05, shake: 0.08, moveScale: 0.25, yaw: [-1.3, 1.5], pitch: [-0.15, -0.15] },
  { duration: 0.52, hitStart: 0.15, hitEnd: 0.3, damage: 18, reach: 3.0, arc: 2.6, lunge: 7, knock: 8, hitstop: 0.09, shake: 0.18, moveScale: 0.2, yaw: [0, 0], pitch: [-2.2, 0.9] },
];

const HEAVY: AttackDef = {
  duration: 0.8, hitStart: 0.35, hitEnd: 0.52, damage: 30, reach: 3.4, arc: 3.2, lunge: 3, knock: 12, hitstop: 0.12, shake: 0.3, moveScale: 0.1, yaw: [2.0, -2.0], pitch: [-0.1, -0.1],
};

const COMBO_WINDOW = 0.4;
/** Ab diesem Anteil der Angriffsdauer wird der nächste Input vorgemerkt. */
const BUFFER_FROM = 0.4;
const REST_YAW = 0;
const REST_PITCH = 1.3;

const smooth = (s: number) => s * s * (3 - 2 * s);

export class Combat {
  private pivot = new THREE.Group();
  private current: AttackDef | null = null;
  private heavy = false;
  private t = 0;
  private combo = 0;
  private comboTimer = 0;
  private queued: 'light' | 'heavy' | null = null;
  private hitSet = new Set<object>();

  constructor(
    owner: THREE.Object3D,
    private player: Player,
    private input: Input,
    private targets: Enemies,
  ) {
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.05, 1.4),
      new THREE.MeshStandardMaterial({ color: 0xf2ecd8, emissive: 0x8a8470, roughness: 0.3, metalness: 0.6 }),
    );
    blade.position.z = 0.95;
    const grip = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.06, 0.28),
      new THREE.MeshStandardMaterial({ color: 0x2b2923 }),
    );
    grip.position.z = 0.1;
    blade.castShadow = true;
    this.pivot.add(blade, grip);
    this.pivot.rotation.order = 'YXZ';
    this.pivot.position.set(-0.45, 1.15, 0.1);
    this.pivot.rotation.set(REST_PITCH, REST_YAW, 0);
    owner.add(this.pivot);
  }

  get attacking() {
    return this.current !== null;
  }

  cancel() {
    this.current = null;
    this.queued = null;
    this.combo = 0;
    this.comboTimer = 0;
  }

  /**
   * @param aimAngle Blickwinkel der Eingabe (atan2(x, z)) oder null ohne Eingabe
   * @returns Faktor für die Laufgeschwindigkeit (1 = normal)
   */
  update(dt: number, aimAngle: number | null): number {
    if (this.player.dead) {
      this.cancel();
      this.poseRest(dt);
      return 1;
    }

    const light = this.input.lightPressed();
    const heavy = this.input.heavyPressed();

    if (!this.current) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
      if (light) this.start(false, aimAngle);
      else if (heavy) this.start(true, aimAngle);
      else this.poseRest(dt);
    } else {
      const def = this.current;
      if ((light || heavy) && this.t > def.duration * BUFFER_FROM) {
        this.queued = heavy ? 'heavy' : 'light';
      }
      this.t += dt;
      this.pose(def);
      if (this.t >= def.hitStart && this.t <= def.hitEnd) this.strike(def);
      if (this.t >= def.duration) this.finish(aimAngle);
    }

    return this.current ? this.current.moveScale : 1;
  }

  private start(heavy: boolean, aimAngle: number | null) {
    const def = heavy ? HEAVY : LIGHT[this.combo];
    this.current = def;
    this.heavy = heavy;
    this.t = 0;
    this.queued = null;
    this.hitSet.clear();
    if (aimAngle !== null) this.player.facing = aimAngle;
    this.player.velocity.x = Math.sin(this.player.facing) * def.lunge;
    this.player.velocity.z = Math.cos(this.player.facing) * def.lunge;
  }

  private finish(aimAngle: number | null) {
    if (this.heavy) {
      this.combo = 0;
      this.comboTimer = 0;
    } else {
      this.combo = (this.combo + 1) % LIGHT.length;
      this.comboTimer = this.combo === 0 ? 0 : COMBO_WINDOW;
    }
    const next = this.queued;
    this.current = null;
    this.queued = null;
    if (next === 'heavy') this.start(true, aimAngle);
    else if (next === 'light') this.start(false, aimAngle);
  }

  private pose(def: AttackDef) {
    // Schwung bis zum Ende des Trefferfensters, danach Pose halten
    const s = smooth(Math.min(this.t / def.hitEnd, 1));
    this.pivot.rotation.y = def.yaw[0] + (def.yaw[1] - def.yaw[0]) * s;
    this.pivot.rotation.x = def.pitch[0] + (def.pitch[1] - def.pitch[0]) * s;
  }

  private poseRest(dt: number) {
    const k = 1 - Math.exp(-14 * dt);
    this.pivot.rotation.y += (REST_YAW - this.pivot.rotation.y) * k;
    this.pivot.rotation.x += (REST_PITCH - this.pivot.rotation.x) * k;
  }

  private strike(def: AttackDef) {
    const p = this.player.position;
    const fx_ = Math.sin(this.player.facing);
    const fz_ = Math.cos(this.player.facing);
    for (const target of this.targets.list) {
      if (!target.alive || this.hitSet.has(target)) continue;
      const dx = target.position.x - p.x;
      const dz = target.position.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist - target.radius > def.reach) continue;
      if (dist > 0.001) {
        const angle = Math.acos(Math.min(1, Math.max(-1, (dx * fx_ + dz * fz_) / dist)));
        if (angle > def.arc / 2) continue;
      }
      this.hitSet.add(target);
      const dir = new THREE.Vector3(dx, 0, dz).normalize();
      target.takeHit(def.damage, dir, def.knock);
      fx.hitstop = Math.max(fx.hitstop, def.hitstop);
      fx.shake += def.shake;
    }
  }
}
