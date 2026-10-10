// dance1 character module: the creature of Mary Shelley's 1818 book (public domain), NOT the 1931 film look.
// Very tall and broad; yellowish skin tinted grey-green; long glossy black hair; pale watery eyes; straight dark lips and white teeth; heavy brow;
// stitched seams on forehead, cheek, neck and wrists; ragged long dark coat over a loose shirt; plain shoes. Everything is built here from primitives
// (ellipsoids and lofted tubes), toon shaded with an inverted-hull outline. No downloaded models, textures or images.
// Interface (a different character only has to provide the same): createCharacter() -> { root, scale, prepare(joints), setFrame(n) }
// joints = scene/dance.js output (performer metres, y up). The limbs are tubes through the joint points of each frame, so there is no skinning.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const Vc = (x, y, z) => new THREE.Vector3(x, y, z);
const AX = Vc(1, 0, 0), AY = Vc(0, 1, 0), AZ = Vc(0, 0, 1);

function toonGradient() {
  const d = new Uint8Array([50, 120, 200, 255]);
  const t = new THREE.DataTexture(d, 4, 1, THREE.RedFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
}
const OUT = new Map();
function outlineMat(w) {
  if (OUT.has(w)) return OUT.get(w);
  const m = new THREE.MeshBasicMaterial({ color: 0x07050a, side: THREE.BackSide });
  m.onBeforeCompile = (s) => { s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', `vec3 transformed = vec3(position) + normalize(normal) * ${w.toFixed(5)};`); };
  m.customProgramCacheKey = () => 'outline' + w; OUT.set(w, m); return m;
}
function ellip(rx, ry, rz) {
  let g = new THREE.SphereGeometry(1, 22, 16); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g, 1e-4);
  g.scale(rx, ry, rz); g.computeVertexNormals(); return g;
}
function addPart(parent, geom, mat, ow, pos, quat) {
  const m = new THREE.Mesh(geom, mat); m.frustumCulled = false; parent.add(m);
  let o = null; if (ow > 0) { o = new THREE.Mesh(geom, outlineMat(ow)); o.frustumCulled = false; parent.add(o); }
  const part = { m, o, set(p, q) { m.position.copy(p); if (q) m.quaternion.copy(q); if (o) { o.position.copy(p); if (q) o.quaternion.copy(q); } }, vis(v) { m.visible = v; if (o) o.visible = v; } };
  if (pos) part.set(pos, quat); return part;
}

// a lofted tube: rings x seg vertices rewritten every frame from ring centres, two in-plane unit vectors (u, v with u x v = direction of travel) and two radii
class Loft {
  constructor(parent, rings, seg, mat, ow, open = false) {
    this.R = rings; this.S = seg; this.open = open; this.SS = seg + (open ? 1 : 0);
    const nv = rings * this.SS + (open ? 0 : 2); this.pos = new Float32Array(nv * 3); const idx = [];
    for (let r = 0; r < rings - 1; r++) for (let s = 0; s < (open ? seg : this.SS); s++) {
      const s1 = open ? s + 1 : (s + 1) % this.SS; const a = r * this.SS + s, b = r * this.SS + s1, c = (r + 1) * this.SS + s, d = (r + 1) * this.SS + s1; idx.push(a, b, c, b, d, c);
    }
    if (!open) { const cs = rings * this.SS, ce = cs + 1, l = (rings - 1) * this.SS; for (let s = 0; s < this.SS; s++) { const s1 = (s + 1) % this.SS; idx.push(cs, s1, s, ce, l + s, l + s1); } }
    this.g = new THREE.BufferGeometry(); this.g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); this.g.setIndex(idx);
    this.g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
    this.m = new THREE.Mesh(this.g, mat); this.m.frustumCulled = false; parent.add(this.m);
    if (ow > 0 && !open) { this.o = new THREE.Mesh(this.g, outlineMat(ow)); this.o.frustumCulled = false; parent.add(this.o); }
    this.th0 = 0; this.th1 = Math.PI * 2;
  }
  ring(r, c, u, v, a, b) {
    for (let s = 0; s < this.SS; s++) {
      const th = this.open ? this.th0 + (this.th1 - this.th0) * s / this.S : this.th1 * s / this.S, co = Math.cos(th) * a, si = Math.sin(th) * b, i = (r * this.SS + s) * 3;
      this.pos[i] = c.x + u.x * co + v.x * si; this.pos[i + 1] = c.y + u.y * co + v.y * si; this.pos[i + 2] = c.z + u.z * co + v.z * si;
    }
  }
  done(cs, ce) {
    if (!this.open) { const i = this.R * this.SS * 3; this.pos[i] = cs.x; this.pos[i + 1] = cs.y; this.pos[i + 2] = cs.z; this.pos[i + 3] = ce.x; this.pos[i + 4] = ce.y; this.pos[i + 5] = ce.z; }
    this.g.attributes.position.needsUpdate = true; this.g.computeVertexNormals(); this.g.attributes.normal.needsUpdate = true;
  }
  // tube along a curve through points, parallel-transport frames, radius profile rad(t) -> [a, b]; u0 = initial lateral hint
  along(pts, t0, t1, rad, u0) {
    const cv = new THREE.CatmullRomCurve3(pts, false, 'centripetal'); let u = (u0 || AX).clone(); let first = null, last = null;
    for (let i = 0; i < this.R; i++) {
      const t = t0 + (t1 - t0) * i / (this.R - 1), p = cv.getPoint(t), T = cv.getTangent(t).normalize();
      u.addScaledVector(T, -u.dot(T)); if (u.lengthSq() < 1e-6) u.copy(AZ).addScaledVector(T, -AZ.dot(T)); u.normalize();
      const v = new THREE.Vector3().crossVectors(T, u); const [a, b] = rad(t, i); this.ring(i, p, u, v, a, b); if (i === 0) first = p.clone(); last = p;
    }
    this.done(first, last);
  }
}

export function createCharacter() {
  const SCALE = 1.30;                    // very tall and broad: about 2.35 m
  const root = new THREE.Group(); root.scale.setScalar(SCALE);
  const grad = toonGradient();
  // v2: a thin fresnel rim in cool blue on every body material, so the outline separates from the dark night background
  const rimify = (m, k) => { m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `outgoingLight += vec3(0.28, 0.58, 1.0) * ${k.toFixed(3)} * pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.4);\n#include <opaque_fragment>`); }; m.customProgramCacheKey = () => 'rim' + k; return m; };
  const toon = (c, extra = {}, rk = 0) => { const m = new THREE.MeshToonMaterial(Object.assign({ color: c, gradientMap: grad }, extra)); return rk ? rimify(m, rk) : m; };
  const M = {
    skin: toon(0xa4b27c, {}, 0.16), skinShade: toon(0x686843), lip: toon(0x100a10), eye: toon(0xf0eed0, { emissive: 0x77753f }), iris: toon(0xd9d49c, { emissive: 0x4a4828 }), pupil: toon(0x1b1b13),
    hair: rimify(new THREE.MeshPhongMaterial({ color: 0x07060c, specular: 0x2a3050, shininess: 22 }), 0.25),
    hairCap: rimify(new THREE.MeshPhongMaterial({ color: 0x07060c, specular: 0x2a3050, shininess: 26 }), 0.25), part: toon(0x8a9468),
    coat: toon(0x3b3128, {}, 0.24), coatIn: toon(0x2a2119, { side: THREE.DoubleSide }, 0.15), shirt: toon(0xa8ab98), pants: toon(0x26252a, {}, 0.24), shoe: toon(0x4a3a30, {}, 0.15), stitch: new THREE.MeshBasicMaterial({ color: 0x120a10 }),
  };
  const capsule = (r, len) => new THREE.CapsuleGeometry(r, len, 4, 8);
  const P = {};   // all parts
  // ---- head (local frame: +x the creature's left, +y up, +z forward) ----
  const HS = 1.12; const headG = new THREE.Group(); headG.scale.setScalar(HS); root.add(headG);
  const hp = (name, g, mat, ow, x, y, z, q) => { P[name] = addPart(headG, g, mat, ow, Vc(x, y, z), q); return P[name]; };
  hp('skull', ellip(0.100, 0.138, 0.112), M.skin, 0.005, 0, 0.012, 0);
  hp('jaw', ellip(0.090, 0.078, 0.096), M.skin, 0.005, 0, -0.085, 0.022);
  hp('chin', ellip(0.054, 0.042, 0.05), M.skin, 0.004, 0, -0.130, 0.068);
  hp('brow', ellip(0.092, 0.022, 0.040), M.skin, 0.004, 0, 0.040, 0.082);
  hp('nose', ellip(0.018, 0.044, 0.026), M.skin, 0.003, 0, -0.022, 0.108, new THREE.Quaternion().setFromAxisAngle(AX, -0.22));
  hp('noseTip', ellip(0.022, 0.015, 0.022), M.skin, 0.003, 0, -0.060, 0.122);
  for (const sx of [-1, 1]) {
    hp('cheek' + sx, ellip(0.024, 0.018, 0.02), M.skin, 0.003, sx * 0.066, -0.040, 0.074);
    hp('socket' + sx, ellip(0.037, 0.026, 0.016), M.skinShade, 0, sx * 0.040, 0.010, 0.091);      // dun sockets
    hp('eye' + sx, ellip(0.026, 0.019, 0.017), M.eye, 0, sx * 0.040, 0.006, 0.096);                 // watery, pale yellow-white
    hp('iris' + sx, ellip(0.0125, 0.0125, 0.006), M.iris, 0, sx * 0.040, 0.004, 0.110);
    hp('pupil' + sx, ellip(0.0052, 0.0052, 0.004), M.pupil, 0, sx * 0.040, 0.004, 0.1155);
    hp('lid' + sx, ellip(0.029, 0.0145, 0.022), M.skinShade, 0.003, sx * 0.040, 0.0245, 0.097, new THREE.Quaternion().setFromAxisAngle(AZ, sx * 0.1));
    hp('ear' + sx, ellip(0.012, 0.032, 0.02), M.skin, 0.003, sx * 0.102, -0.010, -0.004);
  }
  hp('lipU', ellip(0.050, 0.0085, 0.014), M.lip, 0.002, 0, -0.1055, 0.112);                         // straight black lips
  hp('lipL', ellip(0.044, 0.0085, 0.014), M.lip, 0.002, 0, -0.1245, 0.105);
  hp('hairCap', ellip(0.104, 0.10, 0.12), M.hairCap, 0.004, 0, 0.06, -0.03);
  const capY = (x, z) => 0.06 + 0.10 * Math.sqrt(Math.max(0.01, 1 - (x / 0.104) ** 2 - ((z + 0.03) / 0.12) ** 2));   // cap surface height
  for (let i = 0; i < 9; i++) { const z = 0.055 - i * 0.0185, y = capY(0, z), y2 = capY(0, z - 0.01), q = new THREE.Quaternion().setFromUnitVectors(AZ, Vc(0, y - y2, 0.01).normalize()); hp('part' + i, new THREE.BoxGeometry(0.0062, 0.0026, 0.0215), M.part, 0, 0, y + 0.0016, z, q); }
  // scars: a thin dark line with short cross-stitches (forehead, cheek); surface depth from the skull and jaw ellipsoids
  const skullZ = (x, y) => 0.112 * Math.sqrt(Math.max(0.02, 1 - (x / 0.100) ** 2 - ((y - 0.012) / 0.138) ** 2));
  const jawZ = (x, y) => { const f = 1 - (x / 0.09) ** 2 - ((y + 0.085) / 0.078) ** 2; return f > 0 ? 0.022 + 0.096 * Math.sqrt(f) : 0; };
  const faceZ = (x, y) => Math.max(skullZ(x, y), jawZ(x, y));
  const seam = (name, p0, p1, n, len, zoff) => {
    const d = Vc(p1[0] - p0[0], p1[1] - p0[1], 0); const L = d.length(); d.normalize(); const nrm = Vc(-d.y, d.x, 0);
    for (let i = 0; i <= n; i++) {
      const x = p0[0] + d.x * L * i / n, y = p0[1] + d.y * L * i / n, z = faceZ(x, y) + zoff;
      P[name + i] = addPart(headG, new THREE.BoxGeometry(0.0048, len, 0.003), M.stitch, 0, Vc(x, y, z), new THREE.Quaternion().setFromUnitVectors(AY, nrm));
    }
    const mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
    P[name + 'line'] = addPart(headG, new THREE.BoxGeometry(L, 0.0034, 0.003), M.stitch, 0, Vc(mid[0], mid[1], faceZ(mid[0], mid[1]) + zoff), new THREE.Quaternion().setFromUnitVectors(AX, d));
  };
  seam('fh', [-0.062, 0.088], [-0.016, 0.050], 5, 0.020, 0.004);     // a short diagonal scar on the forehead (not a band)
  seam('ck', [0.044, -0.018], [0.068, -0.078], 5, 0.020, 0.0045);    // one cheek
  // ---- hair locks (simulated in prepare) ----
  const NS = 36, NR = 28, NP = 8, LSEG = 0.060;
  const strands = []; for (let i = 0; i < NS; i++) {
    if (i >= NR) {   // v3: locks rooted along the centre part: they fall from the crown over the cap edge, so the cap rim is never visible
      const m = i - NR, sd = m % 2 ? 1 : -1, zk = 0.0 - 0.0155 * Math.floor(m / 2) * 1.35, xk = sd * (0.012 + 0.003 * (m % 3)), yk = 0.06 + 0.10 * Math.sqrt(Math.max(0.01, 1 - (xk / 0.104) ** 2 - ((zk + 0.03) / 0.12) ** 2));
      strands.push({ rootL: Vc(xk, yk + 0.004, zk), out: Vc(sd, 0.1, -0.25).normalize(), side: sd, ks: 0.9 + 0.2 * ((i * 0.61) % 1), len: LSEG * (1.0 + 0.1 * (m % 3)), loft: new Loft(root, 16, 6, M.hair, 0.003) }); continue;
    }
    const phi = -1.8 + 3.6 * i / (NR - 1), j = (i * 0.37) % 1;
    const rootL = Vc(Math.sin(phi) * 0.106, 0.012 + 0.085 * j, -Math.cos(phi) * 0.112 + 0.012);
    const out = Vc(Math.sin(phi), 0, -Math.cos(phi) * 0.6).normalize();
    strands.push({ rootL, out, side: i < NR / 2 ? -1 : 1, ks: 0.75 + 0.5 * ((i * 0.61) % 1), len: LSEG * (0.9 + 0.35 * Math.abs(Math.cos(phi * 0.8))), loft: new Loft(root, 16, 6, M.hair, 0.003) });
  }
  // ---- body ----
  const torso = new Loft(root, 8, 22, M.coat, 0.006);
  const neck = new Loft(root, 4, 14, M.skin, 0.004);
  const skirt = new Loft(root, 5, 22, M.coatIn, 0, true); skirt.th0 = Math.PI * 0.90; skirt.th1 = Math.PI * 2.10;
  const shirtG = new THREE.BufferGeometry(); shirtG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  const shirt = new THREE.Mesh(shirtG, M.shirt.clone()); shirt.material.side = THREE.DoubleSide; shirt.frustumCulled = false; root.add(shirt);
  const arms = {}, legs = {}, hands = {}, shoes = {}, wrists = {}, wline = {};
  const FL = [[0.052, 0.044], [0.058, 0.048], [0.054, 0.046], [0.042, 0.036]];       // index, middle, ring, pinky: proximal, distal (joint to joint)
  for (const s of ['l', 'r']) {
    arms[s] = { sleeve: new Loft(root, 10, 12, M.coat, 0.004), skin: new Loft(root, 3, 10, M.skin, 0.003), ball: addPart(root, ellip(0.094, 0.09, 0.09), M.coat, 0.004) };
    legs[s] = new Loft(root, 10, 12, M.pants, 0.004);
    // a large simple hand: palm, four fingers (2 capsules each) and a thumb (2 capsules)
    hands[s] = { palm: addPart(root, ellip(0.047, 0.021, 0.052), M.skin, 0.003), fing: FL.map((L, i) => L.map((l, k) => addPart(root, capsule((0.0108 - 0.0006 * i) * (k ? 0.92 : 1), l), M.skin, 0.0022))), thumb: [addPart(root, capsule(0.0128, 0.042), M.skin, 0.0022), addPart(root, capsule(0.0118, 0.036), M.skin, 0.0022)] };
    shoes[s] = { top: addPart(root, ellip(0.066, 0.054, 0.155), M.shoe, 0.004), sole: addPart(root, ellip(0.068, 0.015, 0.16), M.stitch, 0) };
    wrists[s] = []; for (let i = 0; i < 6; i++) wrists[s].push(addPart(root, new THREE.BoxGeometry(0.0034, 0.018, 0.003), M.stitch, 0));
    wline[s] = []; for (let i = 0; i < 16; i++) wline[s].push(addPart(root, new THREE.BoxGeometry(0.0225, 0.0032, 0.003), M.stitch, 0));
  }
  const neckT = []; for (let i = 0; i < 14; i++) neckT.push(addPart(root, new THREE.BoxGeometry(0.0048, 0.028, 0.003), M.stitch, 0));
  const neckLine = []; for (let i = 0; i < 24; i++) neckLine.push(addPart(root, new THREE.BoxGeometry(0.0225, 0.0034, 0.003), M.stitch, 0));
  let hair = [], hem = [], curl = { l: [], r: [] };

  const ease = (x) => x * x * (3 - 2 * x);
  const tmpQ = new THREE.Quaternion();
  const ax = (q, a) => a.clone().applyQuaternion(q);
  // closest point on segment ab to p; pushes p out of the capsule (radius r) when inside
  function pushOut(p, a, b, r) {
    const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / (ab.lengthSq() || 1))), c = a.clone().addScaledVector(ab, t), d = p.clone().sub(c), l = d.length();
    if (l < r) { if (l < 1e-6) d.set(0, 0, 1); p.copy(c).addScaledVector(d.normalize(), r); return true; } return false;
  }
  const armSegs = (J) => [[J.lSho, J.lElb, 0.098], [J.lElb, J.lWri, 0.074], [J.rSho, J.rElb, 0.098], [J.rElb, J.rWri, 0.074]];

  // dancetoy1: the hair/coat simulation split into steps so it can run one frame at a time (live mode, loops) as well as over a whole dance
  let st = null, hpp = null; const hv = new THREE.Vector3(); const qInv = new THREE.Quaternion();
  function initHair(j0) {
    st = strands.map((s) => {  const r = s.rootL.clone().multiplyScalar(HS).applyQuaternion(j0.qHead).add(j0.head); const pts = []; for (let k = 0; k < NP; k++) pts.push(r.clone().addScaledVector(AY, -k * s.len * 0.95)); return { p: pts, q: pts.map((p) => p.clone()) }; });
    hpp = null; hv.set(0, 0, 0);
  }
  function hairStep(J, prevJ) {
      const frame = [], arms4 = armSegs(J); qInv.copy(J.qHead).invert(); J.headDown = ax(J.qHead, AZ).y < -0.12;
      const angSp = prevJ ? J.qHead.angleTo(prevJ.qHead) : 0, iters = angSp > 0.07 ? 6 : 4;   // v3: more constraint passes when the head turns fast
      st.forEach((s, i) => {
        const S = strands[i], r = S.rootL.clone().multiplyScalar(HS).applyQuaternion(J.qHead).add(J.head), out = S.out.clone().applyQuaternion(J.qHead);
        s.p[0].copy(r); s.q[0].copy(r);
        for (let k = 1; k < NP; k++) {
          const p = s.p[k], q = s.q[k], v = p.clone().sub(q).multiplyScalar(0.88); q.copy(p);
          p.add(v); p.y -= 0.0075;
          const rest = r.clone().addScaledVector(out, 0.03 * k * 0.6).addScaledVector(AY, -k * S.len * 0.95); p.lerp(rest, 0.05 * S.ks * (1.15 - 0.08 * k));
          const stp = p.clone().sub(q); if (stp.length() > 0.05) p.copy(q).addScaledVector(stp, 0.05 / stp.length());   // v3: per-frame step clamp (m)
        }
        for (let it = 0; it < iters; it++) {
          for (let k = 1; k < NP; k++) { const d = s.p[k].clone().sub(s.p[k - 1]); const l = d.length() || 1e-6; s.p[k].copy(s.p[k - 1]).addScaledVector(d, S.len / l); }
          for (let k = 2; k < NP; k++) {   // shoulders and chest: push out of the torso ellipsoid so hair drapes over the coat
            const c = J.shC.clone().addScaledVector(AY, -0.12), l = s.p[k].clone().sub(c).applyQuaternion(tmpQ.copy(J.qTorso).invert()); const f = Math.hypot(l.x / 0.34, l.y / 0.24, l.z / 0.20);
            if (f < 1) { l.divideScalar(Math.max(f, 0.2)); s.p[k].copy(l.applyQuaternion(J.qTorso).add(c)); }
          }
          for (let k = 2; k < NP; k++) for (const [a, b, rr] of arms4) pushOut(s.p[k], a, b, rr);   // arms push the hair out
          for (let k = 1; k < NP; k++) {   // keep the face clear: in front of the face, hair is parted to the sides (never a curtain over it)
            const l = s.p[k].clone().sub(J.head).applyQuaternion(qInv).divideScalar(HS);
            if (l.z > 0.01 && l.y > -0.17 && Math.abs(l.x) < 0.125) { l.x = (Math.abs(l.x) > 0.02 ? Math.sign(l.x) : S.side) * 0.125; s.p[k].copy(l.multiplyScalar(HS).applyQuaternion(J.qHead).add(J.head)); }   // v3: the face slab always applies
            else {   // v3: locks rest on the cap instead of passing through the skull (cap ellipsoid, inflated)
              const e = Math.hypot(l.x / 0.112, (l.y - 0.06) / 0.108, (l.z + 0.03) / 0.128);
              if (e < 1) { l.x = l.x / Math.max(e, 0.35); l.z = (l.z + 0.03) / Math.max(e, 0.35) - 0.03; l.y = 0.06 + (l.y - 0.06) / Math.max(e, 0.35); s.p[k].copy(l.multiplyScalar(HS).applyQuaternion(J.qHead).add(J.head)); }
            }
          }
        }
        for (let k = 1; k < NP; k++) if (s.p[k].y > r.y + 0.03) s.p[k].y = r.y + 0.03;   // a fast squat must not throw the hair up over the head
        frame.push(s.p.map((p) => p.clone()));
      });
      return frame;
  }
  function hemStep(J) {
      const tgt = J.hipC.clone().add(Vc(0, -0.72, 0)); const km = J.lKnee.clone().add(J.rKnee).multiplyScalar(0.5).add(Vc(0, 0.1, 0));
      const target = tgt.lerp(km, 0.4);
      if (!hpp) hpp = target.clone();
      hv.multiplyScalar(0.84).addScaledVector(target.clone().sub(hpp), 0.10); hpp.add(hv);
      return hpp.clone().sub(target).clampLength(0, 0.40);
  }
  function prepare(Jf) {
    const N = Jf.length;
    initHair(Jf[0]);
    hair = []; for (let n = 0; n < N; n++) hair.push(hairStep(Jf[n], n ? Jf[n - 1] : null));
    hem = []; for (let n = 0; n < N; n++) hem.push(hemStep(Jf[n]));
    // finger curl: relaxed and curled when the hand is slow, more open when it flicks (smoothed over 7 frames)
    for (const s of ['l', 'r']) {
      const w = Jf.map((J) => J[s + 'Wri']), sp = w.map((p, i) => p.distanceTo(w[Math.min(N - 1, i + 1)]) * 0.5 + p.distanceTo(w[Math.max(0, i - 1)]) * 0.5);
      const raw = sp.map((v) => 0.12 + 0.55 * (1 - ease(Math.max(0, Math.min(1, (v - 0.010) / 0.035)))));
      curl[s] = raw.map((_, i) => { let a = 0; for (let d = -3; d <= 3; d++) a += raw[Math.min(N - 1, Math.max(0, i + d))]; return a / 7; });
    }
  }

  function seg(part, a, b, r) { const d = b.clone().sub(a); const l = d.length() || 1e-6; part.set(a.clone().addScaledVector(d, 0.5), new THREE.Quaternion().setFromUnitVectors(AY, d.divideScalar(l))); }

  function setFrame(n) {
    const J = prep.J[n];
    // head
    headG.position.copy(J.head); headG.quaternion.copy(J.qHead);
    // hair locks
    strands.forEach((S, i) => {
      const pts = hair[n][i]; const lat = ax(J.qHead, AX); const taper = (t, k) => { const w = 0.024 * (1 - 0.6 * t); return [w * 1.6, w * 0.8]; };
      S.loft.along(pts, 0, 1, (t, k) => taper(t, k), lat);
    });
    // torso, neck, coat
    const prof = [[0, 0.235, 0.145], [0.22, 0.225, 0.135], [0.48, 0.28, 0.155], [0.76, 0.335, 0.17], [0.93, 0.355, 0.15], [1.02, 0.26, 0.12], [1.1, 0.12, 0.095], [1.16, 0.075, 0.075]];
    const cs = J.hipC.clone(), ce = J.shC.clone().addScaledVector(AY, 0.0);
    const spine = J.shC.clone().sub(J.hipC);
    prof.forEach(([s, a, b], r) => {
      const q = tmpQ.copy(J.qPelvis).slerp(J.qTorso, ease(Math.min(1, s)));
      const c = J.hipC.clone().addScaledVector(spine, s).addScaledVector(AZ.clone().applyQuaternion(q), 0.012 * Math.sin(s * 3));
      torso.ring(r, c, ax(q, AX), ax(q, AZ).negate(), a, b);
      if (r === 0) cs.copy(c); if (r === prof.length - 1) ce.copy(c);
    });
    torso.done(cs, ce);
    neck.along([J.shC.clone().addScaledVector(AY, 0.0), J.shC.clone().lerp(J.head, 0.5), J.head.clone().addScaledVector(ax(J.qHead, AY), -0.10)], 0, 1, (t) => [0.074, 0.070], ax(J.qHead, AX));
    // coat skirt (open at the front): each ring is centred between the two legs and wide enough to contain both, so it follows hips and legs
    {
      const q = J.qPelvis, u = ax(q, AX), v = ax(q, AZ);
      const legPt = (s, f) => { const hip = J[s + 'Hip'], kn = J[s + 'Knee'], an = J[s + 'Ank'], dK = kn.distanceTo(hip), dA = an.distanceTo(kn), d = f * (dK + dA); return d < dK ? hip.clone().lerp(kn, d / dK) : kn.clone().lerp(an, (d - dK) / dA); };
      const waist = J.hipC.clone().addScaledVector(AY, 0.045);
      for (let r = 0; r < 5; r++) {
        const t = r / 4, f = 0.05 + t * 0.80, Lp = legPt('l', f), Rp = legPt('r', f), rl = 0.108 - 0.040 * f;
        const c = r === 0 ? waist.clone() : Lp.clone().add(Rp).multiplyScalar(0.5).addScaledVector(AY, 0.0).add(hem[n].clone().multiplyScalar(t * t));
        if (r === 0) c.add(Lp.clone().add(Rp).multiplyScalar(0.5).sub(J.hipC).setY(0).multiplyScalar(0.5));
        let a = 0.22 + 0.04 * t, b = 0.15 + 0.03 * t;
        for (const P0 of [Lp, Rp]) { const d = P0.clone().sub(c); a = Math.max(a, Math.abs(d.dot(u)) + rl + 0.035 + 0.02 * t); b = Math.max(b, Math.abs(d.dot(v)) + rl + 0.035 + 0.02 * t); }
        skirt.ring(r, c, u, v, a, b);
      }
      // ragged hem: alternate vertex heights in the last ring
      for (let s = 0; s < skirt.SS; s++) { const i = ((4 * skirt.SS) + s) * 3 + 1; skirt.pos[i] -= (s % 2 ? 0.10 : 0) + 0.025 * Math.sin(s * 2.3 + 1); }
      // arms push the coat out
      const a4 = armSegs(J), pv = new THREE.Vector3();
      for (let i = 0; i < skirt.R * skirt.SS; i++) { pv.set(skirt.pos[i * 3], skirt.pos[i * 3 + 1], skirt.pos[i * 3 + 2]); let hit = false; for (const [a, b, rr] of a4) hit = pushOut(pv, a, b, rr + 0.015) || hit; if (hit) { skirt.pos[i * 3] = pv.x; skirt.pos[i * 3 + 1] = pv.y; skirt.pos[i * 3 + 2] = pv.z; } }
      skirt.done();
    }
    // shirt V
    {
      const q = tmpQ.copy(J.qPelvis).slerp(J.qTorso, 0.85), c = J.hipC.clone().addScaledVector(spine, 0.66);
      const pts = [Vc(-0.05, 0.21, 0.172), Vc(0.05, 0.21, 0.172), Vc(0, -0.1, 0.18)].map((p) => p.applyQuaternion(q).add(c));
      const a = shirtG.attributes.position; pts.forEach((p, i) => a.setXYZ(i, p.x, p.y, p.z)); a.needsUpdate = true; shirtG.computeVertexNormals();
    }
    // neck stitches: a ring of cross-stitches with a thin line
    {
      const q = J.qHead, base = J.shC.clone().lerp(J.head, 0.42), upv = ax(q, AY), fw = ax(q, AZ), lt = ax(q, AX);
      const place = (arr, rad) => arr.forEach((p, i) => { const th = i / arr.length * Math.PI * 2, d = lt.clone().multiplyScalar(Math.cos(th)).addScaledVector(fw, Math.sin(th)); const m = new THREE.Matrix4().makeBasis(upv.clone().cross(d), upv, d); p.set(base.clone().addScaledVector(d, rad), new THREE.Quaternion().setFromRotationMatrix(m)); });
      place(neckT, 0.0745); place(neckLine, 0.0745);
    }
    // arms and hands
    for (const s of ['l', 'r']) {
      const sho = J[s + 'Sho'], elb = J[s + 'Elb'], wri = J[s + 'Wri'], hd = J[s + 'HandDir'].clone().normalize();
      const A = arms[s]; const lat0 = ax(J.qTorso, AX);
      A.ball.set(sho, null);
      A.sleeve.along([sho, elb, wri], 0, 0.88, (t, i) => { const r = 0.088 - 0.024 * Math.min(1, t * 1.1) + (t > 0.7 ? 0.010 : 0); return [r, r]; }, lat0);
      A.skin.along([sho, elb, wri], 0.86, 1.0, () => [0.053, 0.053], lat0);
      // hand axes: z = along the hand, side = toward the thumb, nrm = the palm's face (fingers curl toward it)
      const sd = J[s + 'HandSide'].clone(); sd.addScaledVector(hd, -sd.dot(hd)); if (sd.lengthSq() < 1e-4) sd.copy(ax(J.qTorso, AZ)).addScaledVector(hd, -ax(J.qTorso, AZ).dot(hd)); sd.normalize();
      const nrm = s === 'l' ? new THREE.Vector3().crossVectors(hd, sd) : new THREE.Vector3().crossVectors(sd, hd);
      const hq = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(s === 'l' ? sd : sd.clone().negate(), nrm, hd));
      hands[s].palm.set(wri.clone().addScaledVector(hd, 0.050), hq);
      const cu = curl[s][n], base = wri.clone().addScaledVector(hd, 0.088);
      FL.forEach((L, i) => {
        const off = (0.033 - 0.022 * i), c1 = cu * (0.8 + 0.15 * i), c2 = c1 * 0.95 + 0.12;
        const p0 = base.clone().addScaledVector(sd, off).addScaledVector(nrm, -0.002);
        const d1 = hd.clone().multiplyScalar(Math.cos(c1)).addScaledVector(nrm, Math.sin(c1)).addScaledVector(sd, off * 0.9).normalize(), p1 = p0.clone().addScaledVector(d1, L[0]);
        const d2 = hd.clone().multiplyScalar(Math.cos(c1 + c2)).addScaledVector(nrm, Math.sin(c1 + c2)).addScaledVector(sd, off * 0.6).normalize(), p2 = p1.clone().addScaledVector(d2, L[1]);
        seg(hands[s].fing[i][0], p0, p1); seg(hands[s].fing[i][1], p1, p2);
      });
      { const t0 = wri.clone().addScaledVector(hd, 0.030).addScaledVector(sd, 0.040).addScaledVector(nrm, 0.004), c = cu * 0.7;
        const t1d = hd.clone().multiplyScalar(0.62).addScaledVector(sd, 0.72).addScaledVector(nrm, 0.22 + 0.5 * c).normalize(), t1 = t0.clone().addScaledVector(t1d, 0.042);
        const t2d = hd.clone().multiplyScalar(0.85).addScaledVector(sd, 0.35).addScaledVector(nrm, 0.30 + 0.7 * c).normalize(), t2 = t1.clone().addScaledVector(t2d, 0.036);
        seg(hands[s].thumb[0], t0, t1); seg(hands[s].thumb[1], t1, t2); }
      // wrist scar: ring of cross-stitches and a thin line
      const fd = wri.clone().sub(elb).normalize(); const p0 = wri.clone().addScaledVector(fd, -0.014); const e1 = new THREE.Vector3().crossVectors(fd, ax(J.qTorso, AZ)).normalize(); const e2 = new THREE.Vector3().crossVectors(fd, e1).normalize();
      for (const [arr, rad, tick] of [[wrists[s], 0.0535, true], [wline[s], 0.0535, false]]) arr.forEach((p, i) => { const th = i / arr.length * Math.PI * 2, d = e1.clone().multiplyScalar(Math.cos(th)).addScaledVector(e2, Math.sin(th)); const tg = fd.clone().cross(d); p.set(p0.clone().addScaledVector(d, rad), new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(tg, fd, d))); });
      // leg and shoe
      const hip = J[s + 'Hip'], kn = J[s + 'Knee'], an = J[s + 'Ank'], he = J[s + 'Heel'], to = J[s + 'Toe'];
      legs[s].along([hip, kn, an], 0, 1, (t) => { const r = 0.108 - 0.042 * t - (t > 0.5 ? 0.004 : 0); return [r, r]; }, AX);
      const fdir = to.clone().sub(he).normalize();
      const sq2 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(fdir.clone(), Vc(0, 0, 0), AY));
      const mid = he.clone().lerp(to, 0.52);
      shoes[s].top.set(mid.clone().add(Vc(0, 0.022, 0)), sq2); shoes[s].sole.set(mid.clone().add(Vc(0, -0.028, 0)), sq2);
    }
  }
  const prep = { J: null };
  const liveApi = {
    begin(J0) { prep.J = [J0]; initHair(J0); hair = [hairStep(J0, null)]; hem = [hemStep(J0)]; curl = { l: [0.3], r: [0.3] }; setFrame(0); },
    frame(J, prevJ, sim) {   // sim: advance hair, coat and finger curl by one 30 Hz step
      prep.J[0] = J;
      if (sim) {
        hair[0] = hairStep(J, prevJ); hem[0] = hemStep(J);
        for (const s of ['l', 'r']) { const v = J[s + 'Wri'].distanceTo(prevJ[s + 'Wri']); const raw = 0.12 + 0.55 * (1 - ease(Math.max(0, Math.min(1, (v - 0.010) / 0.035)))); curl[s][0] += (raw - curl[s][0]) * 0.28; }
      }
      setFrame(0);
    },
  };
  return { root, scale: SCALE, live: liveApi, prepare(J) { prep.J = J; prepare(J); }, setFrame, headWorld: (n) => prep.J[Math.min(Math.max(n, 0), prep.J.length - 1)].head.clone().multiplyScalar(SCALE) };
}
