import { Game } from './Game';

const loader = document.getElementById('loader') as HTMLDivElement;
const bar = document.getElementById('loader-bar') as HTMLDivElement;
const text = document.getElementById('loader-text') as HTMLElement;

const progress = (p: number) => (bar.style.width = `${p * 100}%`);
// Einen Frame warten, damit der Ladebalken zwischen den Schritten gezeichnet wird
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

async function boot() {
  progress(0.15);
  await nextFrame();
  const game = new Game();
  progress(0.5);
  text.textContent = 'KOMPILIERE SHADER';
  await nextFrame();
  await game.warmup();
  progress(1);
  game.start();
  loader.style.opacity = '0';
  setTimeout(() => loader.remove(), 700);
}

boot().catch((err) => {
  console.error(err);
  bar.style.background = '#c0392b';
  text.textContent = 'FEHLER: WEBGL WIRD VOM BROWSER NICHT UNTERSTÜTZT?';
});
