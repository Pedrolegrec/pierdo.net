// wifwater1: real water. Planar reflection (mirror camera, half-res HDR target), Gerstner-sum normals (analytic, LOD-faded by pixel
// footprint, calmer near contact), murky grey-green body with exponential extinction, depth-based contact foam from a half-res scene
// depth pass (works for ground, walls, cars, people), height fog shared with post.js. Plus applyWetness(): darker wet band on every
// standard material just above the waterline. Everything is a function of uTime (frame/30) and the level; no Math.random.
import * as THREE from 'three';
import { FOG_COLOR, SUN_DIR } from '../scene/sky.js';
import { FOG, HEIGHT_FOG_GLSL } from '../scene/post.js';

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
    uTime: { value: 0 }, uFOn: { value: 0 }, uGr: { value: 1 }, uSilt: { value: 0 }, uS0: { value: 0 }, uSN: { value: 0 }, uLtop: { value: 0 }, uBaseY: { value: 0 }, uLipG: { value: 0 }, uDeckF: { value: new T.Vector3() }, uB0: { value: new T.Vector3() }, uBN: { value: new T.Vector3() }, uO: { value: new T.Vector2() }, uD: { value: new T.Vector2(1, 0) }, uLevel: { value: -1 }, uCam: { value: new T.Vector3() }, uSun: { value: SUN_DIR }, uFogColor: { value: FOG_COLOR }, uFogDensity: { value: FOG.ext },
    uRefl: { value: reflRT.texture }, uDepth: { value: depthRT.depthTexture }, uReflM: { value: new T.Matrix4() }, uRes: { value: new T.Vector2(RW, RH) },
    uNear: { value: camera.near }, uFar: { value: camera.far }, uPix: { value: 0.001 },
    // wifscene6: uNearM = 1 when the eye is < ~2 m above the water (Day 56 on the terrace); uObs = up to 32 obstacles in the water (x, z, radius;
    // radius < 0 = rail post, chained to the next one by a picket foam line), set from main.js; uFlow = current direction (downstream, NE)
    uNearM: { value: 0 }, uMurk: { value: 0 }, uRip: { value: 0 }, uObs: { value: Array.from({ length: 32 }, () => new T.Vector3(0, 0, 0)) }, uFlow: { value: new T.Vector2(0.6, -0.8) },
    uShallow: { value: new T.Color(0x66765a) }, uDeep: { value: new T.Color(0x22373a) }, uMud: { value: new T.Color(0x6e6447) }, uFoam: { value: new T.Color(0xdfe6e0) },
  };
  const mat = new T.ShaderMaterial({
    transparent: true, depthWrite: true, fog: false,   /* wifdscene11: was false: with no depth write the far water triangles drew over the near bore face in index order (saw-tooth 'folded paper' faces) */ premultipliedAlpha: true, uniforms: U,
    vertexShader: `varying vec3 vWorld; varying float vViewZ; varying float vB, vLip, vSl, vB1;
      // wifdscene7: the returning front as a level field (drawback.js dbFieldLevel is the same formula; keep them in step)
      uniform float uFOn, uGr, uS0, uSN, uLtop, uBaseY, uLipG; uniform vec2 uO, uD; uniform vec3 uB0, uBN;
      float dbDep(float n){ return 15.0 + 15.0 * smoothstep(150.0, 450.0, n) * (1.0 - smoothstep(900.0, 1150.0, n)); }
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vB = 1e4; vLip = 0.0; vSl = 0.0; vB1 = 1e4;
        if (uFOn > 0.5) { vec2 p = w.xz - uO; float s = dot(p, uD), n = dot(p, vec2(-uD.y, uD.x)), dp = dbDep(n), r = sqrt(dp / 15.0);
          /* wifdscene10: three breaking bores (drawback.js dbFieldLevel, keep in step): steep faces over Wf m, roller bump, flat water between */
          vec3 bb = s - (uB0 - (uB0 - uBN) * r); float Wf = 16.0 + 6.0 * (r - 1.0); vec3 up = uGr * vec3(12.0, 12.0, uLtop - uBaseY - 24.0);   /* wifdboat1: faces grow in over 46-47.8 s */
          vec3 fu = clamp(bb / Wf, 0.0, 1.0), cq = (bb - 0.8 * Wf) / 6.0;
          w.y = uBaseY + dot(up, fu * fu * (3.0 - 2.0 * fu)) + dot(0.1 * up * r * r * uLipG, exp(-cq * cq));
          vSl = dot(up, 6.0 * fu * (1.0 - fu) / Wf); vec3 dd = abs(bb - 0.5 * Wf);
          vB = dd.x < dd.y ? (dd.x < dd.z ? bb.x : bb.z) : (dd.y < dd.z ? bb.y : bb.z); vB1 = bb.x; vLip = Wf; }
        vWorld = w.xyz; vec4 v = viewMatrix * w; vViewZ = -v.z; gl_Position = projectionMatrix * v; }`,
    fragmentShader: `
      varying vec3 vWorld; varying float vViewZ;
      uniform sampler2D uRefl, uDepth; uniform mat4 uReflM; uniform vec2 uRes;
      uniform float uFOn, uGr, uSilt, uLtop, uBaseY, uLipG; uniform vec2 uD, uO; uniform vec3 uB0, uBN, uDeckF;
      /* wifdscene11: the bore field per fragment (vB used to be a per-vertex nearest-bore pick: triangles straddling two bores interpolated +40..-40 m and drew a zigzag foam line on the 2 m grid) */
      float dbDep(float n){ return 15.0 + 15.0 * smoothstep(150.0, 450.0, n) * (1.0 - smoothstep(900.0, 1150.0, n)); }
      #define uLevel vWorld.y
      uniform float uTime, uLevelU, uFogDensity, uNear, uFar, uPix, uNearM, uMurk, uRip; uniform vec3 uObs[32]; uniform vec2 uFlow; uniform vec3 uCam, uSun, uFogColor, uShallow, uDeep, uMud, uFoam;
      ${HEIGHT_FOG_GLSL()}
      const vec4 WV[10] = vec4[10](${WAVES.map((w) => `vec4(${f(w.dx)},${f(w.dz)},${f(w.k)},${f(w.s)})`).join(',')});
      const vec2 WS[10] = vec2[10](${WAVES.map((w) => `vec2(${f(w.om)},${f(w.wl)})`).join(',')});
      float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec2 p = vWorld.xz; float vB = 1e4, vLip = 0.0, vSl = 0.0, vB1 = 1e4;
        if (uFOn > 0.5) { vec2 q0 = p - uO; float s0 = dot(q0, uD), n0 = dot(q0, vec2(-uD.y, uD.x)), r0 = sqrt(dbDep(n0) / 15.0);
          vec3 bb = s0 - (uB0 - (uB0 - uBN) * r0); float Wf0 = 16.0 + 6.0 * (r0 - 1.0); vec3 up0 = uGr * vec3(12.0, 12.0, uLtop - uBaseY - 24.0);
          vec3 fu0 = clamp(bb / Wf0, 0.0, 1.0), cq0 = (bb - 0.8 * Wf0) / 6.0, A0 = 0.1 * up0 * r0 * r0 * uLipG;
          vec3 sl3 = up0 * 6.0 * fu0 * (1.0 - fu0) / Wf0 - A0 * exp(-cq0 * cq0) * cq0 / 3.0; vec3 dd0 = abs(bb - 0.5 * Wf0);
          vB = dd0.x < dd0.y ? (dd0.x < dd0.z ? bb.x : bb.z) : (dd0.y < dd0.z ? bb.y : bb.z); vSl = sl3.x + sl3.y + sl3.z; vB1 = bb.x; vLip = Wf0; } vec3 toCam = uCam - vWorld; float dist = length(toCam); vec3 V = toCam / dist;
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
        float chz = 0.0; vec2 fud = normalize(uD), fuc = vec2(-fud.y, fud.x);
        if (uFOn > 0.5 && vB1 > -6.0) {   /* wifdscene8: the returning water is churned: streaks along the upstream flow, slow boils, fine chop */
          chz = smoothstep(-3.0, 4.0, vB1) * mix(1.0, 0.7, smoothstep(60.0, 500.0, vB1)); float fsa = dot(p, fud) + uTime * 6.0, fsc = dot(p, fuc);
          vec2 qs = vec2(fsa * 0.045, fsc * 0.30), qb = p * 0.07 + vec2(uTime * 0.21, -uTime * 0.17), qr = vec2(fsa, fsc) * 0.9 + uTime * 0.6;
          float fineV = smoothstep(fp * 2.0, fp * 6.0, 1.1);
          sl += (fud * (vnoise(qs) - 0.5) * 0.25 + fuc * (vnoise(qs + 19.0) - 0.5) * 0.45) * chz;
          sl += (vec2(vnoise(qb), vnoise(qb + 41.0)) - 0.5) * 0.30 * chz + (vec2(vnoise(qr), vnoise(qr + 7.0)) - 0.5) * 0.28 * chz * fineV;
          float slp = smoothstep(0.03, 0.18, vSl);   /* wifdscene9: the steep surge face churns: rows of standing waves across the slope (fixed in the world), big rolling boils */
          float rowN = vnoise(vec2(fsc * 0.05, dot(p, fud) * 0.02) + 13.0), rowA = dot(p, fud) / 8.0 + 0.5 * rowN + 0.35 * vnoise(vec2(fsc * 0.15, dot(p, fud) * 0.06));
          sl += fud * sin(6.2832 * rowA) * 0.0 * slp * chz * (0.4 + 0.6 * smoothstep(0.3, 0.7, vnoise(vec2(fsc * 0.04, dot(p, fud) * 0.05) + 29.0)));
          vec2 qbb = p * 0.035 + vec2(uTime * 0.12, -uTime * 0.09); sl += (vec2(vnoise(qbb + 5.0), vnoise(qbb + 61.0)) - 0.5) * 0.6 * slp * chz;
          calm = max(calm, chz); }
        if (uFOn > 0.5 && uDeckF.z > 0.0) { vec2 rp = p - uDeckF.xy * uTime * 1.6; float rk = nm * uDeckF.z * (1.0 - smoothstep(0.5, 1.6, h));   /* wifdscene11: small ripples running over the flooded deck */
          sl += ((vec2(vnoise(rp * 2.2), vnoise(rp * 2.2 + 9.0)) - 0.5) * 0.35 + uDeckF.xy * sin(dot(rp, uDeckF.xy) * 5.0 + 2.5 * vnoise(rp * 0.8)) * 0.10) * rk; }
        vec3 N = normalize(vec3(-sl.x * calm, 1.0 - sq * calm, -sl.y * calm));
        if (uFOn > 0.5) N = normalize(vec3(N.x / N.y - fud.x * vSl, 1.0, N.z / N.y - fud.y * vSl));   /* wifdscene8: tilt by the rise slope */
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
        if (uFOn > 0.5) {   // wifdscene8: dark silty WATER (Fresnel sky, glints, churn normals from above); foam only as a narrow lip + torn streaks <25 m behind
          float fsa = dot(p, fud) + uTime * 6.0, fsc = dot(p, fuc), lg = clamp(vLip / 1.0, 0.0, 1.0); foam *= mix(1.0, 0.15 * (1.0 - nm), uGr);   /* wifdboat1: cross-fade from the pre-46 s look */   /* wifdscene11: the engine deck flecks and obstacle rings (coin dots) off; streaks flowing toward/off the edge instead */
          { float dkM = nm * (1.0 - smoothstep(0.5, 1.6, h)) * uDeckF.z; vec2 dfl = uDeckF.xy, dfc = vec2(-dfl.y, dfl.x), dpa = p - dfl * uTime * 1.8;
            /* wifdscene12: isotropic, domain-warped lace (curved isolines) broken into patches and swirls; low contrast; thins as the sheet drains (h, uDeckF.z) */
            vec2 wq = dpa * 1.1; wq += (vec2(vnoise(dpa * 0.3 + 3.1), vnoise(dpa * 0.3 + 17.3)) - 0.5) * 3.2 + (vec2(vnoise(dpa * 1.2 + 8.0), vnoise(dpa * 1.2 + 29.0)) - 0.5) * 0.9;
            float lc = 1.0 - smoothstep(0.0, 0.17, abs(vnoise(wq) - 0.5)), lc2 = 1.0 - smoothstep(0.0, 0.12, abs(vnoise(wq * 2.1 + 5.0) - 0.5));   /* wifdscene13: broad soft lace (no thin lines) */
            float pm = smoothstep(0.45, 0.75, vnoise(dpa * 0.3 + 41.0)) * smoothstep(0.30, 0.60, vnoise(dpa * 0.9 + 5.0)), pt = smoothstep(0.52, 0.90, vnoise(wq * 0.7 + 13.0)) * (0.5 + 0.5 * vnoise(dpa * 1.7 + 2.0));
            foam += (lc * 0.05 + lc2 * 0.03 + pt * 0.13) * pm * (0.6 + 0.4 * vnoise(dpa * 2.3)) * dkM * (0.45 + 0.55 * uDeckF.z); }   /* wifdscene10: no zigzag shore foam on the bed shelf grid; deck foam lines kept */
          float silt = min(1.0, uSilt * smoothstep(-2.0, 10.0, vB1) + smoothstep(0.03, 0.18, vSl) + 0.6 * smoothstep(250.0, 900.0, dist) * step(0.0, vB1)) * uGr;   /* wifdboat1: silt fades in over 46-47.8 s; wifdscene9: the face and the far water are all silty surge, none of the clear-river reflection left */
          float slq = smoothstep(0.03, 0.18, vSl); vec3 mud = vec3(0.20, 0.15, 0.095) * mix(1.0, 0.8, slq) * (0.85 + 0.3 * pat) * (0.8 + 0.4 * vnoise(vec2(fsa * 0.03, fsc * 0.2) + 3.0));
          float Fw = F * mix(0.48, 0.30, chz) * mix(1.0, 0.22, slq) * mix(1.0, 0.4, smoothstep(250.0, 900.0, dist));   /* wifdscene9: little sky on the steep face; far water behind the lip stays dark */ vec3 Hs = normalize(normalize(uSun) + V); float glint = pow(max(dot(N, Hs), 0.0), 140.0) * 2.2 * (1.0 - smoothstep(100.0, 1200.0, dist)) * mix(1.0, 0.25, slq);
          vec3 wcol = mud * (0.6 + 0.4 * max(dot(N, normalize(uSun)), 0.0)) * (1.0 - Fw) + (refl * vec3(0.78, 0.69, 0.54) + vec3(1.0, 0.93, 0.78) * glint) * Fw;
          rgb = mix(rgb, wcol * (1.0 - foam) + foamCol * foam, silt);
          float rag = vnoise(vec2(fsc * 0.10, dot(p, fud) * 0.10) + uTime * 0.35) * 0.65 + vnoise(p * 0.45 + uTime * 0.6) * 0.35;
          float lipW = max(3.0 + 5.0 * rag, 2.2 * fp);   /* a few metres, at least ~1.6 px at distance */
          float lipF = smoothstep(-0.6 - 0.5 * fp, 0.4, vB) * (1.0 - smoothstep(0.35 * lipW, lipW, vB)) * (0.8 + 0.2 * smoothstep(0.3, 0.7, vnoise(p * 1.2 + uTime * 1.5)));
          vec2 qf = vec2(fsa * 0.06, fsc * 0.24);
          float strk = smoothstep(0.56, 0.78, vnoise(qf) * 0.7 + vnoise(qf * 2.7 + 5.0) * 0.3), ptc = smoothstep(0.58, 0.82, vnoise(p * 0.16 + vec2(uTime * 0.3, -uTime * 0.2)));
          float behind = smoothstep(0.5, 3.5, vB) * (1.0 - smoothstep(6.0, 22.0 + 8.0 * rag, vB));
          float tear = max(strk, 0.7 * ptc) * behind * (0.35 + 0.65 * smoothstep(0.35, 0.65, vnoise(vec2(fsa, fsc) * 0.8 - uTime * 0.4)));
          float crest = smoothstep(0.88, 1.0, max(cos(6.2832 * (vB - 3.0) / 18.0), 0.0)) * exp(-vB / 30.0) * smoothstep(6.0, 12.0, vB) * smoothstep(0.4, 0.7, vnoise(p * 0.35 + uTime * 0.5));
          float late = smoothstep(0.64, 0.82, vnoise(p * 0.05 + vec2(uTime * 0.05, 0.0))) * smoothstep(0.45, 0.7, vnoise(vec2(fsa, fsc) * 0.5)) * 0.35 * smoothstep(25.0, 90.0, vB);
          float sfm = smoothstep(0.62, 0.84, vnoise(qf * 0.7 + 11.0) * 0.75 + vnoise(p * 0.08 + vec2(0.0, uTime * 0.1)) * 0.25) * slq * smoothstep(15.0, 40.0, vB) * 0.65;   /* wifdscene9: foam streaks/patches carried on the face, sparse */
          /* wifdscene10: the breaking face is white (foam spilling down it), a soft torn band trails 2-10 m behind the crest, small whitecaps between bores */
          float Wf = vLip, fr = smoothstep(-0.6 - 0.5 * fp, 0.8, vB), xb = vB / max(Wf, 1.0);   /* wifdscene11: roller cap white, foam streaks flowing down the face below it */
          float cap = smoothstep(0.45, 0.80, xb), fw = fsc + (vnoise(vec2(fsc * 0.045, 3.7)) - 0.5) * 18.0 + (vnoise(vec2(fsc * 0.21, vB * 0.05 + 9.0)) - 0.5) * 3.0, fln = mix(0.05, 0.22, vnoise(vec2(fsc * 0.13, 5.0))), fl1 = vnoise(vec2(fw * 0.23, vB * fln + uTime * 0.9)) * 0.55 + vnoise(vec2(fw * 0.83, vB * fln * 3.0 + uTime * 2.1)) * 0.30 + vnoise(vec2(fw * 2.3, vB * 0.6 + uTime * 3.0)) * 0.15, strF = smoothstep(0.32, 0.62, fl1) * mix(0.3, 1.0, smoothstep(0.25, 0.5, vnoise(vec2(fsc * 0.09, vB * 0.04 + 21.0))));   /* wifdscene13: warped spacing, varied length/width, gaps (no comb) */
          float trailE = Wf + 3.0 + 7.0 * smoothstep(0.25, 0.75, vnoise(vec2(fsc * 0.06, 0.0) + uTime * 0.2)) * (0.6 + 0.4 * rag);
          float faceF = fr * (1.0 - smoothstep(Wf, trailE, vB)) * max(cap * (0.88 + 0.12 * strF), mix(0.35, 1.0, strF) * (1.0 - cap));
          float wcS = 0.6 * smoothstep(0.78, 0.95, vnoise(vec2(fsa * 0.25, fsc * 0.6) + vec2(uTime * 0.4, -uTime * 0.3))) * smoothstep(30.0, 60.0, dist) * smoothstep(0.45, 0.7, vnoise(p * 0.06 + 7.0));
          float wc = mix(wcS, 0.06, smoothstep(0.4, 1.6, fp)) * step(0.0, vB1) * (1.0 - nm) * smoothstep(Wf + 8.0, Wf + 20.0, abs(vB)) * 0.75;
          float foam2 = clamp(max(faceF, wc * silt), 0.0, 1.0) * uGr;   /* wifdboat1: no white bars at full strength at 46.0 s */
          rgb = mix(rgb, vec3(0.88, 0.89, 0.85) * (0.42 + 0.50 * max(dot(N, normalize(uSun)), 0.0) + 0.14 * N.y) * (0.9 + 0.1 * strF), foam2);   /* wifdscene11: foam lit by the analytic face normal: rounded faces */ alpha = max(alpha, max(foam2, silt * 0.95)); }
        gl_FragColor = vec4(rgb * (1.0 - ff) + uFogColor * ff * alpha, alpha);
      }`,
  });
  /* wifdscene12: the grid in the river's own axes (local x = downstream RD, az 50 -> rotation.y 40 deg): a bore front (constant s) lies along the grid
     columns instead of cutting the square 2 m cells diagonally (that diagonal cut made the regular saw-tooth teeth; GTAO off did not remove them).
     3400 m (corners of the rotated square still cover the view), 1.25 m across the fronts, 2.5 m along them. */
  const mesh = new T.Mesh(new T.PlaneGeometry(3400, 3400, 2720, 1360).rotateX(-Math.PI / 2), mat); mesh.rotation.y = (90 - 50) * Math.PI / 180; mesh.name = 'water';
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
    const m = o.material; if (!o.isMesh || !m || !m.isMeshStandardMaterial || seen.has(m) || o.name === 'pier-top') return;   // wifdscene11: pier top has its own wet shader seen.add(m);
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uWetLevel = U.uLevel; sh.uniforms.uWetTop = U.uWetTop || { value: -1e4 };   // wifdscene2: drying band (drawback)
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWetW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n{ vec4 wp = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\n wp = instanceMatrix * wp;\n#endif\n vWetW = (modelMatrix * wp).xyz; }');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWetW; uniform float uWetLevel; uniform float uWetTop;')
        .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 wetC = cross(dFdx(vWetW), dFdy(vWetW)); vec3 wetFn = wetC * inversesqrt(max(dot(wetC, wetC), 1e-20));  float wetVert = 1.0 - smoothstep(0.35, 0.85, abs(wetFn.y));
        float wetBand = mix(0.12, 0.9, wetVert) * (0.75 + 0.5 * fract(sin(dot(floor(vWetW.xz * 1.5), vec2(12.9, 78.2))) * 43758.5));
        float wetAmt = smoothstep(wetBand, 0.0, vWetW.y - uWetLevel - 0.10 * wetVert * sin(vWetW.x * 3.1 + vWetW.z * 2.3));
        wetAmt = max(wetAmt, 0.9 * (1.0 - smoothstep(0.0, max(uWetTop - uWetLevel, 0.3), vWetW.y - uWetLevel)) * step(uWetLevel - 0.2, vWetW.y));
        diffuseColor.rgb *= mix(1.0, 0.50, wetAmt) * mix(vec3(1.0), vec3(0.92, 1.0, 0.96), wetAmt);`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.30, wetAmt * 0.7);');
    };
  });
}
