import * as THREE from 'three';
import { createWorld } from './World';
import { Input } from './Input';
import { CameraRig } from './CameraRig';
import { Player } from './Player';

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private input: Input;
  private cameraRig: CameraRig;
  private player: Player;

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      200,
    );

    const world = createWorld(this.scene);
    this.input = new Input(this.renderer.domElement);
    this.cameraRig = new CameraRig(this.camera, this.input);
    this.player = new Player(this.scene, this.input, world.colliders, this.cameraRig);

    window.addEventListener('resize', this.onResize);
  }

  start() {
    this.renderer.setAnimationLoop(this.loop);
  }

  private loop = () => {
    // Delta-Time begrenzen, damit Tab-Wechsel keine riesigen Sprünge erzeugen
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.input.poll();
    this.player.update(dt);
    this.cameraRig.update(dt, this.player.position);
    this.input.endFrame();
    this.renderer.render(this.scene, this.camera);
  };

  private onResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };
}
