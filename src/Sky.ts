import * as THREE from 'three';

export const FOG_COLOR = 0xd8d1ba;
export const SUN_DIR = new THREE.Vector3(22, 16, 10).normalize();

/** Himmelskuppel mit Farbverlauf, ziehenden Wolken und Sonnenschein. Folgt dem Spieler. */
export function createSky(scene: THREE.Scene) {
  const uniforms = {
    time: { value: 0 },
    top: { value: new THREE.Color(0xa9b0a8) },
    horizon: { value: new THREE.Color(FOG_COLOR) },
    sunDir: { value: SUN_DIR.clone() },
  };
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(150, 32, 16),
    new THREE.ShaderMaterial({
      uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        uniform float time;
        uniform vec3 top, horizon, sunDir;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
                     mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
        }
        float fbm(vec2 p) {
          float v = 0.0, a = 0.5;
          for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; }
          return v;
        }

        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y, 0.0, 1.0);
          vec3 col = mix(horizon, top, pow(h, 0.5));

          // Wolken: Projektion auf eine Ebene, langsam driftend
          vec2 uv = d.xz / (d.y + 0.3) * 1.3 + vec2(time * 0.012, time * 0.004);
          float c = fbm(uv * 1.6);
          c = smoothstep(0.42, 0.8, c) * smoothstep(0.0, 0.2, d.y);
          col = mix(col, vec3(0.97, 0.95, 0.9), c * 0.6);

          // Sonne
          float s = max(dot(d, normalize(sunDir)), 0.0);
          col += vec3(1.0, 0.93, 0.78) * (pow(s, 48.0) * 0.55 + pow(s, 6.0) * 0.14);
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  scene.add(mesh);

  return {
    update(t: number, center: THREE.Vector3) {
      uniforms.time.value = t;
      mesh.position.set(center.x, 0, center.z);
    },
  };
}
