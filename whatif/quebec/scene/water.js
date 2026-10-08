// wifwater1: real water. Planar reflection (mirror camera, half-res HDR target), Gerstner-sum normals (analytic, LOD-faded by pixel
// footprint, calmer near contact), murky grey-green body with exponential extinction, depth-based contact foam from a half-res scene
// depth pass (works for ground, walls, cars, people), height fog shared with post.js. Plus applyWetness(): darker wet band on every
// standard material just above the waterline. Everything is a function of uTime (frame/30) and the level; no Math.random.
import * as THREE from 'three';
import { FOG_COLOR, SUN_DIR } from './sky.js';
import { FOG, HEIGHT_FOG_GLSL } from './post.js';

// wifscene5: 10 waves (4 long ones at other angles) so no single long wave survives the distance LOD as regular stripes
const WAVES = [[25, 46, 0.055], [-38, 61, 0.05], [58, 33, 0.05], [100, 83, 0.035], [70, 23, 0.06], [-20, 12, 0.058], [-75, 17.5, 0.045], [110, 6.3, 0.05], [15, 3.1, 0.045], [-60, 1.5, 0.038]].map(([a, wl, s]) => {
  const r = a * Math.PI / 180, k = 2 * Math.PI / wl; return { dx: Math.cos(r), dz: Math.sin(r), k, s, om: Math.sqrt(9.81 * k), wl };
});
const f = (x) => x.toFixed(5);

// opts: { renderer, camera, size:[w,h], reflScale, depthScale, groundHeightAt (accepted for the Quebec terrain; the depth pass already
// sees any terrain mesh, so it is only used to cap the murk depth when no mesh is below), start level }
export function createWater(scene, T, opts) {
  const { renderer, camera } = opts; const [RW, RH] = opts.size;
  const rs = opts.reflScale ?? 0.5, ds = opts.depthScale ?? 0.5;
  const reflRT = new T.WebGLRenderTarget(Math.round(RW * rs), Math.round(RH * rs), { type: T.HalfFloatType, depthBuffer: true });
  const depthRT = new T.WebGLRenderTarget(Math.round(RW * ds), Math.round(RH * ds), { depthBuffer: true });
  depthRT.depthTexture = new T.DepthTexture(depthRT.width, depthRT.height);
  const depthMat = new T.MeshBasicMaterial({ colorWrite: false, fog: false });
  const U = {
    uTime: { value: 0 }, uLevel: { value: -1 }, uCam: { value: new T.Vector3() }, uSun: { value: SUN_DIR }, uFogColor: { value: FOG_COLOR }, uFogDensity: { value: FOG.ext },
    uRefl: { value: reflRT.texture }, uDepth: { value: depthRT.depthTexture }, uReflM: { value: new T.Matrix4() }, uRes: { value: new T.Vector2(RW, RH) },
    uNear: { value: camera.near }, uFar: { value: camera.far }, uPix: { value: 0.001 },
    // wifscene6: uNearM = 1 when the eye is < ~2 m above the water (Day 56 on the terrace); uObs = up to 32 obstacles in the water (x, z, radius;
    // radius < 0 = rail post, chained to the next one by a picket foam line), set from main.js; uFlow = current direction (downstream, NE)
    uNearM: { value: 0 }, uMurk: { value: 0 }, uRip: { value: 0 }, uObs: { value: Array.from({ length: 32 }, () => new T.Vector3(0, 0, 0)) }, uFlow: { value: new T.Vector2(0.6, -0.8) },
    uShallow: { value: new T.Color(0x66765a) }, uDeep: { value: new T.Color(0x22373a) }, uMud: { value: new T.Color(0x6e6447) }, uFoam: { value: new T.Color(0xdfe6e0) },
  };
  const mat = new T.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, premultipliedAlpha: true, uniforms: U,
    vertexShader: `varying vec3 vWorld; varying float vViewZ;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; vec4 v = viewMatrix * w; vViewZ = -v.z; gl_Position = projectionMatrix * v; }`,
    fragmentShader: `
      varying vec3 vWorld; varying float vViewZ;
      uniform sampler2D uRefl, uDepth; uniform mat4 uReflM; uniform vec2 uRes;
      uniform float uTime, uLevel, uFogDensity, uNear, uFar, uPix, uNearM, uMurk, uRip; uniform vec3 uObs[32]; uniform vec2 uFlow; uniform vec3 uCam, uSun, uFogColor, uShallow, uDeep, uMud, uFoam;
      ${HEIGHT_FOG_GLSL()}
      const vec4 WV[10] = vec4[10](${WAVES.map((w) => `vec4(${f(w.dx)},${f(w.dz)},${f(w.k)},${f(w.s)})`).join(',')});
      const vec2 WS[10] = vec2[10](${WAVES.map((w) => `vec2(${f(w.om)},${f(w.wl)})`).join(',')});
      float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec2 p = vWorld.xz; vec3 toCam = uCam - vWorld; float dist = length(toCam); vec3 V = toCam / dist;
        // scene depth below the surface: thickness along the ray and vertical depth h
        vec2 suv = gl_FragCoord.xy / uRes; float d = texture2D(uDepth, suv).x;
        float sceneZ = uNear * uFar / (uFar - d * (uFar - uNear)); float scale = clamp(sceneZ / vViewZ, 1.0, 400.0);
        float thick = (scale - 1.0) * dist; float h = max((uCam.y - vWorld.y) * (scale - 1.0), 0.0);
        float calm = mix(0.30, 1.0, smoothstep(0.0, 2.5, h)); float nm = uNearM; calm = max(calm, 0.85 * nm);
        // Gerstner-sum normal, fading waves smaller than the pixel footprint
        float fp = dist * uPix / max(V.y, 0.06);
        vec2 sl = vec2(0.0); float sq = 0.0;
        // wifscene5: domain warp (bends the crests) and per-wave low-frequency amplitude patches (wind gusts), stronger with distance
        float far = smoothstep(60.0, 900.0, dist);
        vec2 pw = p + (vec2(vnoise(p * 0.006), vnoise(p * 0.006 + 31.0)) - 0.5) * (18.0 + 90.0 * far);
        float gust = mix(1.0, 0.25 + 1.5 * vnoise(p * vec2(0.0022, 0.0055) + 9.0), 0.4 + 0.6 * far);
        for (int i = 0; i < 10; i++) {
          float ph = WV[i].z * dot(WV[i].xy, pw) - WS[i].x * uTime; float vis = smoothstep(fp * 2.5, fp * 8.0, WS[i].y);   /* wifscene6: was 1.5-5 px; fine bands remained at 8/16 */
          // wifscene6: the 3.1 and 6.3 m waves left fine horizontal bands in the mid-field: fade them twice as early and by 250-500 m
          if (WS[i].y > 2.0 && WS[i].y < 7.0) vis = smoothstep(fp * 3.0, fp * 10.0, WS[i].y) * (1.0 - smoothstep(250.0, 500.0, dist));
          float am = mix(1.0, 0.2 + 1.6 * vnoise(p * 0.004 + float(i) * 7.31), 0.35 + 0.65 * far) * gust;
          // wifscene6: near the eye at Day 56 the long swells read as blobs: calm them (more so near), shorter waves a little
          am *= mix(1.0, WS[i].y > 10.0 ? 0.10 + 0.35 * smoothstep(15.0, 500.0, dist) : 0.6, nm);
          sl += WV[i].xy * (WV[i].w * am * cos(ph) * vis); sq += WV[i].w * am * sin(ph) * 0.6 * vis;
        }
        // fine chop that survives at distance as an isotropic roughness (no direction, so no stripes)
        sl += (vec2(vnoise(pw * 0.09 + uTime * 0.05), vnoise(pw * 0.09 - 13.0 - uTime * 0.04)) - 0.5) * 0.10 * gust * far;
        float visD = smoothstep(fp * 3.0, fp * 9.0, 0.9);
        sl += (vec2(vnoise(p * 1.3 + vec2(uTime * 0.5, uTime * 0.3)), vnoise(p * 1.3 + 17.0 - vec2(uTime * 0.4, -uTime * 0.35))) - 0.5) * 0.22 * visD;
        // wifscene6: small ripples (0.3-1 m) near the eye at Day 56
        float rip = nm * (1.0 - smoothstep(20.0, 90.0, dist));
        vec2 flr = normalize(uFlow), pa = p - flr * uTime * 0.8;   /* wifscene8: ripples advected downstream with the current */
        vec2 rq = pa * 1.6, rq2 = pa * 4.8 + vec2(uTime * 0.15, -uTime * 0.1);
        sl += flr * cos(dot(p, flr) * 9.0 - uTime * 7.0 + vnoise(pa * 0.8) * 6.0) * 0.07 * rip * visD;   /* crests across the flow, moving downstream */
        sl += ((vec2(vnoise(rq), vnoise(rq + 23.0)) - 0.5) * 0.30 + (vec2(vnoise(rq2), vnoise(rq2 + 7.0)) - 0.5) * 0.16 * visD) * rip;
        /* wifscene14: climb shot only (uRip, set in main.js): small wind ripples 40-500 m out so the river under the cliff is not a flat mirror */
        float rc = uRip * (1.0 - nm) * (1.0 - smoothstep(250.0, 700.0, dist)); vec2 rq3 = pa * 0.55 + vec2(uTime * 0.25, -uTime * 0.18);
        sl += ((vec2(vnoise(rq3), vnoise(rq3 + 31.0)) - 0.5) * 0.30 + (vec2(vnoise(rq3 * 2.6), vnoise(rq3 * 2.6 + 5.0)) - 0.5) * 0.18 * smoothstep(fp * 2.0, fp * 6.0, 0.7)) * rc / max(calm, 0.3);
        vec3 N = normalize(vec3(-sl.x * calm, 1.0 - sq * calm, -sl.y * calm));
        float cosT = max(dot(N, V), 0.0); float F = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
        F *= mix(1.0, 0.5, nm * (1.0 - smoothstep(30.0, 300.0, dist))); F *= 1.0 - 0.35 * uMurk * (1.0 - nm);   /* wifscene9: silty flood water reflects less sky */   // wifscene6: weaker sky reflection on the murky near water
        // planar reflection with slope-driven distortion and a small blur
        vec4 rp = uReflM * vec4(vWorld, 1.0); vec2 ru = rp.xy / rp.w + N.xz * 0.05 * mix(1.0, 0.45, nm * far);   // wifscene6: steadier far reflection (Levis shore) at Day 56
        float bl = 0.002 + 0.006 * (1.0 - smoothstep(0.0, 80.0, dist));
        vec3 refl = texture2D(uRefl, clamp(ru, 0.002, 0.998)).rgb * 0.4;
        refl += texture2D(uRefl, clamp(ru + vec2(bl, bl * 0.5), 0.002, 0.998)).rgb * 0.15 + texture2D(uRefl, clamp(ru - vec2(bl, bl * 0.5), 0.002, 0.998)).rgb * 0.15;
        refl += texture2D(uRefl, clamp(ru + vec2(-bl * 0.5, bl), 0.002, 0.998)).rgb * 0.15 + texture2D(uRefl, clamp(ru + vec2(bl * 0.5, -bl), 0.002, 0.998)).rgb * 0.15;
        refl *= mix(vec3(1.0), vec3(0.84, 0.9, 0.78), uMurk * (1.0 - nm));   /* wifscene9: silty water greys the sky reflection */
        // murky body: shallow -> deep by extinction, mud near the bottom, big slow colour patches
        float T = exp(-thick * mix(0.85, 4.0, nm)) * (1.0 - 0.4 * nm);   /* wifscene8: no see-through dry-looking deck under thin flood water */ /* wifscene6: flood water over the deck is opaque silt */ float dk = 1.0 - exp(-h * 0.7);
        vec3 body = mix(uShallow, uDeep, dk);
        float pat = vnoise(p * 0.035 + 3.0) * 0.6 + vnoise(p * 0.11 - 5.0) * 0.4;
        body = mix(body, uMud, 0.30 * (1.0 - dk) + 0.12 * pat);
        // wifscene5: darker, bluer body toward the far shore (wide river under a light sky, refs ebuz-pan / Ymblanter)
        body = mix(body, vec3(0.085, 0.135, 0.19), 0.75 * smoothstep(120.0, 1100.0, dist));
        // wifscene6: level 0 river darker grey-blue (ebuz-pan); Day 56: murky green-grey near, darker toward Levis
        body *= mix(0.78, 1.0, nm);
        /* wifscene9: from Day 30 the whole river turns murky green-grey (near) to dark green-grey (far), matching the Day 56 flood colours */
        body = mix(body, mix(vec3(0.115, 0.13, 0.10), vec3(0.06, 0.085, 0.10), smoothstep(250.0, 1400.0, dist)), uMurk * (1.0 - nm));
        body = mix(body, vec3(0.115, 0.13, 0.10), nm * (1.0 - smoothstep(25.0, 260.0, dist)));   /* wifscene8: murky green-grey, was near-black */
        body = mix(body, vec3(0.045, 0.075, 0.105), nm * smoothstep(400.0, 1400.0, dist));
        body *= 0.62 + 0.38 * max(dot(N, normalize(uSun)), 0.0) + 0.06 * pat;
        vec3 H = normalize(normalize(uSun) + V); float spec = pow(max(dot(N, H), 0.0), 260.0) * 1.8 * (1.0 - smoothstep(0.0, 400.0, dist));
        // contact foam: depth band that moves with the level, ragged with noise, plus slow wash lines
        float n1 = vnoise(p * 0.9 + vec2(uTime * 0.12, -uTime * 0.08)), n2 = vnoise(p * 3.3 + vec2(-uTime * 0.2, uTime * 0.15));
        float hh = h + 0.07 * sin((p.x * 1.7 + p.y * 1.1) + uTime * 1.4);
        float band = (0.16 + 0.32 * n1) * mix(1.0, 0.3, nm);   /* wifscene6: deck under 0.36 m must not foam all over */
        float ft = smoothstep(0.30, 0.70, n2 * 0.65 + n1 * 0.5);
        float foam = smoothstep(band, 0.0, hh) * (0.55 + 0.45 * ft); foam *= mix(1.0, 0.35 + smoothstep(0.35, 0.7, vnoise(p * 7.0 + uTime * 0.3)), nm);   /* wifscene6: broken, not a soft glow */
        foam += smoothstep(0.9, 0.05, hh) * smoothstep(0.80, 0.97, 0.5 + 0.5 * sin((hh * 7.0 - uTime * 0.8) + n1 * 4.0)) * 0.4 * ft;
        // wifscene8: on the flooded deck, no depth-band blotches: thin, broken, partly see-through lace advected with the current
        vec2 fadv = p - normalize(uFlow) * uTime * 0.55; float fw = 0.03 + 0.5 * fp;
        float l1 = 1.0 - smoothstep(0.0, fw + 0.02 * n2, abs(vnoise(fadv * 0.8 + vnoise(fadv * 0.3) * 1.7) - 0.5));
        float l2 = 1.0 - smoothstep(0.0, fw, abs(vnoise(fadv * 2.1 + 11.0 + n1) - 0.5));
        float lmsk = smoothstep(0.42, 0.72, vnoise(fadv * 0.21 + 4.0)) * (1.0 - smoothstep(14.0, 45.0, dist));
        float lace = max(l1, 0.6 * l2) * lmsk * smoothstep(0.42, 0.62, vnoise(fadv * 2.6 + 3.0)) * (0.25 + 0.5 * smoothstep(0.3, 0.8, vnoise(fadv * 9.0)));   /* short broken strands, speckled */
        // wifscene10: the strands read as drawn white crescents: instead short separate flecks, stretched along the current, each its own
        // size and opacity, broken by fine noise, drifting with the flow (two offset cell grids); the lace stays only as a faint underlay
        vec2 fl0 = normalize(uFlow), fc0 = vec2(-fl0.y, fl0.x); vec2 fq = vec2(dot(fadv, fl0) * 1.5, dot(fadv, fc0) * 2.6); float fk = 0.0;
        for (int j = 0; j < 2; j++) { vec2 qq = fq + float(j) * vec2(0.5, 0.37); vec2 ci = floor(qq), cf = fract(qq) - 0.5;
          float h = fract(sin(dot(mod(ci, 97.0) + float(j) * 7.1, vec2(12.9898, 78.233))) * 43758.5453), h2 = fract(h * 17.13), h3 = fract(h * 31.7);
          float h4 = fract(h * 7.77), h5 = fract(h * 5.3), fs = 0.55 + 0.7 * h4 * h4;   /* wifscene11: fewer (0.5 -> 0.64), dimmer, own size, length and edge per fleck */
          vec2 c0 = cf - (vec2(h2, h3) - 0.5) * 0.35; float h6 = fract(h * 3.31), h7 = fract(h * 11.9), an = (h7 - 0.5) * 1.3;   /* wifscene12: varied shapes */
          c0 = mat2(cos(an), sin(an), -sin(an), cos(an)) * c0;   /* own tilt */
          vec2 d = c0 / (vec2(0.07 + 0.30 * h2 * h2, 0.05 + 0.07 * h3) * fs);
          d.y += (h6 - 0.5) * 2.2 * d.x * d.x * step(0.33, h6);   /* bent: curved streaks and small crescents */
          float sh = 1.0 - smoothstep(0.25 + 0.4 * h3, 1.0, length(d));
          sh *= mix(1.0, smoothstep(0.15, 0.55, abs(sin(d.x * (2.0 + 2.5 * h7) + h5 * 6.28))), step(0.72, h6));   /* broken into two or three blobs */
          sh *= 0.6 + 0.4 * smoothstep(-0.8, 0.8, d.x * (h5 > 0.5 ? 1.0 : -1.0));   /* brighter head, fading tail */
          fk = max(fk, sh * step(0.64, h) * (0.15 + 0.5 * h5 * h5)); }
        fk *= smoothstep(0.25, 0.6, vnoise(fadv * 7.0 + 5.0)) * smoothstep(0.30, 0.6, vnoise(fadv * 0.35 + 4.0)) * (1.0 - smoothstep(10.0, 40.0, dist));
        foam = mix(foam, max(fk * 0.6, lace * 0.15), nm);   /* wifscene11: 0.75 -> 0.6 */
        // wifscene6: foam rings and short downstream wakes around the posts, lamp bases and the picket line (obstacles from main.js)
        if (nm > 0.01) { float of = 0.0; vec2 fl = normalize(uFlow), fc = vec2(-fl.y, fl.x);
          for (int i = 0; i < 32; i++) { vec3 o = uObs[i]; if (o.z == 0.0) continue; float r = abs(o.z); vec2 dv = p - o.xy; float al = dot(dv, fl), ac = dot(dv, fc);
            float ring = o.z < 0.0 ? smoothstep(0.16 + 0.10 * n2, 0.0, length(dv) - r) * smoothstep(-0.3, 0.6, al + 0.25 * (n2 - 0.5))
              : smoothstep(0.30 + 0.22 * n2, 0.0, length(dv) - r) * (0.55 + 0.45 * smoothstep(-0.5, 0.4, al + 0.3 * (n2 - 0.5))) + smoothstep(0.17, 0.0, length(dv) - r) * 0.65;   /* wifscene12: collar 0.3 -> 0.65, wider */   /* wifscene10: round obstacles (lamp, kiosk, bench legs): wider, all round, a bright collar */   /* wifscene8: thinner on the lamp bases, mostly on the downstream side */
            float wake = smoothstep(0.10 + 0.6 * r, 0.0, abs(ac) - r * 0.8 - 0.04 * max(al, 0.0)) * smoothstep(1.8 + 6.0 * r, 0.0, al) * step(0.0, al) * (0.35 + 0.65 * ft) * step(o.z, 0.0);   /* rail posts only: a lamp-base wake read as a light beam */
            of = max(of, max(ring, wake * 0.45 * smoothstep(0.3, 0.8, n2 + 0.3 * n1)));
            if (o.z < 0.0 && i < 31 && uObs[i + 1].z < 0.0) { vec2 b = uObs[i + 1].xy - o.xy; float lb = dot(b, b);
              if (lb < 6.0) { float t = clamp(dot(dv, b) / lb, 0.0, 1.0); float dl = length(dv - b * t); of = max(of, smoothstep(0.09 + 0.08 * n1, 0.0, dl - 0.02) * (0.45 + 0.55 * ft)); } } }
          of = min(of, 1.0) * (0.62 + 0.38 * smoothstep(0.3, 0.7, vnoise((p - fl * uTime * 0.9) * 4.5)));   /* wifscene12: floor 0.5 -> 0.62 */   /* wifscene10: floor 0.35 -> 0.5 */   /* wifscene8: broken, moving with the flow */
          foam = max(foam, of * nm * (0.95 + 0.05 * n1)); }   /* wifscene12: 0.85 -> 0.95 */   /* wifscene10: 0.7 -> 0.85 */   /* wifscene9: contact foam a little stronger (was 0.55) */
        foam = clamp(foam, 0.0, 1.0);
        vec3 foamCol = uFoam * (0.55 + 0.45 * max(dot(vec3(0.0, 1.0, 0.0), normalize(uSun)), 0.0));
        vec3 rgb = (body * (1.0 - T) * (1.0 - F) + (refl + vec3(1.0, 0.93, 0.78) * spec) * F) * (1.0 - foam) + foamCol * foam;
        float alpha = 1.0 - T * (1.0 - F) * (1.0 - foam);
        float ff = heightFogFactor(uCam, vWorld, uFogDensity);
        ${new URLSearchParams(location.search).get('wdbg') ? 'gl_FragColor = vec4(float(isnan(refl.r + refl.g + refl.b)), float(isnan(body.r + spec + foam)), float(isnan(F + dist + h + T + ff)), 1.0); return;' : ''}
        gl_FragColor = vec4(rgb * (1.0 - ff) + uFogColor * ff * alpha, alpha);
      }`,
  });
  const mesh = new T.Mesh(new T.PlaneGeometry(3000, 3000, 1, 1).rotateX(-Math.PI / 2), mat);
  mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.position.set(0, -1, -400); scene.add(mesh);

  const virt = new T.PerspectiveCamera(); const plane = new T.Plane(); const clip = new T.Vector4(); const q = new T.Vector4();
  const cp = new T.Vector3(), tg = new T.Vector3(), up = new T.Vector3();
  function setLevel(m) { U.uLevel.value = m; mesh.position.y = m; }
  function update(t) { U.uTime.value = t; }
  // call once per frame after the camera has been placed: depth pass, then mirrored reflection pass (shadow map must already be current)
  function prepare() {
    camera.updateMatrixWorld(true); cp.setFromMatrixPosition(camera.matrixWorld); U.uCam.value.copy(cp);
    U.uNear.value = camera.near; U.uFar.value = camera.far; U.uPix.value = 2 * Math.tan(camera.fov * Math.PI / 360) / RH;
    const lv = U.uLevel.value; U.uNearM.value = THREE.MathUtils.smoothstep(4.0 - (cp.y - lv), 0.0, 2.4); /* 1 below 1.6 m eye height, 0 above 4 m */ const prevRT = renderer.getRenderTarget(), prevAuto = renderer.shadowMap.autoUpdate, prevNeeds = renderer.shadowMap.needsUpdate;
    mesh.visible = false;
    // 1) scene depth (no water), shadow map left as is
    renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = prevNeeds; scene.overrideMaterial = depthMat;
    renderer.setRenderTarget(depthRT); renderer.render(scene, camera); scene.overrideMaterial = null;
    // 2) mirrored camera + oblique clip plane at the water level
    tg.set(0, 0, -1).transformDirection(camera.matrixWorld).add(cp); tg.y = 2 * lv - tg.y;
    up.set(0, 1, 0).transformDirection(camera.matrixWorld); up.y = -up.y;
    virt.position.set(cp.x, 2 * lv - cp.y, cp.z); virt.up.copy(up); virt.lookAt(tg); virt.updateMatrixWorld();
    virt.projectionMatrix.copy(camera.projectionMatrix); virt.far = camera.far;
    U.uReflM.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(virt.projectionMatrix).multiply(virt.matrixWorldInverse);
    plane.setFromNormalAndCoplanarPoint(new T.Vector3(0, 1, 0), new T.Vector3(0, lv - 0.02, 0)).applyMatrix4(virt.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const P = virt.projectionMatrix.elements;
    q.x = (Math.sign(clip.x) + P[8]) / P[0]; q.y = (Math.sign(clip.y) + P[9]) / P[5]; q.z = -1.0; q.w = (1.0 + P[10]) / P[14];
    clip.multiplyScalar(2.0 / clip.dot(q)); P[2] = clip.x; P[6] = clip.y; P[10] = clip.z + 1.0; P[14] = clip.w;
    const kids = camera.children.map((c) => c.visible); camera.children.forEach((c) => { c.visible = false; });
    renderer.setRenderTarget(reflRT); renderer.render(scene, virt);
    camera.children.forEach((c, i) => { c.visible = kids[i]; });
    renderer.setRenderTarget(prevRT); renderer.shadowMap.autoUpdate = prevAuto; renderer.shadowMap.needsUpdate = false; mesh.visible = true;
  }
  function setObstacles(list) { U.uObs.value.forEach((v, i) => { const o = list[i]; v.set(o ? o[0] : 0, o ? o[1] : 0, o ? o[2] : 0); }); }
  return { setLevel, update, prepare, setObstacles, mesh, uniforms: U, reflRT, depthRT };
}

// ---- wet band: every MeshStandardMaterial darkens (and gets glossier) below level + band; walls climb higher than ground, ragged edge ----
export function applyWetness(root, U) {
  const seen = new Set();
  root.traverse((o) => {
    const m = o.material; if (!o.isMesh || !m || !m.isMeshStandardMaterial || seen.has(m)) return; seen.add(m);
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uWetLevel = U.uLevel;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWetW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n{ vec4 wp = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\n wp = instanceMatrix * wp;\n#endif\n vWetW = (modelMatrix * wp).xyz; }');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWetW; uniform float uWetLevel;')
        .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 wetC = cross(dFdx(vWetW), dFdy(vWetW)); vec3 wetFn = wetC * inversesqrt(max(dot(wetC, wetC), 1e-20));  float wetVert = 1.0 - smoothstep(0.35, 0.85, abs(wetFn.y));
        float wetBand = mix(0.12, 0.9, wetVert) * (0.75 + 0.5 * fract(sin(dot(floor(vWetW.xz * 1.5), vec2(12.9, 78.2))) * 43758.5));
        float wetAmt = smoothstep(wetBand, 0.0, vWetW.y - uWetLevel - 0.10 * wetVert * sin(vWetW.x * 3.1 + vWetW.z * 2.3));
        diffuseColor.rgb *= mix(1.0, 0.50, wetAmt) * mix(vec3(1.0), vec3(0.92, 1.0, 0.96), wetAmt);`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.30, wetAmt * 0.7);');
    };
  });
}
