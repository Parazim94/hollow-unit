import type { SoundName } from './Audio';

/**
 * Geteilter Zustand und Hooks für Spielgefühl-Effekte.
 * `burst` und `sound` sind Platzhalter, die Game beim Start mit echten Systemen verbindet.
 */
export const fx = {
  /** Sekunden, in denen das Spiel fast eingefroren ist. */
  hitstop: 0,
  /** Stärke des Kamerawackelns, klingt automatisch ab. */
  shake: 0,
  /** Stärke des Glitch-Effekts (0..1), klingt automatisch ab. */
  glitch: 0,
  /** Partikelausbruch an einer Weltposition. */
  burst: (_x: number, _y: number, _z: number, _count: number, _color: number, _speed: number) => {},
  /** Soundeffekt abspielen. */
  sound: (_name: SoundName) => {},
};
