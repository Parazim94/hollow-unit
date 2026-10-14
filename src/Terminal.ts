import * as THREE from 'three';
import type { Colliders } from './Colliders';

const USE_RADIUS = 2.4;

/** Hackbares Terminal. Nach erfolgreichem Hack erlischt der Bildschirm. */
export class Terminal {
  hacked = false;
  private screenMat = new THREE.MeshBasicMaterial({ color: 0xc0392b });
  private position: THREE.Vector3;

  constructor(scene: THREE.Scene, colliders: Colliders, position: THREE.Vector3) {
    this.position = position.clone();
    const group = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x3a372f, roughness: 0.6, metalness: 0.3 });

    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.4, 0.6), dark);
    pillar.position.y = 0.7;
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.04), this.screenMat);
    screen.position.set(0, 1.0, 0.32);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 6), dark);
    antenna.position.set(0.3, 1.75, 0);
    pillar.castShadow = true;
    group.add(pillar, screen, antenna);

    group.position.copy(position);
    // Bildschirm zeigt zum Startpunkt des Spielers
    group.rotation.y = Math.atan2(0 - position.x, 4 - position.z);
    scene.add(group);

    colliders.add({ x: position.x, z: position.z, halfW: 0.55, halfD: 0.55, rot: 0, height: 1.4 });
  }

  near(p: THREE.Vector3) {
    return !this.hacked && Math.hypot(p.x - this.position.x, p.z - this.position.z) < USE_RADIUS;
  }

  setHacked() {
    this.hacked = true;
    this.screenMat.color.setHex(0x4a463c);
  }
}
