// Gradient sky dome with a soft sun glow + a handful of flat low-poly clouds.
import * as THREE from 'three';
import { rng } from './config.js';

const QUEBEC = new URLSearchParams(location.search).get('world') === 'quebec';
// Quebec mode: afternoon sun from the south-west (az 225, elevation 34 deg), behind a viewer who looks east (az 80). water.js imports this same vector.
export const SUN_DIR = QUEBEC ? new THREE.Vector3(-0.7071 * Math.cos(0.5934), Math.sin(0.5934), 0.7071 * Math.cos(0.5934)).normalize() : new THREE.Vector3(-0.42, 0.80, 0.12).normalize();
const NEW_LOOK = new URLSearchParams(location.search).get('look') !== 'proto';   // look pass: bluer haze (proto kept for A/B)
export const FOG_COLOR = new THREE.Color(NEW_LOOK ? 0xb6cde2 : 0xcfdde8);
export const FOG_DENSITY = 0.0033;

export function makeSky() {
  const g = new THREE.Group();
  const cl = QUEBEC ? 1 : 0;   // Quebec: soft clouds painted into the dome shader (fbm), no low-poly cloud blobs
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTime: { value: 0 }, uClouds: { value: cl }, uSun: { value: SUN_DIR }, uHorizon: { value: FOG_COLOR }, uZenith: { value: new THREE.Color(0x3f7fc4) }, uMid: { value: new THREE.Color(0x8fbbe0) } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec3 vDir; uniform vec3 uSun, uHorizon, uZenith, uMid; uniform float uTime, uClouds;
      float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1,0)), f.x), mix(h21(i + vec2(0,1)), h21(i + vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; } return s; }
      void main(){
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.18, h));
        col = mix(col, uZenith, smoothstep(0.12, 0.75, h));
        float s = max(dot(normalize(vDir), normalize(uSun)), 0.0);
        col += vec3(1.0, 0.92, 0.75) * (pow(s, 6.0) * 0.12 + pow(s, 220.0) * 1.2);
        if (uClouds > 0.5 && vDir.y > 0.0) {
          vec2 p = vDir.xz / (vDir.y + 0.10) * 0.55 + vec2(uTime * 0.012, 0.0);
          float c = fbm(p * 1.6), cs = fbm(p * 1.6 + normalize(uSun.xz) * 0.06);
          float cov = smoothstep(0.50, 0.74, c) * smoothstep(0.015, 0.20, vDir.y);
          float lit = clamp(0.62 + (c - cs) * 7.0, 0.0, 1.0);
          vec3 cc = mix(vec3(0.60, 0.68, 0.80), vec3(1.0, 0.97, 0.91), lit);
          col = mix(col, cc, cov * 0.92);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), mat); g.userData.setTime = (t) => { mat.uniforms.uTime.value = t; };
  dome.renderOrder = -10; dome.frustumCulled = false;
  g.add(dome);
  // clouds: flattened icospheres, flat shaded, a little blue underside via vertex colours
  const R = rng(4242);
  const cmat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, emissive: 0x9fb2c6, emissiveIntensity: 0.55, fog: true });
  for (let i = 0; i < (QUEBEC ? 0 : 14); i++) {
    const cl = new THREE.Group();
    const n = 3 + R.int(0, 3);
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), cmat);
      m.scale.set(26 + R() * 30, 8 + R() * 7, 16 + R() * 14); m.position.set((k - n / 2) * 28 + R() * 10, R() * 5, R() * 14 - 7);
      cl.add(m);
    }
    const ang = R.range(-0.9, 0.9), dist = R.range(520, 900);
    cl.position.set(Math.sin(ang) * dist, R.range(150, 330), -Math.cos(ang) * dist);
    cl.rotation.y = R.range(-0.4, 0.4);
    g.add(cl);
  }
  return g;
}
