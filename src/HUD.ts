import type { Player } from './Player';

/** Einfaches HTML-HUD über dem Canvas: Lebensbalken, Fadenkreuz, Game-Over. */
export class HUD {
  private bar: HTMLDivElement;
  private over: HTMLDivElement;
  private lastRatio = -1;

  constructor(private player: Player) {
    const root = document.createElement('div');
    root.innerHTML = `
      <style>
        #hud-hp { position: fixed; left: 24px; top: 20px; width: 240px; font: 12px monospace; color: #4a463c; letter-spacing: .15em; }
        #hud-hp .track { margin-top: 4px; height: 6px; background: rgba(74,70,60,.25); }
        #hud-hp .fill { height: 100%; width: 100%; background: #4a463c; transition: width .15s; }
        #hud-dot { position: fixed; left: 50%; top: 50%; width: 4px; height: 4px; margin: -2px 0 0 -2px; background: #4a463c; opacity: .5; pointer-events: none; }
        #hud-over { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; flex-direction: column;
          background: rgba(30,28,24,.7); color: #d4cdb6; font: 28px monospace; letter-spacing: .4em; }
        #hud-over small { margin-top: 16px; font-size: 12px; letter-spacing: .2em; opacity: .7; }
      </style>
      <div id="hud-hp">HP<div class="track"><div class="fill"></div></div></div>
      <div id="hud-dot"></div>
      <div id="hud-over">SYSTEM FAILURE<small>R / START = NEUSTART</small></div>`;
    document.body.appendChild(root);
    this.bar = root.querySelector('.fill') as HTMLDivElement;
    this.over = root.querySelector('#hud-over') as HTMLDivElement;
  }

  update() {
    const ratio = Math.max(0, this.player.hp / this.player.maxHp);
    if (ratio !== this.lastRatio) {
      this.bar.style.width = `${ratio * 100}%`;
      this.lastRatio = ratio;
    }
    this.over.style.display = this.player.dead ? 'flex' : 'none';
  }
}
