import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { fx } from './Fx';

/** Letzter Pass: leichte Entsättigung, Vignette, Film-Grain und Treffer-Glitch. */
const FilmShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    time: { value: 0 },
    glitch: { value: 0 },
    grain: { value: 0.07 },
    vignette: { value: 0.45 },
    fade: { value: 0 },
    desat: { value: 0 },
    danger: { value: 0 },
    resolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time, glitch, grain, vignette, fade, desat, danger;
    uniform vec2 resolution;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    void main() {
      vec2 uv = vUv;
      float tick = floor(time * 14.0);

      // Glitch: zufällige Zeilen verschieben, Farbkanäle trennen
      float row = floor(uv.y * 40.0);
      float g = step(0.72, hash(vec2(row, tick))) * glitch;
      uv.x += (hash(vec2(row, tick + 7.0)) - 0.5) * 0.08 * g;
      float split = 0.0008 + 0.008 * glitch;
      vec3 col = vec3(
        texture2D(tDiffuse, uv + vec2(split, 0.0)).r,
        texture2D(tDiffuse, uv).g,
        texture2D(tDiffuse, uv - vec2(split, 0.0)).b
      );

      // Entsättigter, leicht warmer Look
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, 0.78);
      col *= vec3(1.03, 1.0, 0.95);

      // Vignette
      float d = length(vUv - 0.5);
      col *= mix(1.0 - vignette, 1.0, smoothstep(0.82, 0.28, d));

      // Farbkorrektur: etwas mehr Kontrast, Schatten leicht angehoben und warm
      col = (col - 0.5) * 1.05 + 0.5;
      col += vec3(0.010, 0.009, 0.004);

      // Gefahr: roter, pulsierender Rand bei niedrigen HP
      float pulse = 0.6 + 0.4 * sin(time * 6.0);
      col = mix(col, col * vec3(1.0, 0.5, 0.45), danger * smoothstep(0.2, 0.75, d) * pulse);
      col *= 1.0 - danger * 0.12;

      // Tod: entsättigen und abdunkeln
      float l2 = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(l2) * 0.75, desat);

      // Film-Grain
      col += (hash(vUv * resolution + fract(time) * 100.0) - 0.5) * grain;

      // Schwarzblende
      col *= 1.0 - fade;

      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class PostFX {
  private composer: EffectComposer;
  private film: ShaderPass;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const size = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();
    // MSAA im Composer behalten (sonst wären die Kanten gezackt)
    const target = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, {
      type: THREE.HalfFloatType,
      samples: 4,
    });
    this.composer = new EffectComposer(renderer, target);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(size.x, size.y);

    this.composer.addPass(new RenderPass(scene, camera));
    // Schwelle hoch: nur wirklich helle Dinge (Projektile, Klinge, Augen) glühen
    this.composer.addPass(new UnrealBloomPass(size, 0.35, 0.6, 0.95));
    this.composer.addPass(new OutputPass());
    this.film = new ShaderPass(FilmShader);
    this.composer.addPass(this.film);
    this.setResolution(size.x * pr, size.y * pr);
  }

  render(t: number, dt: number) {
    this.film.uniforms.time.value = t;
    this.film.uniforms.glitch.value = fx.glitch;
    this.film.uniforms.fade.value = fx.fade;
    this.film.uniforms.desat.value = fx.desat;
    this.film.uniforms.danger.value = fx.danger;
    fx.glitch = fx.glitch > 0.01 ? fx.glitch * Math.exp(-6 * dt) : 0;
    this.composer.render();
  }

  resize(w: number, h: number, pixelRatio: number) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
    this.setResolution(w * pixelRatio, h * pixelRatio);
  }

  private setResolution(w: number, h: number) {
    this.film.uniforms.resolution.value.set(w, h);
  }
}
