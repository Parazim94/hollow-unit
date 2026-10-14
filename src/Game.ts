import * as THREE from 'three';
import { createWorld } from './World';
import { Input } from './Input';
import { CameraRig } from './CameraRig';
import { Player } from './Player';
import { Enemies } from './Enemies';
import { Pod } from './Pod';
import { HUD } from './HUD';
import { fx } from './Fx';
import { PostFX } from './PostFX';
import { Particles, Dust } from './Particles';
import { AudioEngine } from './Audio';

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private input: Input;
  private cameraRig: CameraRig;
  private player: Player;
  private pod: Pod;
  private enemies: Enemies;
  private hud: HUD;
  private post: PostFX;
  private particles: Particles;
  private dust: Dust;
  private audio = new AudioEngine();

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
    this.enemies = new Enemies(this.scene, world.colliders);
    this.player = new Player(this.scene, this.input, world.colliders, this.cameraRig, this.enemies);
    this.player.onRespawn = () => this.enemies.reset();
    this.pod = new Pod(this.scene, this.player, this.cameraRig, this.input, this.enemies);
    this.hud = new HUD(this.player, this.enemies.boss);

    this.particles = new Particles(this.scene);
    this.dust = new Dust(this.scene);
    this.post = new PostFX(this.renderer, this.scene, this.camera);
    fx.burst = (x, y, z, n, c, s) => this.particles.burst(x, y, z, n, c, s);
    fx.sound = (name) => this.audio.play(name);

    window.addEventListener('resize', this.onResize);
  }

  start() {
    this.renderer.setAnimationLoop(this.loop);
  }

  private loop = () => {
    // Delta-Time begrenzen, damit Tab-Wechsel keine riesigen Sprünge erzeugen
    let dt = Math.min(this.clock.getDelta(), 0.05);
    // Hitstop: Spiel kurz fast einfrieren, das betont Treffer
    if (fx.hitstop > 0) {
      fx.hitstop -= dt;
      dt *= 0.05;
    }
    const t = this.clock.elapsedTime;
    this.input.poll();
    this.player.update(dt);
    this.pod.update(dt, t);
    this.enemies.update(dt, this.player);
    this.hud.update();
    this.cameraRig.update(dt, this.player.position);
    this.particles.update(dt);
    this.dust.update(t, this.player.position);
    this.audio.setIntensity(this.enemies.list.some((e) => e.alive && e.aggro) ? 1 : 0);
    this.audio.update(dt);
    this.input.endFrame();
    this.post.render(t, dt);
  };

  private onResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.post.resize(window.innerWidth, window.innerHeight, this.renderer.getPixelRatio());
  };
}
