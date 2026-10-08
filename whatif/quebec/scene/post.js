// Look pass (wiflook1): height-aware haze, material upgrade, sky environment light, and the post chain
// (MSAA HDR render -> GTAO contact darkening -> bloom -> ACES + sRGB -> grade/vignette/grain). Frame n is a pure function of n.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// ---- height-aware haze: density = ext * exp(-k * y), integrated analytically along the view ray, plus a thin uniform floor ----
export const FOG = { color: new THREE.Color(0xcfdde8), ext: 0.0017, k: 0.014, floor: 0.00010 };
export const HEIGHT_FOG_GLSL = (k = FOG.k, floor = FOG.floor) => `
float heightFogFactor(vec3 camPos, vec3 p, float ext){
  vec3 r = p - camPos; float d = length(r); float kd = ${k.toFixed(5)} * r.y;
  float f = abs(kd) > 1e-3 ? (1.0 - exp(-kd)) / kd : 1.0;
  float tau = ext * exp(-${k.toFixed(5)} * camPos.y) * d * f + ${floor.toFixed(6)} * d;
  return 1.0 - exp(-tau);
}`;
export function installHeightFog() {
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = '#ifdef USE_FOG\n varying vec3 vFogWorld;\n#endif';
  C.fog_vertex = '#ifdef USE_FOG\n vFogWorld = cameraPosition + mvPosition.xyz * mat3(viewMatrix);\n#endif';
  C.fog_pars_fragment = '#ifdef USE_FOG\n uniform vec3 fogColor; varying vec3 vFogWorld; uniform float fogDensity;\n' + HEIGHT_FOG_GLSL() + '\n#endif';
  C.fog_fragment = '#ifdef USE_FOG\n gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, heightFogFactor(cameraPosition, vFogWorld, fogDensity));\n#endif';
}

// ---- Lambert -> physically based (flat shading was the "toy blocks" read) ----
export function upgradeMaterials(root) {
  const cache = new Map();
  root.traverse((o) => {
    const m = o.material; if (!o.isMesh || !m || !m.isMeshLambertMaterial) return;
    let s = cache.get(m);
    if (!s) {
      s = new THREE.MeshStandardMaterial({ color: m.color, map: m.map, emissive: m.emissive, emissiveIntensity: m.emissiveIntensity, vertexColors: m.vertexColors,
        flatShading: m.flatShading, transparent: m.transparent, opacity: m.opacity, side: m.side, fog: m.fog, roughness: 0.86, metalness: 0.0 });
      cache.set(m, s);
    }
    o.material = s;
  });
  return cache.size;
}

export function makeEnvironment(renderer, skyFactory, intensity) {
  const pm = new THREE.PMREMGenerator(renderer);
  const es = new THREE.Scene(); es.add(skyFactory());
  const rt = pm.fromScene(es, 0, 1, 3000); pm.dispose();
  return { texture: rt.texture, intensity };
}

// ---- grade (display space, after ACES/sRGB): faded cool blacks, warm highlights, mild desaturation, vignette, deterministic grain ----
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uFrame: { value: 0 }, uGrain: { value: 0.010 }, uVig: { value: 0.20 }, uSat: { value: 1.12 }, uRes: { value: new THREE.Vector2(1080, 1920) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uFrame, uGrain, uVig, uSat; uniform vec2 uRes;
    float h21(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      c = mix(vec3(0.012, 0.016, 0.026), vec3(1.0), c);                                  // lift: faded, slightly cool blacks
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c *= mix(vec3(0.97, 1.0, 1.035), vec3(1.0), smoothstep(0.05, 0.45, l));              // cool shadows
      c *= mix(vec3(1.0), vec3(1.03, 1.0, 0.955), smoothstep(0.45, 0.95, l));              // warm highlights
      c = mix(vec3(l), c, uSat);
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.35);                                           // gentle S-curve for contrast
      vec2 q = (vUv - 0.5) * vec2(0.85, 1.0);
      c *= 1.0 - uVig * smoothstep(0.25, 0.75, length(q));
      c += (h21(vUv * uRes + uFrame * 1.618) - 0.5) * uGrain * (1.0 - abs(l - 0.5));
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export function makePost(renderer, scene, camera, W, H, o) {
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: o.samples ?? 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(1); composer.setSize(W, H);
  composer.addPass(new RenderPass(scene, camera));
  let gtao = null;
  if (o.ao) {
    gtao = new GTAOPass(scene, camera, W, H);
    gtao.output = GTAOPass.OUTPUT.Default; gtao.blendIntensity = o.aoIntensity;
    gtao.updateGtaoMaterial({ radius: o.aoRadius, distanceExponent: 1.5, thickness: 2, scale: 1.2, samples: 16, distanceFallOff: 1 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: 16 });
    // wifscene5: fade the AO blend out with view distance (o.aoFade = [start, end] m; default 400..700). GTAO at 1+ km
    // (Levis ridge against the sky) drew black slivers on the silhouette (out/scene5/specks-ao.png: present with AO, gone with ao=0).
    const bm = gtao.blendMaterial, fade = o.aoFade || [400, 700];
    Object.assign(bm.uniforms, { tDepth: { value: gtao.depthTexture }, cameraNear: { value: camera.near }, cameraFar: { value: camera.far },
      fadeStart: { value: fade[0] }, fadeEnd: { value: fade[1] } });
    bm.fragmentShader = `uniform float intensity, cameraNear, cameraFar, fadeStart, fadeEnd; uniform sampler2D tDiffuse, tDepth; varying vec2 vUv;
      void main() { vec4 texel = texture2D(tDiffuse, vUv); float d = texture2D(tDepth, vUv).x;
        float z = (cameraNear * cameraFar) / (cameraFar - d * (cameraFar - cameraNear));
        float f = 1.0 - smoothstep(fadeStart, fadeEnd, z);
        gl_FragColor = vec4(mix(vec3(1.), texel.rgb, intensity * f), texel.a); }`;
    bm.needsUpdate = true;
    composer.addPass(gtao);
  }
  let bloom = null;
  if (o.bloom > 0) { bloom = new UnrealBloomPass(new THREE.Vector2(W, H), o.bloom, 0.65, o.bloomThreshold); composer.addPass(bloom); }
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader); grade.uniforms.uRes.value.set(W, H); grade.uniforms.uGrain.value = o.grain; grade.uniforms.uVig.value = o.vig;
  composer.addPass(grade);
  return { composer, gtao, bloom, grade, render: (n) => { grade.uniforms.uFrame.value = n; composer.render(0); } };
}
