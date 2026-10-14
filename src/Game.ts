import * as THREE from 'three';
import { createWorld } from './World';
import { Input, IS_TOUCH } from './Input';
import { Touch } from './Touch';
import { CameraRig } from './CameraRig';
import { Player } from './Player';
import { Enemies } from './Enemies';
import { Pod } from './Pod';
import { HUD } from './HUD';
import { fx } from './Fx';
import { PostFX } from './PostFX';
import { Particles, Dust } from './Particles';
import { AudioEngine } from './Audio';
import { Screens } from './Screens';
import { Dialogue } from './Dialogue';
import { Terminal } from './Terminal';
import { Hacking } from './Hacking';

type State = 'menu' | 'playing' | 'paused' | 'dialogue' | 'hacking';

const POD = 'POD 042';

const TEXT = {
  intro: [
    'Einheit HOLLOW-01 online. Systemcheck abgeschlossen.',
    'Mission: Maschinenlebensformen in Sektor 7 ausschalten.',
    'Ein Terminal in der Nähe lässt sich hacken und repariert deine Systeme.',
    'Viel Erfolg, Einheit.',
  ],
  bossIntro: [
    'Warnung: Massive Energiesignatur erkannt.',
    'Klassifizierung: COLOSSUS. Hohe Panzerung. Seine Schockwellen lassen sich überspringen.',
  ],
  bossOutro: [
    'Ziel eliminiert.',
    '...Signal erloschen. Sektor 7 ist vorerst still.',
    'Mission abgeschlossen, Einheit HOLLOW-01.',
  ],
  hackWin: ['Zugriff gewährt. Systemintegrität wiederhergestellt.', 'Reparatur abgeschlossen.'],
  hackFail: ['Zugriff verweigert. Das Terminal lässt sich erneut hacken.'],
};

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private timer = new THREE.Timer();
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
  private screens: Screens;
  private dialogue = new Dialogue();
  private terminal: Terminal;
  private hacking: Hacking;
  private world: ReturnType<typeof createWorld>;
  private touch: Touch | null = null;

  private state: State = 'menu';
  private introShown = false;
  private bossIntroShown = false;
  private bossOutroShown = false;

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // Neutrales Tonemapping: komprimiert helle Stellen (Himmel, Augen), ohne Farben zu verfälschen
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    document.body.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      200,
    );

    const world = (this.world = createWorld(this.scene));
    this.input = new Input(this.renderer.domElement);
    this.cameraRig = new CameraRig(this.camera, this.input);
    if (IS_TOUCH) this.touch = new Touch(this.input);
    this.enemies = new Enemies(this.scene, world.colliders);
    this.player = new Player(this.scene, this.input, world.colliders, this.cameraRig, this.enemies);
    this.player.onRespawn = () => {
      this.enemies.reset();
      this.bossIntroShown = this.bossOutroShown = false;
    };
    this.pod = new Pod(this.scene, this.player, this.cameraRig, this.input, this.enemies);
    this.hud = new HUD(this.player, this.enemies.boss);
    this.terminal = new Terminal(this.scene, world.colliders, new THREE.Vector3(-3, 0, 5));
    this.hacking = new Hacking(this.input, (won) => this.onHackDone(won));

    this.particles = new Particles(this.scene);
    this.dust = new Dust(this.scene);
    this.post = new PostFX(this.renderer, this.scene, this.camera);
    fx.burst = (x, y, z, n, c, s) => this.particles.burst(x, y, z, n, c, s);
    fx.sound = (name) => this.audio.play(name);

    this.screens = new Screens((which) => (which === 'menu' ? this.startGame() : this.resume()));
    this.screens.show('menu');
    this.hud.setVisible(false);

    // Maus verloren (Esc) = Pause
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.renderer.domElement;
      if (!locked && this.state === 'playing' && !this.player.dead) this.pause();
    });
    window.addEventListener('resize', this.onResize);
    // App-Wechsel oder gesperrter Bildschirm: automatisch pausieren
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing' && !this.player.dead) this.pause();
    });

    // Nur im Dev-Modus: Zugriff für Tests in der Browser-Konsole (fehlt im Produktions-Build)
    if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = this;
  }

  /** Shader vorab kompilieren und ein paar Frames rendern, damit es beim Start nicht ruckelt. */
  async warmup() {
    await this.renderer.compileAsync(this.scene, this.camera);
    for (let i = 0; i < 3; i++) this.post.render(i * 0.016, 0.016);
  }

  start() {
    this.renderer.setAnimationLoop(this.loop);
  }

  // --- Zustandswechsel ---------------------------------------------------

  private lock() {
    if (IS_TOUCH) return; // kein Pointer Lock auf Handys
    const r: unknown = this.renderer.domElement.requestPointerLock();
    if (r instanceof Promise) r.catch(() => {});
  }

  private startGame() {
    if (this.state !== 'menu') return;
    this.lock();
    if (IS_TOUCH) this.enterFullscreen();
    fx.fade = 0.8;
    this.screens.show(null);
    this.hud.setVisible(true);
    this.state = 'playing';
    if (!this.introShown) {
      this.introShown = true;
      this.say(TEXT.intro, 'playing');
    }
  }

  /** Vollbild und Querformat, soweit der Browser es erlaubt (iPhones lassen es nicht zu). */
  private enterFullscreen() {
    try {
      const el = document.documentElement;
      const req = el.requestFullscreen?.({ navigationUI: 'hide' });
      void req
        ?.then(() => (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
        .catch(() => {});
    } catch {
      /* Vollbild ist optional */
    }
  }

  private pause() {
    this.state = 'paused';
    this.hud.setPrompt(null);
    this.screens.show('pause');
    document.exitPointerLock();
  }

  private resume() {
    if (this.state !== 'paused') return;
    this.lock();
    this.screens.show(null);
    this.state = 'playing';
  }

  /** Dialog anzeigen und danach in den Zustand `next` wechseln. */
  private say(lines: string[], next: 'playing' | 'paused') {
    this.state = 'dialogue';
    this.hud.setPrompt(null);
    this.dialogue.start(POD, lines, () => {
      if (next === 'paused') this.pause();
      else this.state = 'playing';
    });
  }

  private startHack() {
    this.state = 'hacking';
    this.hud.setPrompt(null);
    document.exitPointerLock();
    this.hacking.start();
  }

  private onHackDone(won: boolean) {
    if (won) {
      this.terminal.setHacked();
      this.player.heal();
    }
    // Die Maus ist nicht mehr gefangen, also danach über den Pause-Schirm fortsetzen
    this.say(won ? TEXT.hackWin : TEXT.hackFail, 'paused');
  }

  // --- Hauptschleife -------------------------------------------------------

  private loop = () => {
    // Delta-Time begrenzen, damit Tab-Wechsel keine riesigen Sprünge erzeugen
    this.timer.update();
    let dt = Math.min(this.timer.getDelta(), 0.05);
    const realDt = dt;
    // Hitstop: Spiel kurz fast einfrieren, das betont Treffer
    if (fx.hitstop > 0) {
      fx.hitstop -= dt;
      dt *= 0.05;
    }
    const t = this.timer.getElapsed();
    this.input.poll();

    switch (this.state) {
      case 'menu':
        // Kamera kreist langsam um den Startpunkt
        this.cameraRig.yaw += dt * 0.12;
        this.cameraRig.update(dt, this.player.position);
        if (this.input.confirmPressed()) this.startGame();
        break;
      case 'paused':
        if (this.input.confirmPressed()) this.resume();
        break;
      case 'dialogue':
        this.dialogue.update(dt, this.input.confirmPressed());
        break;
      case 'hacking':
        this.hacking.update(dt);
        break;
      case 'playing':
        this.updatePlaying(dt, t);
        break;
    }

    // Blenden und Warnanzeige laufen in Echtzeit, unabhängig vom Hitstop
    fx.fade = Math.max(0, fx.fade - realDt * 0.9);
    const dead = this.state === 'playing' && this.player.dead;
    fx.desat += ((dead ? 1 : 0) - fx.desat) * Math.min(1, realDt * 3);
    const hpRatio = this.player.hp / this.player.maxHp;
    fx.danger = this.state === 'playing' && !this.player.dead && hpRatio < 0.3 ? (0.3 - hpRatio) / 0.3 : 0;
    this.touch?.setMode(
      this.state === 'playing'
        ? this.player.dead ? 'dead' : 'play'
        : this.state === 'dialogue' ? 'dialogue'
        : this.state === 'hacking' ? 'hack'
        : 'off',
    );
    this.world.update(dt, t, this.player.position);
    this.hud.update();
    this.particles.update(dt);
    this.dust.update(t, this.player.position);
    this.audio.setIntensity(
      this.state === 'playing' && this.enemies.list.some((e) => e.alive && e.aggro) ? 1 : 0,
    );
    this.audio.update(dt);
    this.input.endFrame();
    this.post.render(t, dt);
  };

  private updatePlaying(dt: number, t: number) {
    if (!this.player.dead && this.input.pausePressed()) {
      this.pause();
      return;
    }

    this.player.update(dt);
    this.pod.update(dt, t);
    this.enemies.update(dt, this.player);
    this.cameraRig.update(dt, this.player.position);

    // Terminal
    const canHack = !this.player.dead && this.terminal.near(this.player.position);
    this.hud.setPrompt(canHack && !IS_TOUCH ? '[F] HACKEN' : null);
    this.touch?.setInteract(canHack);
    if (canHack && this.input.interactPressed()) {
      this.startHack();
      return;
    }

    // Story-Momente rund um den Boss
    const boss = this.enemies.boss;
    if (boss.aggro && boss.alive && !this.bossIntroShown) {
      this.bossIntroShown = true;
      this.say(TEXT.bossIntro, 'playing');
    } else if (boss.aggro && !boss.alive && !this.bossOutroShown) {
      this.bossOutroShown = true;
      this.say(TEXT.bossOutro, 'playing');
    }
  }

  private onResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.post.resize(window.innerWidth, window.innerHeight, this.renderer.getPixelRatio());
  };
}
