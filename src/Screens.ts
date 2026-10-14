/** Vollbild-Overlays: Startmenü und Pause. Ein Klick löst `onClick` aus. */
export class Screens {
  private menu: HTMLDivElement;
  private pause: HTMLDivElement;

  constructor(onClick: (which: 'menu' | 'pause') => void) {
    const root = document.createElement('div');
    root.innerHTML = `
      <style>
        .screen { position: fixed; inset: 0; display: none; flex-direction: column; align-items: center; justify-content: center;
          font-family: monospace; color: #d4cdb6; cursor: pointer; user-select: none; }
        #screen-menu { background: radial-gradient(ellipse at center, rgba(30,28,24,.45), rgba(20,18,15,.92)); }
        #screen-pause { background: rgba(30,28,24,.72); }
        .screen h1 { margin: 0; font-size: clamp(36px, 8vw, 84px); font-weight: 400; letter-spacing: .35em; padding-left: .35em; }
        .screen h2 { margin: 12px 0 0; font-size: 14px; font-weight: 400; letter-spacing: .5em; opacity: .65; }
        .screen .go { margin-top: 56px; font-size: 14px; letter-spacing: .35em; animation: blink 1.6s infinite; }
        .screen .keys { margin-top: 40px; font-size: 12px; line-height: 1.9; opacity: .6; text-align: center; letter-spacing: .08em; }
        @keyframes blink { 50% { opacity: .25; } }
      </style>
      <div id="screen-menu" class="screen">
        <h1>HOLLOW UNIT</h1>
        <h2>SEKTOR 7</h2>
        <div class="go">KLICK ODER ENTER</div>
        <div class="keys">
          WASD bewegen · Leertaste springen (2×) · Shift ausweichen<br>
          Linke Maustaste / J leicht · Rechte Maustaste / K schwer · E Pod-Feuer<br>
          F Terminal hacken · P Pause · M Ton · Gamepad wird unterstützt
        </div>
      </div>
      <div id="screen-pause" class="screen">
        <h1 style="font-size: clamp(28px, 5vw, 48px)">PAUSE</h1>
        <div class="go">KLICK ODER ENTER ZUM FORTSETZEN</div>
      </div>`;
    document.body.appendChild(root);
    this.menu = root.querySelector('#screen-menu') as HTMLDivElement;
    this.pause = root.querySelector('#screen-pause') as HTMLDivElement;
    this.menu.addEventListener('click', () => onClick('menu'));
    this.pause.addEventListener('click', () => onClick('pause'));
  }

  show(which: 'menu' | 'pause' | null) {
    this.menu.style.display = which === 'menu' ? 'flex' : 'none';
    this.pause.style.display = which === 'pause' ? 'flex' : 'none';
  }
}
