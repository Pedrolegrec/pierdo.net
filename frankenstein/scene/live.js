// Live mode: the visitor's MediaPipe pose landmarks (world metres) -> the creature's joints J, through the same bone-direction retargeting the
// dance uses (dance.js loadDance): directions come from the landmarks, bone lengths from P, so limbs never stretch. A One Euro filter smooths each
// coordinate. Mirrored like a mirror: the visitor's right hand is the creature's hand on the screen's right.
import * as THREE from 'three';
import { P } from './dance.js';
import { OneEuro } from './oneeuro.js';

const MIRROR = [0, 4, 5, 6, 1, 2, 3, 8, 7, 10, 9, 12, 11, 14, 13, 16, 15, 18, 17, 20, 19, 22, 21, 24, 23, 26, 25, 28, 27, 30, 29, 32, 31];
const V = (a) => new THREE.Vector3(a[0], -a[1], -a[2]);      // MediaPipe world (x right, y down, z away) -> three (x right, y up, z toward camera)
const dirv = (a, b) => b.clone().sub(a).normalize();
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
function frameQuat(x, up) {   // same as dance.js: basis from a lateral axis and an up hint; forward = x cross up
  const X = x.clone().normalize(); const U = up.clone().sub(X.clone().multiplyScalar(up.dot(X))).normalize(); const F = new THREE.Vector3().crossVectors(X, U).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, U, F));
}

// A standing person in MediaPipe world coordinates (hip origin, y down, z away), swaying a little: what he does when nobody is in view.
export function idleLandmarks(t, beat = 0.4528) {
  const w = Array.from({ length: 33 }, () => [0, 0, 0]);
  const ph = (t / (beat * 2)) * Math.PI * 2, sx = 0.035 * Math.sin(ph), nod = 0.02 * Math.sin(ph * 2), arm = 0.03 * Math.sin(ph + 1);
  const set = (i, x, y, z) => { w[i] = [x, y, z]; };
  set(23, 0.09, 0, 0); set(24, -0.09, 0, 0);
  set(11, 0.19 + sx, -0.5, 0); set(12, -0.19 + sx, -0.5, 0);
  set(13, 0.24 + sx + arm, -0.25, 0.01); set(14, -0.24 + sx - arm, -0.25, 0.01);
  set(15, 0.27 + sx + arm, -0.01, 0.04); set(16, -0.27 + sx - arm, -0.01, 0.04);
  for (const [sd, p, i, k] of [[1, 15, 17, 19], [-1, 16, 18, 20]]) { const [x, y, z] = w[p]; set(i, x + 0.01 * sd, y + 0.08, z + 0.02); set(k, x - 0.01 * sd, y + 0.08, z - 0.03); set(i + 4, x, y + 0.04, z - 0.05); }
  set(0, sx * 1.3, -0.64 + nod, -0.09); set(7, 0.075 + sx * 1.3, -0.62 + nod, 0.0); set(8, -0.075 + sx * 1.3, -0.62 + nod, 0.0);
  set(25, 0.1, 0.42, 0); set(26, -0.1, 0.42, 0); set(27, 0.1, 0.84, 0); set(28, -0.1, 0.84, 0);
  set(29, 0.1, 0.88, 0.05); set(30, -0.1, 0.88, 0.05); set(31, 0.1, 0.9, -0.1); set(32, -0.1, 0.9, -0.1);
  for (const i of [1, 2, 3, 4, 5, 6, 9, 10]) w[i] = w[0].slice();
  return w;
}

export class LiveRig {
  constructor({ mirror = true } = {}) {
    this.mirror = mirror;
    this.fw = Array.from({ length: 33 }, () => [new OneEuro(1.6, 10), new OneEuro(1.6, 10), new OneEuro(1.2, 8)]);
    this.fx = new OneEuro(0.8, 4); this.fy = new OneEuro(0.6, 2);
    this.lm = null;            // the filtered world landmarks, MediaPipe convention, already mirrored
    this.vis = new Array(33).fill(0); this.hipX = 0.5; this.legW = 0; this.idleW = 1; this.lost = 99; this.yAvg = null; this.lastT = 0; this.seen = false;
  }
  // result: PoseLandmarkerResult or null. t: seconds. Returns the creature's joints J.
  update(result, t) {
    const dt = Math.max(0, Math.min(0.2, t - this.lastT)); this.lastT = t;   // result: undefined = no new detection this frame; null = a detection that found nobody
    const wl = result && result.worldLandmarks && result.worldLandmarks[0], il = result && result.landmarks && result.landmarks[0];
    if (wl && il) {
      this.lastSeen = t; this.seen = true;
      const lm = [], vis = [];
      for (let i = 0; i < 33; i++) {
        const j = this.mirror ? MIRROR[i] : i, p = wl[j], f = this.fw[i];
        lm.push([f[0].filter(this.mirror ? -p.x : p.x, t), f[1].filter(p.y, t), f[2].filter(p.z, t)]); vis.push(wl[j].visibility ?? il[j].visibility ?? 0);
      }
      this.lm = lm; this.vis = vis;
      const ix = (i) => { const p = il[this.mirror ? MIRROR[i] : i]; return this.mirror ? 1 - p.x : p.x; }, iy = (i) => il[this.mirror ? MIRROR[i] : i].y;
      const hipsOk = vis[23] > 0.5 && vis[24] > 0.5;
      const cx = hipsOk ? (ix(23) + ix(24)) / 2 : (ix(11) + ix(12)) / 2, my = (iy(11) + iy(12)) / 2;
      this.hipX = this.fx.filter(cx, t); const ym = this.fy.filter(my, t);
      this.yAvg = this.yAvg === null ? ym : this.yAvg + (ym - this.yAvg) * Math.min(1, dt / 1.5);
      this.ym = ym;
      const legsOk = [23, 24, 25, 26, 27, 28].every((i) => vis[i] > 0.55) && iy(27) < 0.97 && iy(28) < 0.97;
      this.legTarget = legsOk ? 1 : 0;
    }
    this.lost = this.seen ? t - this.lastSeen : 99;
    const wantIdle = !this.seen || this.lost > 0.7;
    this.idleW = Math.min(1, Math.max(0, this.idleW + (wantIdle ? 1 : -1) * dt / 0.6));
    this.legW = this.legW + ((wantIdle ? 0 : (this.legTarget || 0)) - this.legW) * Math.min(1, dt / 0.35);
    return this.joints(t);
  }
  get present() { return this.seen && this.lost <= 0.7; }
  joints(t) {
    const idle = idleLandmarks(t), live = this.lm || idle, k = sstep(this.idleW);
    const lm = live.map((p, i) => V([lerp(p[0], idle[i][0], k), lerp(p[1], idle[i][1], k), lerp(p[2], idle[i][2], k)]));
    const c0 = lm[23].clone().add(lm[24]).multiplyScalar(0.5); for (const p of lm) p.sub(c0);
    const hipAxis = dirv(lm[24], lm[23]);
    const shC = lm[11].clone().add(lm[12]).multiplyScalar(0.5), shAxis = dirv(lm[12], lm[11]);
    const spineDir = shC.clone().normalize(); if (spineDir.y < 0.5) spineDir.set(0, 1, 0).lerp(spineDir, 0.3).normalize();
    const J = {}; J.hipC = new THREE.Vector3();
    J.lHip = hipAxis.clone().multiplyScalar(P.hw); J.rHip = hipAxis.clone().multiplyScalar(-P.hw);
    J.shC = spineDir.clone().multiplyScalar(P.spine);
    J.lSho = J.shC.clone().addScaledVector(shAxis, P.sw); J.rSho = J.shC.clone().addScaledVector(shAxis, -P.sw);
    for (const [s, sh, e, w, h1, h2] of [['l', 'lSho', 13, 15, 17, 19], ['r', 'rSho', 14, 16, 18, 20]]) {
      const ua = dirv(lm[s === 'l' ? 11 : 12], lm[e]), fa = dirv(lm[e], lm[w]);
      const hd = lm[h1].clone().add(lm[h2]).multiplyScalar(0.5).sub(lm[w]); hd.length() > 1e-6 ? hd.normalize() : hd.copy(fa);
      J[s + 'Elb'] = J[sh].clone().addScaledVector(ua, P.ua); J[s + 'Wri'] = J[s + 'Elb'].clone().addScaledVector(fa, P.fa);
      J[s + 'HandDir'] = hd.lerp(fa, 0.35).normalize(); J[s + 'HandSide'] = dirv(lm[s === 'l' ? 17 : 18], lm[s === 'l' ? 19 : 20]);
    }
    // legs: from the landmarks when the hips, knees and ankles are really seen; otherwise standing legs that bend with the visitor's up-and-down bob
    const Lmax = P.th + P.sh, bob = this.yAvg === null ? 0 : (this.ym - this.yAvg) * 2.0 * (1 - k);
    const crouch = Math.min(0.24, Math.max(-0.06, bob)), real = {};
    for (const [s, hp, kn, a, hl, tp] of [['l', 'lHip', 25, 27, 29, 31], ['r', 'rHip', 26, 28, 30, 32]]) {
      const hi = s === 'l' ? 23 : 24, sd = s === 'l' ? 1 : -1;
      const knee = J[hp].clone().addScaledVector(dirv(lm[hi], lm[kn]), P.th), ank = knee.clone().addScaledVector(dirv(lm[kn], lm[a]), P.sh);
      const fwd = dirv(lm[hl], lm[tp]); fwd.y = Math.min(fwd.y, 0.35); fwd.normalize();
      // standing legs: two-bone IK from the hip to an ankle straight below it
      const h = Math.min(Lmax * 0.999, Lmax - Math.max(0, crouch)), A = J[hp].clone().add(new THREE.Vector3(sd * 0.05, -h, 0)), u = A.clone().sub(J[hp]).normalize();
      const x = (P.th * P.th - P.sh * P.sh + h * h) / (2 * h), perp = Math.sqrt(Math.max(0, P.th * P.th - x * x));
      const fw = new THREE.Vector3(0, 0, 1); fw.addScaledVector(u, -fw.dot(u)).normalize();
      const sK = J[hp].clone().addScaledVector(u, x).addScaledVector(fw, perp), sFwd = new THREE.Vector3(0, 0, 1);
      const w = this.legW, mix = (p, q2) => p.clone().lerp(q2, w);
      const kk = mix(sK, knee), aa = mix(A, ank), ff = mix(sFwd, fwd).normalize();
      J[s + 'Knee'] = kk; J[s + 'Ank'] = aa;
      J[s + 'Heel'] = aa.clone().addScaledVector(ff, -P.heel).add(new THREE.Vector3(0, -P.ank * 0.7, 0)); J[s + 'Toe'] = aa.clone().addScaledVector(ff, P.toe).add(new THREE.Vector3(0, -P.ank * 0.7, 0));
    }
    const earMid = lm[7].clone().add(lm[8]).multiplyScalar(0.5);
    const dH = earMid.clone().sub(shC).normalize().multiplyScalar(0.5).addScaledVector(spineDir, 0.5).normalize();
    J.head = J.shC.clone().addScaledVector(dH, P.neck);
    const X = dirv(lm[8], lm[7]), fwd = dirv(earMid, lm[0]), up = new THREE.Vector3().crossVectors(fwd, X).normalize();
    const qTorso = frameQuat(shAxis, spineDir);
    J.qPelvis = frameQuat(hipAxis, spineDir.clone().lerp(new THREE.Vector3(0, 1, 0), 0.5)); J.qTorso = qTorso;
    J.qHead = frameQuat(X.clone().lerp(shAxis, 0.35), up.lerp(dH, 0.4)).slerp(qTorso, 0.3);
    // same as the dance: keep the face readable when the head tips far down
    { const f = new THREE.Vector3(0, 0, 1).applyQuaternion(J.qHead), d = Math.min(0.32, Math.max(0, (-0.30 - f.y) * 0.9)); if (d > 0) J.qHead.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -d)); }
    // ground: the lowest foot point rests on the platform; a rising bob is a small hop
    let minY = 1e9; for (const n of ['lAnk', 'rAnk', 'lHeel', 'rHeel', 'lToe', 'rToe']) minY = Math.min(minY, J[n].y);
    const sideX = (this.hipX - 0.5) * 2.2 * (1 - k), rx = Math.max(-1.0, Math.min(1.0, sideX)) + 0.06 * Math.sin(t / 0.9056 * Math.PI * 2) * k;
    const root = new THREE.Vector3(rx, -minY + (crouch < 0 ? -crouch : 0) * (1 - k), 0);
    for (const key of Object.keys(J)) if (J[key] && J[key].isVector3 && !key.endsWith('HandDir') && !key.endsWith('HandSide')) J[key].add(root);
    J.root = root; return J;
  }
}
