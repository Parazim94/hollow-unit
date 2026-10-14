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
  /** Schwarzblende (0 = Bild sichtbar, 1 = schwarz), wird in Game ausgeblendet. */
  fade: 0,
  /** Entsättigung (0..1), z. B. nach dem Tod. */
  desat: 0,
  /** Warn-Rand bei niedrigen HP (0..1). */
  danger: 0,
  /** Kurzer Kamera-FOV-Stoß (z. B. beim Ausweichen), klingt ab. */
  kick: 0,
  /** Partikelausbruch an einer Weltposition. */
  burst: (_x: number, _y: number, _z: number, _count: number, _color: number, _speed: number) => {},
  /** Soundeffekt abspielen. */
  sound: (_name: SoundName) => {},
};
