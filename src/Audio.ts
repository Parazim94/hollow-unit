export type SoundName =
  | 'step' | 'land' | 'blip' | 'swing' | 'hit' | 'shoot' | 'dodge' | 'jump' | 'hurt' | 'kill' | 'warn' | 'slam';

// A-Moll-Pentatonik, zwei Oktaven
const SCALE = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 783.99];
const LOOKAHEAD = 0.4;

/**
 * Komplett prozedurales Audio (keine Dateien nötig): Soundeffekte und eine ruhige
 * Ambient-Musik, die bei Gefechten dichter wird. Startet nach der ersten Eingabe.
 * M schaltet den Ton stumm.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private musicBus!: GainNode;
  private reverb!: ConvolverNode;
  private noiseBuf!: AudioBuffer;
  private droneFilter!: BiquadFilterNode;
  private droneGain!: GainNode;
  private muted = false;

  private intensity = 0;
  private target = 0;
  private nextNote = 0;
  private step = 0;
  private noteIdx = 3;

  constructor() {
    const start = () => this.init();
    window.addEventListener('pointerdown', start, { once: true });
    window.addEventListener('keydown', start, { once: true });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM' && this.ctx) {
        this.muted = !this.muted;
        this.master.gain.value = this.muted ? 0 : 0.8;
      }
    });
  }

  /** 0 = Ruhe, 1 = Gefecht */
  setIntensity(v: number) {
    this.target = v;
  }

  play(name: SoundName) {
    const c = this.ctx;
    if (!c || this.muted) return;
    switch (name) {
      case 'step':
        this.noise(0.06, 'lowpass', 1200, 200, 0.1);
        this.tone('sine', 90, 60, 0.05, 0.07);
        break;
      case 'land':
        this.noise(0.16, 'lowpass', 1500, 150, 0.3);
        this.tone('sine', 70, 35, 0.16, 0.25);
        break;
      case 'blip':
        this.tone('square', 1500, 1400, 0.03, 0.025);
        break;
      case 'swing':
        this.noise(0.18, 'bandpass', 600, 2400, 0.25);
        break;
      case 'hit':
        this.noise(0.12, 'lowpass', 3000, 200, 0.5);
        this.tone('square', 180, 50, 0.12, 0.2);
        break;
      case 'shoot':
        this.tone('square', 900, 300, 0.07, 0.06);
        break;
      case 'dodge':
        this.noise(0.22, 'bandpass', 3000, 800, 0.22);
        break;
      case 'jump':
        this.tone('sine', 260, 520, 0.15, 0.16);
        break;
      case 'hurt':
        this.tone('sawtooth', 300, 60, 0.3, 0.25);
        this.noise(0.2, 'lowpass', 2000, 200, 0.4);
        break;
      case 'kill':
        this.noise(0.4, 'lowpass', 2500, 100, 0.5);
        this.tone('sine', 200, 40, 0.4, 0.35);
        break;
      case 'warn':
        this.tone('square', 1200, 1100, 0.08, 0.04);
        break;
      case 'slam':
        this.tone('sine', 90, 30, 0.6, 0.6);
        this.noise(0.5, 'lowpass', 800, 60, 0.6);
        break;
    }
  }

  /** Pro Frame aufrufen. */
  update(dt: number) {
    if (!this.ctx) return;
    this.intensity += (this.target - this.intensity) * Math.min(1, dt * 0.6);
    const t = this.ctx.currentTime;
    this.droneFilter.frequency.setTargetAtTime(300 + this.intensity * 900, t, 0.5);
    this.droneGain.gain.setTargetAtTime(0.05 + this.intensity * 0.05, t, 0.5);
  }

  private init() {
    if (this.ctx) return;
    const c = new AudioContext();
    this.ctx = c;
    void c.resume();

    this.master = c.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(c.destination);
    this.sfx = c.createGain();
    this.sfx.gain.value = 0.7;
    this.sfx.connect(this.master);
    this.musicBus = c.createGain();
    this.musicBus.gain.value = 0.5;
    this.musicBus.connect(this.master);

    // Weißes Rauschen als Wiederverwendungspuffer
    this.noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // Hall aus abklingendem Rauschen
    this.reverb = c.createConvolver();
    const len = c.sampleRate * 2.8;
    const ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    this.reverb.buffer = ir;
    const wet = c.createGain();
    wet.gain.value = 0.6;
    this.reverb.connect(wet).connect(this.musicBus);

    this.startDrone();
    this.startWind();
    this.nextNote = c.currentTime + 0.2;
    window.setInterval(() => this.schedule(), 100);
  }

  private startDrone() {
    const c = this.ctx!;
    this.droneFilter = c.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 300;
    this.droneGain = c.createGain();
    this.droneGain.gain.value = 0.05;
    this.droneFilter.connect(this.droneGain);
    this.droneGain.connect(this.musicBus);
    this.droneGain.connect(this.reverb);

    for (const [f, detune] of [[110, -6], [110, 6], [164.81, 0]] as const) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = detune;
      o.connect(this.droneFilter);
      o.start();
    }
    // Langsames Atmen des Filters
    const lfo = c.createOscillator();
    const lfoGain = c.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 120;
    lfo.connect(lfoGain).connect(this.droneFilter.frequency);
    lfo.start();
  }

  /** Leises Windrauschen als Dauer-Atmosphäre. */
  private startWind() {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filt = c.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 420;
    filt.Q.value = 0.5;
    const gain = c.createGain();
    gain.gain.value = 0.05;
    // Böen: langsames Auf- und Abschwellen
    const lfo = c.createOscillator();
    const lfoGain = c.createGain();
    lfo.frequency.value = 0.09;
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain).connect(gain.gain);
    lfo.start();
    src.connect(filt).connect(gain).connect(this.musicBus);
    src.start();
  }

  private schedule() {
    const c = this.ctx;
    if (!c) return;
    const stepDur = 0.5 - this.intensity * 0.25;
    while (this.nextNote < c.currentTime + LOOKAHEAD) {
      this.playStep(this.nextNote);
      this.nextNote += stepDur;
      this.step++;
    }
  }

  private playStep(when: number) {
    // Zufälliger Spaziergang durch die Tonleiter, nicht jeder Schritt klingt
    if (Math.random() < 0.65) {
      this.noteIdx = Math.max(0, Math.min(SCALE.length - 1, this.noteIdx + Math.floor(Math.random() * 5) - 2));
      this.note(SCALE[this.noteIdx], when, 0.1 + this.intensity * 0.04);
    }
    // Im Gefecht: tiefer Puls auf jedem zweiten Schritt
    if (this.intensity > 0.25 && this.step % 2 === 0) this.pulse(when, 0.18 * this.intensity);
  }

  private note(freq: number, when: number, vol: number) {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'triangle';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vol, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 1.6);
    o.connect(g);
    g.connect(this.musicBus);
    g.connect(this.reverb);
    o.start(when);
    o.stop(when + 1.7);
  }

  private pulse(when: number, vol: number) {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.setValueAtTime(90, when);
    o.frequency.exponentialRampToValueAtTime(40, when + 0.18);
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.25);
    o.connect(g).connect(this.musicBus);
    o.start(when);
    o.stop(when + 0.3);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number) {
    const c = this.ctx!;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, type: BiquadFilterType, f0: number, f1: number, vol: number) {
    const c = this.ctx!;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const filt = c.createBiquadFilter();
    filt.type = type;
    filt.frequency.setValueAtTime(f0, t);
    filt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt).connect(g).connect(this.sfx);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
  }
}
