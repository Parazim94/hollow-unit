import * as THREE from 'three';
import type { Input } from './Input';
import { fx } from './Fx';

const DISTANCE = 7;
const HEIGHT_OFFSET = 1.6;
const MIN_PITCH = 0.05;
const MAX_PITCH = 1.3;

/** Third-Person-Orbitkamera, die dem Ziel weich folgt. */
export class CameraRig {
  yaw = 0;
  pitch = 0.35;

  private focus = new THREE.Vector3();
  private initialized = false;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private input: Input,
  ) {}

  update(dt: number, target: THREE.Vector3) {
    const look = this.input.getLook(dt);
    this.yaw += look.yaw;
    this.pitch = THREE.MathUtils.clamp(this.pitch + look.pitch, MIN_PITCH, MAX_PITCH);

    const goal = new THREE.Vector3(target.x, target.y + HEIGHT_OFFSET, target.z);
    if (!this.initialized) {
      this.focus.copy(goal);
      this.initialized = true;
    } else {
      this.focus.lerp(goal, 1 - Math.exp(-10 * dt));
    }

    const cp = Math.cos(this.pitch);
    this.camera.position.set(
      this.focus.x + Math.sin(this.yaw) * cp * DISTANCE,
      this.focus.y + Math.sin(this.pitch) * DISTANCE,
      this.focus.z + Math.cos(this.yaw) * cp * DISTANCE,
    );
    // Nicht unter den Boden
    this.camera.position.y = Math.max(this.camera.position.y, 0.3);
    // Kamerawackeln (Treffer)
    if (fx.shake > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * fx.shake;
      this.camera.position.y += (Math.random() - 0.5) * fx.shake;
      this.camera.position.z += (Math.random() - 0.5) * fx.shake;
      fx.shake *= Math.exp(-10 * dt);
    } else {
      fx.shake = 0;
    }
    this.camera.lookAt(this.focus);
  }
}
