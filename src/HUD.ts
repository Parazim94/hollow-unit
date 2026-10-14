import type { Player } from './Player';
import { IS_TOUCH } from './Input';
import type { Boss } from './EnemyTypes';

const BANNER_MS = 6000;

/** Einfaches HTML-HUD über dem Canvas: Lebensbalken, Boss-Balken, Fadenkreuz, Game-Over. */
export class HUD {
  private root: HTMLDivElement;
  private prompt: HTMLDivElement;
  private bar: HTMLDivElement;
  private over: HTMLDivElement;
  private bossBox: HTMLDivElement;
  private bossFill: HTMLDivElement;
  private banner: HTMLDivElement;
  private lastRatio = -1;
  private bossWasAlive = true;
  private bannerUntil = 0;

  constructor(
    private player: Player,
    private boss: Boss,
  ) {
    const root = (this.root = document.createElement('div'));
    root.innerHTML = `
      <style>
        #hud-hp { position: fixed; left: calc(24px + env(safe-area-inset-left, 0px)); top: calc(20px + env(safe-area-inset-top, 0px)); width: 240px; font: 12px monospace; color: #4a463c; letter-spacing: .15em; }
        #hud-hp .track { margin-top: 4px; height: 6px; background: rgba(74,70,60,.25); }
        #hud-hp .fill { height: 100%; width: 100%; background: #4a463c; transition: width .15s; }
        #hud-dot { position: fixed; left: 50%; top: 50%; width: 4px; height: 4px; margin: -2px 0 0 -2px; background: #4a463c; opacity: .5; pointer-events: none; }
        #hud-boss { position: fixed; left: 50%; top: 22px; width: min(560px, 80vw); transform: translateX(-50%); display: none; font: 12px monospace; color: #4a463c; letter-spacing: .3em; text-align: center; }
        #hud-boss .track { margin-top: 6px; height: 8px; background: rgba(74,70,60,.25); }
        #hud-boss .fill { height: 100%; width: 100%; background: #8a3a2e; transition: width .15s; }
        #hud-prompt { position: fixed; left: 50%; bottom: 14vh; transform: translateX(-50%); display: none; font: 14px monospace; letter-spacing: .3em; color: #2b2923; background: rgba(212,205,182,.9); padding: 8px 16px; border: 1px solid #4a463c; }
        #hud-banner { position: fixed; left: 0; right: 0; top: 38%; display: none; text-align: center; font: 26px monospace; letter-spacing: .5em; color: #4a463c; pointer-events: none; }
        #hud-over { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; flex-direction: column;
          background: rgba(30,28,24,.7); color: #d4cdb6; font: 28px monospace; letter-spacing: .4em; }
        #hud-over small { margin-top: 16px; font-size: 12px; letter-spacing: .2em; opacity: .7; }
      </style>
      <div id="hud-hp">HP<div class="track"><div class="fill"></div></div></div>
      <div id="hud-dot"></div>
      <div id="hud-boss">COLOSSUS<div class="track"><div class="fill"></div></div></div>
      <div id="hud-prompt"></div>
      <div id="hud-banner">TARGET ELIMINATED</div>
      <div id="hud-over">SYSTEM FAILURE<small>${IS_TOUCH ? 'TIPPEN = NEUSTART' : 'R / START = NEUSTART'}</small></div>`;
    document.body.appendChild(root);
    this.bar = root.querySelector('#hud-hp .fill') as HTMLDivElement;
    this.over = root.querySelector('#hud-over') as HTMLDivElement;
    this.bossBox = root.querySelector('#hud-boss') as HTMLDivElement;
    this.bossFill = root.querySelector('#hud-boss .fill') as HTMLDivElement;
    this.banner = root.querySelector('#hud-banner') as HTMLDivElement;
    this.prompt = root.querySelector('#hud-prompt') as HTMLDivElement;
  }

  setVisible(v: boolean) {
    this.root.style.display = v ? 'block' : 'none';
  }

  /** Hinweis in der Bildmitte unten, z. B. "[F] HACKEN"; null blendet ihn aus. */
  setPrompt(text: string | null) {
    this.prompt.style.display = text ? 'block' : 'none';
    if (text) this.prompt.textContent = text;
  }

  update() {
    const ratio = Math.max(0, this.player.hp / this.player.maxHp);
    if (ratio !== this.lastRatio) {
      this.bar.style.width = `${ratio * 100}%`;
      this.lastRatio = ratio;
    }
    this.over.style.display = this.player.dead ? 'flex' : 'none';

    // Boss-Balken, solange er kämpft; Sieg-Banner nach seinem Tod
    const b = this.boss;
    if (this.bossWasAlive && !b.alive && b.aggro) this.bannerUntil = performance.now() + BANNER_MS;
    this.bossWasAlive = b.alive;
    this.bossBox.style.display = b.alive && b.aggro && !this.player.dead ? 'block' : 'none';
    this.bossFill.style.width = `${Math.max(0, (b.hp / b.maxHp) * 100)}%`;
    this.banner.style.display = performance.now() < this.bannerUntil ? 'block' : 'none';
  }
}
