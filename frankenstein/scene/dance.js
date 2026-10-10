// dance1: the dance as joint positions. Reads data/pose.json (MediaPipe world landmarks of the reference dancer, smoothed, 660 frames on the
// song's timeline) and retargets it to a skeleton with FIXED bone lengths (directions come from the data, lengths from P below), so limbs never
// stretch or shrink with the pose-estimation noise. Output per frame: joints in "performer metres" (y up, +x = the dancer's left, +z toward the
// camera, origin on the platform surface under the hips' starting spot). Characters scale these themselves; nothing here knows about a character.
import * as THREE from 'three';

// performer proportions (metres, a 1.78 m man). Shoulders are wider than the pose model's (it under-measures width).
export const P = { sw: 0.29, hw: 0.115, spine: 0.52, neck: 0.28, ua: 0.355, fa: 0.31, hand: 0.21, th: 0.46, sh: 0.45, ank: 0.08, heel: 0.085, toe: 0.18 };   // v2: broader shoulders, longer arms and legs (the book's creature is very large-framed)
const V = (a) => new THREE.Vector3(a[0], -a[1], -a[2]);     // MediaPipe world (x right, y down, z away) -> three (x right, y up, z toward camera)
const dirv = (a, b) => b.clone().sub(a).normalize();

function frameQuat(x, up) {   // basis from a lateral axis (+x = left) and an up hint; forward = x cross up
  const X = x.clone().normalize(); const U = up.clone().sub(X.clone().multiplyScalar(up.dot(X))).normalize(); const F = new THREE.Vector3().crossVectors(X, U).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, U, F));
}

// v4: per-landmark tracker-loss repair. The pose tracker lost the dancer in several windows (legs fold over the hips, torso shrinks, head drops to the platform).
// v3 interpolated EVERY landmark across a bad run, which threw away arm poses that were tracked well (frame 450). v4 decides per landmark:
//  - scope: a frame is "flagged" if it is in the `lost` list (mapped to output frames, incl. the looped tail) or an ankle / knee / torso / head check fails (raw MediaPipe
//    world, y down, relative to the hip centre); the scope is the flagged frames padded by 2. Outside the scope nothing is touched.
//  - legs (knee, ankle, heel, toe of a side): bad when that side fails its own check (ankle drop under 0.42 m, knee drop under 0.10 m) or the frame is lost, padded by 2.
//  - core (hips, shoulders, head): bad when the frame is lost (pad 1) or the body collapsed (torso under 0.42 m or the nose less than 0.40 m above the hip), padded by 2.
//  - arms and hands: inside the scope, bad when lost (pad 1), collapsed (pad 2), visibility under 0.6 (pose.json `vis`, per landmark) or a bone longer than 0.40 m.
//  Each bad run of a landmark is replaced by a monotone cubic Hermite curve (PCHIP) through the nearest good frames on both sides, per axis (smooth, no overshoot).
//  The hip path (image position) is filled the same way over lost / collapsed frames. The looped tail frames inherit the masks of the window they repeat.
export const REPAIR = { ankle: 0.42, knee: 0.10, torso: 0.42, head: 0.40, pad: 2, armVis: 0.6, armBone: 0.40 };
const LEG = { l: [25, 27, 29, 31], r: [26, 28, 30, 32] }, CORE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 23, 24], ARMS = [13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
function pchipFill(y, bad, N) {                                   // y: Float64Array(N); fills every bad run in place
  for (let n = 0; n < N; n++) {
    if (!bad[n]) continue;
    let b = n; while (b + 1 < N && bad[b + 1]) b++;
    const i0 = n - 1, i1 = b + 1;
    if (i0 < 0 && i1 >= N) return;
    if (i0 < 0) { for (let k = n; k <= b; k++) y[k] = y[i1]; }
    else if (i1 >= N) { for (let k = n; k <= b; k++) y[k] = y[i0]; }
    else {
      let p = i0 - 1; while (p >= 0 && bad[p]) p--;
      let q = i1 + 1; while (q < N && bad[q]) q++;
      const h = i1 - i0, dm = (y[i1] - y[i0]) / h;
      const tan = (dPrev, dNext, hPrev, hNext) => { if (dPrev * dNext <= 0) return 0; const w1 = 2 * hNext + hPrev, w2 = hNext + 2 * hPrev; return (w1 + w2) / (w1 / dPrev + w2 / dNext); };
      const m0 = p >= 0 ? tan((y[i0] - y[p]) / (i0 - p), dm, i0 - p, h) : dm, m1 = q < N ? tan(dm, (y[q] - y[i1]) / (q - i1), h, q - i1) : dm;
      const y0 = y[i0], y1 = y[i1];
      for (let k = n; k <= b; k++) {
        const t = (k - i0) / h, t2 = t * t, t3 = t2 * t;
        y[k] = (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m1;
      }
    }
    n = b;
  }
}
export function repairTracking(j) {
  const D = j.data, N = D.length, off = j.source_offset_frames || 0, Pt = j.tail_repeat_frames || 0, endF = j.dance_end_frame ?? N, S = endF + 1;
  const lost = new Set(j.lost || []);
  const isLost = (n) => { const x = n - off; const c = x > endF ? [x - Pt] : x >= S - 10 ? [x, x - Pt] : [x]; return c.some((y) => lost.has(Math.floor(y)) || lost.has(Math.ceil(y))); };
  const pad = (a, r) => { const o = new Array(N).fill(false); for (let n = 0; n < N; n++) if (a[n]) for (let d = -r; d <= r; d++) if (n + d >= 0 && n + d < N) o[n + d] = true; return o; };
  const L = new Array(N), legF = { l: new Array(N), r: new Array(N) }, collapse = new Array(N), flag = new Array(N);
  for (let n = 0; n < N; n++) {
    const w = D[n].w, hy = (w[23][1] + w[24][1]) / 2, sy = (w[11][1] + w[12][1]) / 2;
    const torso = Math.hypot((w[11][0] + w[12][0]) / 2 - (w[23][0] + w[24][0]) / 2, sy - hy, (w[11][2] + w[12][2]) / 2 - (w[23][2] + w[24][2]) / 2);
    L[n] = isLost(n);
    legF.l[n] = w[27][1] - hy < REPAIR.ankle || w[25][1] - hy < REPAIR.knee; legF.r[n] = w[28][1] - hy < REPAIR.ankle || w[26][1] - hy < REPAIR.knee;
    collapse[n] = torso < REPAIR.torso || hy - w[0][1] < REPAIR.head;
    flag[n] = L[n] || legF.l[n] || legF.r[n] || collapse[n];
  }
  const scope = pad(flag, REPAIR.pad), L1 = pad(L, 1), Lp = pad(L, REPAIR.pad), C = pad(collapse, REPAIR.pad);
  const bad = Array.from({ length: N }, () => new Uint8Array(33)), hipBad = new Array(N).fill(false);
  const lp = { l: pad(legF.l.map((f, n) => f || L[n]), REPAIR.pad), r: pad(legF.r.map((f, n) => f || L[n]), REPAIR.pad) };
  for (let n = 0; n < N; n++) {
    for (const s of ['l', 'r']) if (lp[s][n]) for (const k of LEG[s]) bad[n][k] = 1;
    if (L1[n] || C[n]) { for (const k of CORE) bad[n][k] = 1; hipBad[n] = true; }
    if (scope[n]) {
      const w = D[n].w, v = D[n].vis;
      for (const k of ARMS) if (L1[n] || C[n] || (v && v[k] < REPAIR.armVis)) bad[n][k] = 1;
      for (const [sh, el, wr] of [[11, 13, 15], [12, 14, 16]]) {
        const d = (a, b) => Math.hypot(w[a][0] - w[b][0], w[a][1] - w[b][1], w[a][2] - w[b][2]);
        if (d(sh, el) > REPAIR.armBone) bad[n][el] = 1; if (d(el, wr) > REPAIR.armBone) bad[n][wr] = 1;
      }
    }
  }
  // the looped tail (output frames after the cross-fade) shows the dance Pt frames earlier: it inherits that window's masks
  if (Pt > 0) for (let n = Math.ceil(S - 10 + off); n < N; n++) { const m = Math.round(n - Pt); if (m >= 0 && m < N) { for (let k = 0; k < 33; k++) if (bad[m][k]) bad[n][k] = 1; if (hipBad[m]) hipBad[n] = true; } }
  const stat = { frames: 0, landmarks: 0, byGroup: { legs: 0, core: 0, arms: 0 } };
  const y = new Float64Array(N);
  for (let k = 0; k < 33; k++) {
    const bk = new Array(N); let any = false;
    for (let n = 0; n < N; n++) { bk[n] = bad[n][k] === 1; if (bk[n]) { any = true; stat.landmarks++; stat.byGroup[CORE.includes(k) ? 'core' : ARMS.includes(k) ? 'arms' : 'legs']++; } }
    if (!any) continue;
    for (let c = 0; c < 3; c++) { for (let n = 0; n < N; n++) y[n] = D[n].w[k][c]; pchipFill(y, bk, N); for (let n = 0; n < N; n++) if (bk[n]) D[n].w[k][c] = y[n]; }
    // v5: the image landmarks are only filled where the dancer was lost or collapsed (low visibility alone keeps the 2D, which is far better than the world depth)
    if (D[0].img) { const bi = bk.map((b, n) => b && (L1[n] || C[n]) && !(D[n].k7 && D[n].k7.includes(k))); /* v7: hand keyframes (data[n].k7) are kept */ if (bi.some((b) => b)) for (let c = 0; c < 2; c++) { for (let n = 0; n < N; n++) y[n] = D[n].img[k][c]; pchipFill(y, bi, N); for (let n = 0; n < N; n++) if (bi[n]) D[n].img[k][c] = y[n]; } }
  }
  for (let c = 0; c < 2; c++) { for (let n = 0; n < N; n++) y[n] = D[n].hip[c]; pchipFill(y, hipBad, N); for (let n = 0; n < N; n++) if (hipBad[n]) D[n].hip[c] = y[n]; }
  const runs = [], anyBad = bad.map((b, n) => hipBad[n] || b.some((v) => v));
  for (let n = 0; n < N; n++) if (anyBad[n]) { let m = n; while (m + 1 < N && anyBad[m + 1]) m++; runs.push([n, m]); n = m; }
  runs.stat = stat; runs.bad = bad; runs.hipBad = hipBad;
  return runs;
}

// v4: arm bone directions with a per-frame turn limit. When the tracker puts two arm landmarks nearly on top of each other (the bone points at the camera, 3-8 cm long, visibility
// 0.05-0.35) the bone direction flips by 90-110 degrees in one frame (the left wrist snapped at 275, 284 and 576-577 in v1-v3). A bone that is short may turn at most TURN.short per
// frame, a longer one TURN.long; a forward and a backward pass are averaged so the swing is spread evenly around the glitch instead of lagging behind it.
export const TURN = { shortLen: 0.10, short: 0.61, long: 1.40 };       // radians per frame (35 deg for a short bone, 80 deg otherwise)
const QI = new THREE.Quaternion();
function stepToward(prev, d, amax) {
  const a = prev.angleTo(d); if (a <= amax || a < 1e-6) return d.clone();
  const q = new THREE.Quaternion().setFromUnitVectors(prev, d); return prev.clone().applyQuaternion(QI.clone().slerp(q, amax / a)).normalize();
}
function limitTurn(dirs, lens) {
  const N = dirs.length, f = new Array(N), b = new Array(N);
  f[0] = dirs[0].clone(); for (let n = 1; n < N; n++) f[n] = stepToward(f[n - 1], dirs[n], lens[n] < TURN.shortLen ? TURN.short : TURN.long);
  b[N - 1] = dirs[N - 1].clone(); for (let n = N - 2; n >= 0; n--) b[n] = stepToward(b[n + 1], dirs[n], lens[n] < TURN.shortLen ? TURN.short : TURN.long);
  return dirs.map((_, n) => { const m = f[n].clone().add(b[n]); return m.lengthSq() < 1e-6 ? f[n] : m.normalize(); });
}

export async function loadDance(url) {
  const j = await (await fetch(url)).json();
  const repaired = repairTracking(j);
  const N = j.data.length;
  const out = [];
  // v4: limited bone directions for both arms (upper arm, forearm, hand axis), from the repaired landmarks
  const BD = {};
  for (const [s, si, e, w, h1, h2] of [['l', 11, 13, 15, 17, 19], ['r', 12, 14, 16, 18, 20]]) {
    const ua = [], fa = [], hd = [], lu = [], lf = [], lh = [];
    for (let n = 0; n < N; n++) {
      const lm = j.data[n].w; const g = (i) => V(lm[i]);
      const a = g(e).sub(g(si)), b = g(w).sub(g(e)), c = g(h1).add(g(h2)).multiplyScalar(0.5).sub(g(w));
      lu.push(a.length()); lf.push(b.length()); lh.push(c.length());
      ua.push(a.length() > 1e-6 ? a.normalize() : new THREE.Vector3(0, -1, 0)); fa.push(b.length() > 1e-6 ? b.normalize() : new THREE.Vector3(0, -1, 0)); hd.push(c.length() > 1e-6 ? c.normalize() : new THREE.Vector3(0, -1, 0));
    }
    BD[s] = { ua: limitTurn(ua, lu), fa: limitTurn(fa, lf), hd: limitTurn(hd, lh.map((v) => v * 2)) };
  }
  for (let n = 0; n < N; n++) {
    const lm = j.data[n].w.map(V);
    const c0 = lm[23].clone().add(lm[24]).multiplyScalar(0.5);
    for (const p of lm) p.sub(c0);
    const hipAxis = dirv(lm[24], lm[23]);
    const shC = lm[11].clone().add(lm[12]).multiplyScalar(0.5);
    const shAxis = dirv(lm[12], lm[11]);
    const spineDir = shC.clone().normalize();
    if (spineDir.y < 0.5) spineDir.set(0, 1, 0).lerp(spineDir, 0.3).normalize();       // never fold the spine over (depth noise)
    const J = {};
    J.hipC = new THREE.Vector3();
    J.lHip = hipAxis.clone().multiplyScalar(P.hw); J.rHip = hipAxis.clone().multiplyScalar(-P.hw);
    J.shC = spineDir.clone().multiplyScalar(P.spine);
    J.lSho = J.shC.clone().addScaledVector(shAxis, P.sw); J.rSho = J.shC.clone().addScaledVector(shAxis, -P.sw);
    for (const [s, sh, e, w, h1, h2] of [['l', 'lSho', 13, 15, 17, 19], ['r', 'rSho', 14, 16, 18, 20]]) {
      const si = s === 'l' ? 11 : 12;
      J[s + 'Elb'] = J[sh].clone().addScaledVector(BD[s].ua[n], P.ua);
      J[s + 'Wri'] = J[s + 'Elb'].clone().addScaledVector(BD[s].fa[n], P.fa);
      const hd = BD[s].hd[n].clone();
      const fd = BD[s].fa[n].clone();
      J[s + 'HandDir'] = hd.lerp(fd, 0.35).normalize();                                // hand points mostly along the forearm
      J[s + 'HandSide'] = dirv(lm[s === 'l' ? 17 : 18], lm[s === 'l' ? 19 : 20]);       // v2: pinky -> index = toward the thumb
    }
    for (const [s, hp, k, a, hl, tp] of [['l', 'lHip', 25, 27, 29, 31], ['r', 'rHip', 26, 28, 30, 32]]) {
      const hi = s === 'l' ? 23 : 24;
      J[s + 'Knee'] = J[hp].clone().addScaledVector(dirv(lm[hi], lm[k]), P.th);
      J[s + 'Ank'] = J[s + 'Knee'].clone().addScaledVector(dirv(lm[k], lm[a]), P.sh);
      const fwd = dirv(lm[hl], lm[tp]); fwd.y = Math.min(fwd.y, 0.35);               // foot never points steeply up
      fwd.normalize();
      J[s + 'Heel'] = J[s + 'Ank'].clone().addScaledVector(fwd, -P.heel).add(new THREE.Vector3(0, -P.ank * 0.7, 0));
      J[s + 'Toe'] = J[s + 'Ank'].clone().addScaledVector(fwd, P.toe).add(new THREE.Vector3(0, -P.ank * 0.7, 0));
    }
    // neck and head
    const earMid = lm[7].clone().add(lm[8]).multiplyScalar(0.5);
    const dH = earMid.clone().sub(shC).normalize().multiplyScalar(0.5).addScaledVector(spineDir, 0.5).normalize();
    J.head = J.shC.clone().addScaledVector(dH, P.neck);
    const X = dirv(lm[8], lm[7]); const fwd = dirv(earMid, lm[0]);
    const up = new THREE.Vector3().crossVectors(fwd, X).normalize();
    const qHead = frameQuat(X.clone().lerp(shAxis, 0.35), up.lerp(dH, 0.4));
    const qTorso = frameQuat(shAxis, spineDir);
    J.qPelvis = frameQuat(hipAxis, spineDir.clone().lerp(new THREE.Vector3(0, 1, 0), 0.5));
    J.qTorso = qTorso;
    J.qHead = qHead.slerp(qTorso, 0.3);
    J.rootX = j.data[n].hip[0]; J.upImg = j.data[n].hip[1];
    out.push(J);
  }
  const arms5 = j.data[0].img ? solveArms5(j, out, N) : null;     // v5: arms lifted from the 2D image landmarks, then collisions resolved
  // v2: keep the face readable: when the head tips far down (the blue-light shot), lift it a little (never more than 0.32 rad)
  const AXL = new THREE.Vector3(1, 0, 0), AZF = new THREE.Vector3(0, 0, 1);
  for (const J of out) { const f = AZF.clone().applyQuaternion(J.qHead); const d = Math.min(0.32, Math.max(0, (-0.30 - f.y) * 0.9)); if (d > 0) J.qHead.multiply(new THREE.Quaternion().setFromAxisAngle(AXL, -d)); }
  // v2: smooth the thumb-side vectors (5 frames) so fingers do not twitch
  for (const s of ['l', 'r']) { const k = s + 'HandSide'; const raw = out.map((J) => J[k].clone()); out.forEach((J, i) => { const a = new THREE.Vector3(); for (let d = -2; d <= 2; d++) a.add(raw[Math.min(N - 1, Math.max(0, i + d))]); J[k] = a.normalize(); }); }
  // ground contact: feet never sink into the platform; the hips' image height above the grounded height gives real hops
  const names = ['lAnk', 'rAnk', 'lHeel', 'rHeel', 'lToe', 'rToe'];
  const minFoot = out.map((J) => Math.min(...names.map((k) => J[k].y)));
  const grounded = minFoot.map((m) => -m);
  const diff = out.map((J, i) => J.upImg - grounded[i]);
  const med = diff.slice().sort((a, b) => a - b)[Math.floor(N / 2)];
  let hop = diff.map((d) => Math.max(0, Math.min(0.28, d - med - 0.04)));
  hop = hop.map((_, i) => { let s = 0, c = 0; for (let k = -2; k <= 2; k++) { const q = hop[Math.min(N - 1, Math.max(0, i + k))]; s += q; c++; } return s / c; });
  const xs = out.map((J) => J.rootX);
  for (let i = 0; i < N; i++) {
    const J = out[i]; const root = new THREE.Vector3(xs[i], grounded[i] + hop[i], 0);
    for (const k of Object.keys(J)) if (J[k] && J[k].isVector3 && !k.endsWith('HandDir') && !k.endsWith('HandSide')) J[k].add(root);
    J.root = root;
  }
  const arm = { l: 0, r: 0 };   // v4: no arm limit (it changed the choreography); the framing keeps the hands in the picture
  const lock = plantFeet(out, N);
  if (arms5) arms5.legsAfterPlant = out.reduce((m, J) => m + (resolveLegs(J) ? 1 : 0), 0);   // v5: again after the feet are planted (the IK there can bring the knees together)
  if (arms5) arms5.legs6 = separateLegs6(out, N);   // v6: thighs that still overlap (546-549, 363-364) are parted sideways, smoothly over time
  const armfix10 = j.armfix10 ? armFix10(out, j.armfix10) : null;   // v10: right-hand loops at the face (11.0 s, 11.9 s) brought back to size (two-bone IK)
  const bridge8 = bridgePose8(out, N, j.bridge8 || []);   // v8: whole-body pops (363-364 crouch, 546-549 lean, 511-514 turn) bridged
  const retime8 = retimeArms8(out, N, j.retime8 || []);   // v8: one-frame arm pops re-timed over their neighbours (same path, full size)
  if (j.timewarp10) {   // v10: output frame n shows the pose at fractional frame m(n) of the source-indexed track (true source frame times, 29.56 fps)
    const W = j.timewarp10, J2 = W.map((m) => { const a = Math.min(Math.max(Math.floor(m), 0), N - 1), b = Math.min(a + 1, N - 1); return lerpJ10(out[a], out[b], Math.min(1, Math.max(0, m - a))); });
    return { N: J2.length, J: J2, info: { medianHopOffset: med, lock, arm, repaired, arms5, bridge8, retime8, armfix10, timewarp10: true, fixed: j.data } };
  }
  return { N, J: out, info: { medianHopOffset: med, lock, arm, repaired, arms5, bridge8, retime8, armfix10, fixed: j.data } };
}

// v2 foot planting: a foot that is low and slow is held at one spot on the platform (weight blends in and out), and the knee is re-solved
// (two-bone IK, pole = the original knee) so the leg keeps its fixed bone lengths. World space, after the root has been added.
function plantFeet(out, N) {
  const stats = {};
  for (const s of ['l', 'r']) {
    const A = out.map((J) => J[s + 'Ank'].clone());
    const low = out.map((J) => Math.min(J[s + 'Heel'].y, J[s + 'Toe'].y) < 0.05);
    const sp = A.map((a, i) => { const p = A[Math.max(0, i - 1)], q = A[Math.min(N - 1, i + 1)]; return Math.hypot(q.x - p.x, q.z - p.z) / 2; });
    let pl = low.map((l, i) => l && sp[i] < 0.016);
    for (let pass = 0; pass < 2; pass++) {                                   // fill gaps up to 2 frames, drop runs under 4 frames
      for (let i = 0; i < N; i++) if (!pl[i]) { let j = i; while (j < N && !pl[j]) j++; if (i > 0 && j < N && j - i <= 2) for (let k = i; k < j; k++) pl[k] = true; i = j; }
      for (let i = 0; i < N; i++) if (pl[i]) { let j = i; while (j < N && pl[j]) j++; if (j - i < 4) for (let k = i; k < j; k++) pl[k] = false; i = j; }
    }
    const anchor = new Array(N).fill(null), w = new Array(N).fill(0), reach = (P.th + P.sh) * 0.965;
    for (let i = 0; i < N; i++) if (pl[i]) {
      let j = i; while (j < N && pl[j]) j++;
      const m = new THREE.Vector3(); for (let k = i; k < j; k++) m.add(A[k]); m.divideScalar(j - i);
      for (let k = i; k < j; k++) { anchor[k] = m; const tgt = new THREE.Vector3(m.x, A[k].y, m.z); w[k] = out[k][s + 'Hip'].distanceTo(tgt) < reach ? 1 : 0; }
      i = j;
    }
    for (let pass = 0; pass < 2; pass++) { const c = w.slice(); for (let i = 0; i < N; i++) { let a = 0; for (let d = -2; d <= 2; d++) a += c[Math.min(N - 1, Math.max(0, i + d))]; w[i] = a / 5; } }
    let nl = 0;
    for (let i = 0; i < N; i++) {
      const J = out[i], wi = w[i]; if (wi <= 0.001) continue; nl++;
      const a0 = A[i], an = anchor[i] || (() => { let k = i; while (k < N && !anchor[k]) k++; let k2 = i; while (k2 >= 0 && !anchor[k2]) k2--; return anchor[k] || anchor[k2] || a0; })();
      const dx = (an.x - a0.x) * wi, dz = (an.z - a0.z) * wi;
      const newA = new THREE.Vector3(a0.x + dx, a0.y, a0.z + dz), hip = J[s + 'Hip'], K = J[s + 'Knee'];
      J[s + 'Ank'].copy(newA); J[s + 'Heel'].x += dx; J[s + 'Heel'].z += dz; J[s + 'Toe'].x += dx; J[s + 'Toe'].z += dz;
      const d = newA.clone().sub(hip); let dl = d.length(); const dh = d.clone().normalize(); dl = Math.min(dl, (P.th + P.sh) * 0.999);
      const x = (P.th * P.th - P.sh * P.sh + dl * dl) / (2 * dl), h = Math.sqrt(Math.max(0, P.th * P.th - x * x));
      const kv = K.clone().sub(hip); const pole = kv.sub(dh.clone().multiplyScalar(kv.dot(dh))); if (pole.lengthSq() < 1e-8) pole.set(0, 0, 1); pole.normalize();
      J[s + 'Knee'].copy(hip).addScaledVector(dh, x).addScaledVector(pole, h);
      if (d.length() > (P.th + P.sh) * 0.999) J[s + 'Ank'].copy(hip).addScaledVector(dh, dl);
    }
    stats[s] = nl;
  }
  return stats;
}

// v4: the v3 arm limit (rotating arms toward the camera) is gone. handPx (the static camera model; v4 camera: D0 9.0, look target x -0.05) is only used by the tools.
export const handPx = (p, D = 9.0, lookX = -0.05) => 540 + 540 * ((1.3 * p.x - lookX) / ((D - 1.3 * p.z) * 0.1772));

// ============ v5: arms lifted from the 2D image landmarks, and no limbs through each other or the body ============
// The tracker's world DEPTH is its weak axis (an arm held out sideways could come back pointing into the chest); the 2D picture position is good.
// Each arm bone (upper arm, forearm, hand) takes its picture-plane direction from the image landmarks, scaled by the dancer's own bone length
// (in torso heights, from the frames where the bone lies flat in the picture), and its depth from the fixed bone length: dz = +-sqrt(1 - r^2).
// The sign of dz is chosen over the whole clip at once (Viterbi): the world z where that bone is seen with confidence, continuity, no going
// through the body, and "in front" when unsure. Then collisions are resolved by moving the elbow / wrist in DEPTH first (the camera is frontal,
// so the 2D shape stays), smoothed over time, sideways only as a last resort.
export const BODY5 = {
  prof: [[0, 0.235, 0.145], [0.22, 0.225, 0.135], [0.48, 0.28, 0.155], [0.76, 0.335, 0.17], [0.93, 0.355, 0.15], [1.02, 0.26, 0.12], [1.1, 0.12, 0.095], [1.16, 0.075, 0.075]],   // = character.js torso/coat rings (s along hip->shoulder, half width, half depth)
  // collision torso: the coat's depth, but the CHEST's width under the loose coat above the waist (the coat rings there include the sleeve tops,
  // which are wider than the shoulder joints at +-0.29 m, so a hanging arm would always count as 'inside')
  coll: [[0, 0.235, 0.145], [0.22, 0.225, 0.135], [0.48, 0.235, 0.155], [0.76, 0.20, 0.17], [0.93, 0.19, 0.15], [1.02, 0.17, 0.12], [1.1, 0.12, 0.095], [1.16, 0.075, 0.075]],
  head: 0.15, headUp: 0.03, ua: 0.085, fa: 0.065, hand: 0.05, handLen: 0.15, th: 0.10, sh: 0.075, uaFrom: 0.55,
};
const AXv = new THREE.Vector3(1, 0, 0), AYv = new THREE.Vector3(0, 1, 0), AZv = new THREE.Vector3(0, 0, 1);
function profAt(s) { const Q = BODY5.coll; if (s <= Q[0][0]) return Q[0]; for (let i = 1; i < Q.length; i++) if (s <= Q[i][0]) { const a = Q[i - 1], b = Q[i], t = (s - a[0]) / (b[0] - a[0]); return [s, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; } return Q[Q.length - 1]; }
export function bodyFrame(J) {
  const sp = J.shC.clone().sub(J.hipC), L = sp.length(), U = sp.clone().divideScalar(L), X = AXv.clone().applyQuaternion(J.qTorso); X.addScaledVector(U, -X.dot(U)).normalize();
  return { o: J.hipC.clone(), X, U, Z: new THREE.Vector3().crossVectors(X, U), L, hc: J.head.clone().addScaledVector(AYv.clone().applyQuaternion(J.qHead), BODY5.headUp) };
}
function torsoPen(B, p, r) {                      // depth of a sphere (centre p, radius r) inside the torso + coat (elliptic section per height)
  const d = p.clone().sub(B.o), s = d.dot(B.U) / B.L; if (s < 0.02 || s > 1.16) return 0;
  const [, a, b] = profAt(s), x = d.dot(B.X), z = d.dot(B.Z), A = a + r, Bb = b + r, f = Math.hypot(x / A, z / Bb);
  return f < 1 ? (1 - f) * Math.min(A, Bb) : 0;
}
const headPen = (B, p, r) => Math.max(0, BODY5.head + r - p.distanceTo(B.hc));
function segSeg(p1, q1, p2, q2) {                 // closest points of two segments -> [distance, s on the first, t on the second]
  const d1 = q1.clone().sub(p1), d2 = q2.clone().sub(p2), r = p1.clone().sub(p2), a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r), c = d1.dot(r), b = d1.dot(d2), den = a * e - b * b;
  let s = den > 1e-9 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0, t = (b * s + f) / e;
  if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); } else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
  return [p1.clone().addScaledVector(d1, s).distanceTo(p2.clone().addScaledVector(d2, t)), s, t];
}
function limbs5(J) {
  const o = [];
  for (const s of ['l', 'r']) {
    const tip = J[s + 'Wri'].clone().addScaledVector(J[s + 'HandDir'], BODY5.handLen);
    o.push({ s, k: 'ua', a: J[s + 'Sho'], b: J[s + 'Elb'], r: BODY5.ua, arm: true }, { s, k: 'fa', a: J[s + 'Elb'], b: J[s + 'Wri'], r: BODY5.fa, arm: true }, { s, k: 'hand', a: J[s + 'Wri'], b: tip, r: BODY5.hand, arm: true },
      { s, k: 'th', a: J[s + 'Hip'], b: J[s + 'Knee'], r: BODY5.th }, { s, k: 'shin', a: J[s + 'Knee'], b: J[s + 'Ank'], r: BODY5.sh });
  }
  return o;
}
// deepest overlap (performer metres) of an arm or leg capsule with the torso/coat, the head or another limb; used by the tools as the metric
export function penetration5(J) {
  const B = bodyFrame(J), caps = limbs5(J); let best = { d: 0, what: '' };
  const hit = (d, what) => { if (d > best.d) best = { d, what }; };
  for (const c of caps) if (c.arm) for (let i = 0; i <= 6; i++) {
    const t = (c.k === 'ua' ? BODY5.uaFrom : 0) + (1 - (c.k === 'ua' ? BODY5.uaFrom : 0)) * i / 6, q = c.a.clone().lerp(c.b, t);
    hit(torsoPen(B, q, c.r), c.s + c.k + '-torso'); hit(headPen(B, q, c.r), c.s + c.k + '-head');
  }
  for (let i = 0; i < caps.length; i++) for (let k = i + 1; k < caps.length; k++) {
    const a = caps[i], b = caps[k];
    if (a.s === b.s && (a.arm === b.arm || a.k === 'ua' || b.k === 'ua')) continue;          // same limb chain, or a shoulder against its own hip side
    if (!a.arm && !b.arm && a.s === b.s) continue;
    hit(a.r + b.r - segSeg(a.a, a.b, b.a, b.b)[0], a.s + a.k + '-' + b.s + b.k);
  }
  return best;
}
// one bone end (elbow from the shoulder, or wrist from the elbow): keep the bone's picture direction and only trade picture length for depth
// (r' <= r, either depth sign, the current sign preferred); turn the picture direction away from the body only when no depth works.
function placeBone(base, dir, len, test) {
  const r = Math.hypot(dir.x, dir.y), sg = dir.z >= 0 ? 1 : -1, ux = r > 1e-6 ? dir.x / r : 0, uy = r > 1e-6 ? dir.y / r : -1;
  const mk = (rr, sgn, ang = 0) => { const c = Math.cos(ang), s_ = Math.sin(ang), x = ux * c - uy * s_, y = ux * s_ + uy * c; return new THREE.Vector3(x * rr, y * rr, sgn * Math.sqrt(Math.max(0, 1 - rr * rr))); };
  if (test(base.clone().addScaledVector(dir, len), dir) < 0.004) return { d: dir, how: 0 };
  let best = null, bestPen = 1e9;
  for (let k = 0; k <= 34; k++) {
    const rr = Math.max(0, r - 0.03 * k);
    for (const sgn of [sg, -sg]) {
      const d = mk(rr, sgn), p = test(base.clone().addScaledVector(d, len), d), cost = (r - rr) + (sgn !== sg ? 0.25 + 0.6 * Math.abs(dir.z) : 0);
      if (p < 0.004 && (!best || cost < best.cost)) best = { d, cost, how: 1 };
      if (p < bestPen) { bestPen = p; if (!best) best = { d, cost: 1e3 + p, how: 3 }; }
    }
    if (best && best.how === 1 && best.cost <= 0.03 * k) break;
  }
  if (best.how === 1) return best;
  for (let k = 1; k <= 14; k++) for (const sa of [1, -1]) { const d = mk(r, sg, sa * k * 0.07); if (test(base.clone().addScaledVector(d, len), d) < 0.004) return { d, how: 2 }; }
  return best;
}
function resolveFrame(J, B, front, stat = null) {
  const order = front === 'r' ? ['r', 'l'] : ['l', 'r'];
  order.forEach((s, oi) => {
    const o = s === 'l' ? 'r' : 'l', other = limbs5(J).filter((c) => (oi === 1 && c.s === o && c.arm) || !c.arm);        // the back arm avoids the front arm; both avoid the legs
    const segPen = (a, b, r, t0, legsToo) => { let p = 0; for (let i = 0; i <= 4; i++) { const q = a.clone().lerp(b, t0 + (1 - t0) * i / 4); p = Math.max(p, torsoPen(B, q, r), headPen(B, q, r)); }
      for (const c of other) if (legsToo || c.arm) p = Math.max(p, r + c.r - segSeg(a, b, c.a, c.b)[0]); return p; };
    const S = J[s + 'Sho'], hd = J[s + 'HandDir'];
    const fa0 = J[s + 'Wri'].clone().sub(J[s + 'Elb']).normalize();
    const ue = placeBone(S, J[s + 'Elb'].clone().sub(S).normalize(), P.ua, (E) => segPen(S, E, BODY5.ua, BODY5.uaFrom, false));
    J[s + 'Elb'] = S.clone().addScaledVector(ue.d, P.ua);
    const E = J[s + 'Elb'];
    const we = placeBone(E, fa0, P.fa, (W) => Math.max(segPen(E, W, BODY5.fa, 0.2, true), segPen(W, W.clone().addScaledVector(hd, BODY5.handLen), BODY5.hand, 0, true)));
    J[s + 'Wri'] = E.clone().addScaledVector(we.d, P.fa);
    const W = J[s + 'Wri'], he = placeBone(W, hd, BODY5.handLen, (T) => segPen(W, T, BODY5.hand, 0.3, true));
    J[s + 'HandDir'] = he.d.clone().normalize();
    if (stat) for (const x of [ue, we, he]) stat['how' + x.how] = (stat['how' + x.how] || 0) + 1;
  });
  // legs before the feet are planted: the leg further back moves back in depth as a whole below the knee (knee pushed, ankle follows), the other forward
  for (let it = 0; it < 12; it++) {
    const pairs = [['Hip', 'Knee', BODY5.th, 'Knee'], ['Knee', 'Ank', BODY5.sh, 'Ank']]; let any = false;
    for (const [a, b, r, jn] of pairs) for (const [c, dd, r2] of pairs) {
      const p = r + r2 - segSeg(J['l' + a], J['l' + b], J['r' + c], J['r' + dd])[0]; if (p < 0.003) continue; any = true;
      const fl = J.lKnee.z >= J.rKnee.z ? 1 : -1, amt = p / 2 + 0.005;
      for (const [s, sg] of [['l', fl], ['r', -fl]]) {
        const old = J[s + jn].clone(); J[s + jn].z += sg * amt;
        if (jn === 'Knee') { J[s + 'Knee'] = J[s + 'Hip'].clone().addScaledVector(J[s + 'Knee'].clone().sub(J[s + 'Hip']).normalize(), P.th); const dl = J[s + 'Knee'].clone().sub(old); for (const k of ['Ank', 'Heel', 'Toe']) J[s + k].add(dl); }
        else { const nA = J[s + 'Knee'].clone().addScaledVector(J[s + 'Ank'].clone().sub(J[s + 'Knee']).normalize(), P.sh), dl = nA.sub(old); for (const k of ['Ank', 'Heel', 'Toe']) J[s + k].add(dl); }
      }
    }
    if (!any) break;
  }
}
// legs: the two thighs / shins never pass through each other. The knee of the leg further back swings back and the other forward around the
// hip-ankle line (two-bone IK with a new pole), so the feet stay where they are (planted) and the bone lengths stay fixed.
export function resolveLegs(J) {
  let moved = 0;
  for (let it = 0; it < 10; it++) {
    let worst = 0;
    for (const [a1, b1, r1] of [['Hip', 'Knee', BODY5.th], ['Knee', 'Ank', BODY5.sh]]) for (const [a2, b2, r2] of [['Hip', 'Knee', BODY5.th], ['Knee', 'Ank', BODY5.sh]]) worst = Math.max(worst, r1 + r2 - segSeg(J['l' + a1], J['l' + b1], J['r' + a2], J['r' + b2])[0]);
    if (worst < 0.003) break;
    const fl = J.lKnee.z >= J.rKnee.z ? 1 : -1;
    for (const [s, sg] of [['l', fl], ['r', -fl]]) {
      const H = J[s + 'Hip'], A = J[s + 'Ank'], K = J[s + 'Knee'].clone(); K.z += sg * (worst / 2 + 0.01);
      const d = A.clone().sub(H), dl = Math.min(d.length(), (P.th + P.sh) * 0.999), dh = d.normalize(), x = (P.th * P.th - P.sh * P.sh + dl * dl) / (2 * dl), h = Math.sqrt(Math.max(0, P.th * P.th - x * x));
      const pole = K.sub(H); pole.addScaledVector(dh, -pole.dot(dh)); if (pole.lengthSq() < 1e-8) continue; pole.normalize();
      J[s + 'Knee'] = H.clone().addScaledVector(dh, x).addScaledVector(pole, h); moved++;
    }
  }
  return moved;
}
function resolve5(j, out, N, B) {
  const stat = { crossRuns: 0 };
  // which arm is in front while the two arms overlap: one choice per crossing (world z of the wrists, then our own depth), never per frame
  const pre = out.map((J) => { const c = limbs5(J).filter((x) => x.arm); let m = -1; for (const a of c) if (a.s === 'l') for (const b of c) if (b.s === 'r') m = Math.max(m, a.r + b.r + 0.03 - segSeg(a.a, a.b, b.a, b.b)[0]); return m > 0; });
  const front = out.map((J) => (J.lWri.z >= J.rWri.z ? 'l' : 'r'));
  for (let n = 0; n < N; n++) if (pre[n]) {
    let m = n; while (m + 1 < N && pre.slice(m + 1, m + 5).some((x) => x)) m++;
    const a = Math.max(0, n - 3), b = Math.min(N - 1, m + 3); let sum = 0;
    for (let k = a; k <= b; k++) { const w = j.data[k].w, v = j.data[k].vis || []; const conf = Math.min(v[15] ?? 1, v[16] ?? 1); sum += conf * ((-w[15][2]) - (-w[16][2])) + 0.3 * (out[k].lWri.z - out[k].rWri.z); }
    for (let k = a; k <= b; k++) front[k] = sum >= 0 ? 'l' : 'r'; stat.crossRuns++; n = m;
  }
  const keys = ['lElb', 'lWri', 'rElb', 'rWri'], o0 = out.map((J) => keys.map((k) => J[k].clone()));
  for (let n = 0; n < N; n++) resolveFrame(out[n], B[n], front[n], stat);
  if (globalThis.V5_NOSMOOTH) return stat;
  // smooth the corrections over time (5-frame triangular average), so nothing pops, then resolve the small residual
  const dl = keys.map((k, i) => out.map((J, n) => J[k].clone().sub(o0[n][i])));
  const TW = [1, 2, 3, 2, 1], sm = dl.map((d) => d.map((_, n) => { const v = new THREE.Vector3(); TW.forEach((w, q) => v.addScaledVector(d[Math.min(N - 1, Math.max(0, n + q - 2))], w / 9)); return v; }));
  for (let n = 0; n < N; n++) {
    const J = out[n];
    for (const s of ['l', 'r']) {
      const ie = s === 'l' ? 0 : 2;
      J[s + 'Elb'] = J[s + 'Sho'].clone().addScaledVector(o0[n][ie].clone().add(sm[ie][n]).sub(J[s + 'Sho']).normalize(), P.ua);
      J[s + 'Wri'] = J[s + 'Elb'].clone().addScaledVector(o0[n][ie + 1].clone().add(sm[ie + 1][n]).sub(J[s + 'Elb']).normalize(), P.fa);
    }
    resolveFrame(J, B[n], front[n], stat);
  }
  return stat;
}
function solveArms5(j, out, N) {
  const D = j.data, asp = j.aspect || 0.5625;
  const I = (n, k) => new THREE.Vector3(D[n].img[k][0] * asp, -D[n].img[k][1], 0);           // picture position, +y up
  const t2 = D.map((_, n) => I(n, 11).add(I(n, 12)).multiplyScalar(0.5).distanceTo(I(n, 23).add(I(n, 24)).multiplyScalar(0.5)));
  const tor = t2.map((_, n) => { const w = []; for (let d = -7; d <= 7; d++) w.push(t2[Math.min(N - 1, Math.max(0, n + d))]); w.sort((a, b) => a - b); return w[7]; });
  const vis = (n, k) => (D[n].vis ? D[n].vis[k] : 1);
  const HI = { l: [17, 19], r: [18, 20] };
  const P2 = (n, k, s) => (k === 'H' ? I(n, HI[s][0]).add(I(n, HI[s][1])).multiplyScalar(0.5) : I(n, k));
  const Wv = (n, k, s) => (k === 'H' ? V(D[n].w[HI[s][0]]).add(V(D[n].w[HI[s][1]])).multiplyScalar(0.5) : V(D[n].w[k]));
  const VI = (n, k, s) => (k === 'H' ? Math.min(vis(n, HI[s][0]), vis(n, HI[s][1])) : vis(n, k));
  const BONES = { l: [[11, 13, 'ua'], [13, 15, 'fa'], [15, 'H', 'hd']], r: [[12, 14, 'ua'], [14, 16, 'fa'], [16, 'H', 'hd']] };
  const Lref = {};
  for (const s of ['l', 'r']) for (const [a, b, nm] of BONES[s]) {
    const v = []; for (let n = 0; n < N; n++) if (VI(n, a, s) > 0.5 && VI(n, b, s) > 0.5) v.push(P2(n, b, s).distanceTo(P2(n, a, s)) / tor[n]);
    v.sort((x, y) => x - y); Lref[s + nm] = v.length > 20 ? v[Math.floor(v.length * 0.92)] : null;
  }
  for (const nm of ['ua', 'fa', 'hd']) { const a = Lref['l' + nm], b = Lref['r' + nm], m = a && b ? (a + b) / 2 : a || b; Lref['l' + nm] = Lref['r' + nm] = m; }
  const LEN = { ua: P.ua, fa: P.fa, hd: 0.10 }, RAD = { ua: BODY5.ua, fa: BODY5.fa, hd: BODY5.hand };
  const stats = { Lref: { ua: +Lref.lua.toFixed(3), fa: +Lref.lfa.toFixed(3), hd: +Lref.lhd.toFixed(3) }, clamped: 0, flips: 0 };
  const B = out.map(bodyFrame), res = {};
  for (const s of ['l', 'r']) {
    let base = out.map((J) => J[s + 'Sho'].clone()); const dirs = {};
    for (const [a, b, nm] of BONES[s]) {
      const C = [], U = [];
      for (let n = 0; n < N; n++) {
        const d = P2(n, b, s).sub(P2(n, a, s)).divideScalar(tor[n] * Lref[s + nm]); let r = d.length(); if (r > 1) { d.divideScalar(r); r = 1; stats.clamped++; }
        const dz = Math.sqrt(Math.max(0, 1 - r * r)), cs = [new THREE.Vector3(d.x, d.y, dz), new THREE.Vector3(d.x, d.y, -dz)]; C.push(cs);
        const wv = Wv(n, b, s).sub(Wv(n, a, s)), wl = wv.length(), wz = wl > 1e-6 ? wv.z / wl : 0;
        const conf = Math.min(1, Math.max(0, (Math.min(VI(n, a, s), VI(n, b, s)) - 0.2) / 0.6)) * Math.abs(wz);
        const u = [0, 0];
        for (let k = 0; k < 2; k++) {
          const sg = k === 0 ? 1 : -1, dir = cs[k];
          if (Math.sign(wz) !== sg) u[k] += 1.2 * conf;
          if (sg < 0) u[k] += 0.12 * dz;                                                      // in front of the body when unsure
          let pen = 0;
          for (const t of nm === 'ua' ? [0.7, 1] : [0.5, 1]) { const q = base[n].clone().addScaledVector(dir, LEN[nm] * t); pen = Math.max(pen, torsoPen(B[n], q, RAD[nm]), headPen(B[n], q, RAD[nm])); }
          if (nm === 'fa') { const tip = base[n].clone().addScaledVector(dir, LEN.fa + 0.12); pen = Math.max(pen, torsoPen(B[n], tip, BODY5.hand), headPen(B[n], tip, BODY5.hand)); }
          u[k] += 25 * pen;
        }
        U.push(u);
      }
      const cost = [U[0].slice()], back = [[0, 0]];
      for (let n = 1; n < N; n++) {
        const c = [0, 0], bk = [0, 0];
        for (let k = 0; k < 2; k++) { let bv = 1e9, bi = 0; for (let q = 0; q < 2; q++) { const v = cost[n - 1][q] + 3 * C[n][k].distanceToSquared(C[n - 1][q]); if (v < bv) { bv = v; bi = q; } } c[k] = bv + U[n][k]; bk[k] = bi; }
        cost.push(c); back.push(bk);
      }
      const pick = new Array(N); pick[N - 1] = cost[N - 1][0] <= cost[N - 1][1] ? 0 : 1; for (let n = N - 1; n > 0; n--) pick[n - 1] = back[n][pick[n]];
      for (let n = 1; n < N; n++) if (pick[n] !== pick[n - 1] && Math.abs(C[n][0].z) > 0.3) stats.flips++;
      dirs[nm] = (globalThis.V5_NOLIMIT ? (a) => a : (a, l) => limitTurn(a, l))(pick.map((k, n) => C[n][k].clone()), pick.map((k, n) => Math.hypot(C[n][k].x, C[n][k].y) * (nm === 'hd' ? 0.2 : 0.3)));
      base = base.map((p, n) => p.clone().addScaledVector(dirs[nm][n], LEN[nm]));
    }
    res[s] = dirs;
  }
  for (let n = 0; n < N; n++) for (const s of ['l', 'r']) {
    const J = out[n]; J[s + 'Elb'] = J[s + 'Sho'].clone().addScaledVector(res[s].ua[n], P.ua); J[s + 'Wri'] = J[s + 'Elb'].clone().addScaledVector(res[s].fa[n], P.fa);
    J[s + 'HandDir'] = res[s].hd[n].clone().lerp(res[s].fa[n], 0.35).normalize();
  }
  if (!globalThis.V5_NORESOLVE) stats.resolve = resolve5(j, out, N, B);
  return stats;
}

// v6: leg-leg overlap left after resolveLegs (the thighs cross in the blue-light shot 546-549 and at 363-364). The needed separation is spread over
// time (max over +-4 frames, then a 9-frame triangular average) so nothing pops; each knee moves sideways away from the other leg (hip and ankle
// fixed, two-bone IK, so the feet stay planted), then resolveLegs runs again for the depth.
function legOverlap6(J) {
  let w = 0;
  for (const [a1, b1, r1] of [['Hip', 'Knee', BODY5.th], ['Knee', 'Ank', BODY5.sh]]) for (const [a2, b2, r2] of [['Hip', 'Knee', BODY5.th], ['Knee', 'Ank', BODY5.sh]]) w = Math.max(w, r1 + r2 - segSeg(J['l' + a1], J['l' + b1], J['r' + a2], J['r' + b2])[0]);
  return w;
}
function separateLegs6(out, N) {
  const stat = { before: 0, after: 0, frames: 0, maxAngle: 0 };
  const AX = (J, s) => J[s + 'Ank'].clone().sub(J[s + 'Hip']).normalize();
  const turnKnees = (J, J0, th) => {                  // both knees turn outward about their hip-ankle axes by th (radians); hips and ankles stay
    const lat = J0.lHip.clone().sub(J0.rHip).normalize();
    for (const [s, sg] of [['l', 1], ['r', -1]]) {
      const H = J0[s + 'Hip'], ax = AX(J0, s), v = J0[s + 'Knee'].clone().sub(H), side = new THREE.Vector3().crossVectors(ax, v).dot(lat);
      // the sign that moves the knee toward +lat (left leg) or -lat (right leg)
      const q1 = new THREE.Quaternion().setFromAxisAngle(ax, th), q2 = new THREE.Quaternion().setFromAxisAngle(ax, -th);
      const a = v.clone().applyQuaternion(q1), b = v.clone().applyQuaternion(q2);
      J[s + 'Knee'] = H.clone().add(sg * (a.dot(lat) - b.dot(lat)) >= 0 ? a : b); void side;
    }
  };
  const need = out.map((J) => { const o = legOverlap6(J); if (o > 0.01) stat.before++; if (o <= 0.005) return 0;   // only real overlap (over 0.5 cm), never the ordinary near-touching stance
    const J0 = { lHip: J.lHip, rHip: J.rHip, lAnk: J.lAnk, rAnk: J.rAnk, lKnee: J.lKnee.clone(), rKnee: J.rKnee.clone() }, T = { ...J0 };
    for (let th = 0.03; th <= 0.75; th += 0.03) { turnKnees(T, J0, th); if (legOverlap6(T) <= -0.003) return th; }
    return 0.75; });
  const mx = need.map((_, n) => { let m = 0; for (let d = -4; d <= 4; d++) m = Math.max(m, need[Math.min(N - 1, Math.max(0, n + d))]); return m; });
  const sm = mx.map((_, n) => { let s = 0, c = 0; for (let d = -4; d <= 4; d++) { const w = 5 - Math.abs(d); s += w * mx[Math.min(N - 1, Math.max(0, n + d))]; c += w; } return s / c; });
  for (let n = 0; n < N; n++) {
    if (sm[n] < 0.002) continue;
    const J = out[n], J0 = { lHip: J.lHip, rHip: J.rHip, lAnk: J.lAnk, rAnk: J.rAnk, lKnee: J.lKnee.clone(), rKnee: J.rKnee.clone() };
    turnKnees(J, J0, sm[n]); stat.frames++; stat.maxAngle = Math.max(stat.maxAngle, +sm[n].toFixed(2));
  }
  stat.after = out.filter((J) => legOverlap6(J) > 0.01).length;
  return stat;
}
// v8: spike filter + re-timing of the arm bones (after every other step). A frame whose bone turn is > SPIKE.min deg and > SPIKE.k x the mean of
// its two neighbours' turns is a one-frame pop: the frames around it (+-R) are re-timed along the SAME path (cumulative turn angle, cubic Hermite
// in time with the entry / exit speeds), so the move keeps its full size and only its timing is spread over 2R frames. Repeats with a wider R
// while pops remain. Hand direction / side turn with the forearm.
export const SPIKE = { min: 12, k: 2.5, R0: 3, Rmax: 6, passes: 8 };
const angBetween = (a, b) => Math.acos(Math.min(1, Math.max(-1, a.dot(b))));
function turns(d) { const a = new Array(d.length).fill(0); for (let n = 1; n < d.length; n++) a[n] = angBetween(d[n - 1], d[n]); return a; }
function retimeWindow(d, a0, a1, N) {
  const A = Math.max(1, a0), B = Math.min(N - 2, a1); const a = turns(d);
  const c = [0]; for (let n = A + 1; n <= B; n++) c.push(c[c.length - 1] + a[n]);
  const L = B - A, total = c[L], v0 = Math.min(a[A], total / L * 1.5), v1 = Math.min(a[B + 1], total / L * 1.5);
  const path = d.slice(A, B + 1).map((v) => v.clone()); let prev = 0;
  for (let i = 1; i < L; i++) {
    const t = i / L, h00 = 2 * t ** 3 - 3 * t ** 2 + 1, h10 = t ** 3 - 2 * t ** 2 + t, h01 = -2 * t ** 3 + 3 * t ** 2, h11 = t ** 3 - t ** 2;
    let s = h01 * total + (h10 * v0 + h11 * v1) * L; s = Math.min(total, Math.max(prev, s)); prev = s;
    let k = 0; while (k < L - 1 && c[k + 1] < s) k++;
    const f = c[k + 1] > c[k] ? (s - c[k]) / (c[k + 1] - c[k]) : 0;
    const q = new THREE.Quaternion().setFromUnitVectors(path[k], path[k + 1]); const qf = new THREE.Quaternion().slerp(q, f);
    d[A + i] = path[k].clone().applyQuaternion(qf).normalize();
  }
}
export function retimeArms8(out, N, forced = []) {
  // forced: [[side, bone, frame, R], ...] from tools/retime8.py (one-frame jumps of the PROJECTED picture angle, found by the analyze7 metric):
  // that bone is re-timed over frame-R .. frame+R-1 the same way. Bones: ua/fa (arms), th/sh (thigh / shin; heel and toe follow the ankle).
  const stat = { fixed: [], left: [], forced: forced.length };
  const CH = { ua: ['Sho', 'Elb'], fa: ['Elb', 'Wri'], th: ['Hip', 'Knee'], sh: ['Knee', 'Ank'] };
  for (const s of ['l', 'r']) {
    const D = {}, Ln = {}, D0 = {};
    for (const nm of ['ua', 'fa', 'th', 'sh']) { const [a, b] = CH[nm]; Ln[nm] = out.map((J) => J[s + b].distanceTo(J[s + a])); D[nm] = out.map((J) => J[s + b].clone().sub(J[s + a]).normalize()); D0[nm] = D[nm].map((v) => v.clone()); }
    // bridge: a bone that flips > 45 deg in one frame and comes back within 6 frames (546-549: the right thigh pointed backward, a solver
    // artefact) is replaced over the excursion by the rotation between the frames either side; the thigh's shin (or the arm's forearm) follows.
    stat.bridged = stat.bridged || [];
    for (const [nm, dep] of [['th', 'sh'], ['ua', 'fa'], ['fa', null], ['sh', null]]) {
      const d = D[nm], deg = (a, b) => angBetween(a, b) * 180 / Math.PI;
      for (let n = 1; n < N - 1; n++) {
        if (deg(d[n - 1], d[n]) <= 45) continue;
        for (let m = n + 1; m <= Math.min(N - 1, n + 6); m++) if (deg(d[m - 1], d[m]) > 45 && deg(d[n - 1], d[m]) < 30) {
          for (const bn of dep ? [nm, dep] : [nm]) { const a = D[bn][n - 1].clone(), b = D[bn][m].clone(), q = new THREE.Quaternion().setFromUnitVectors(a, b);
            for (let k = n; k < m; k++) D[bn][k] = a.clone().applyQuaternion(new THREE.Quaternion().slerp(q, (k - n + 1) / (m - n + 1))).normalize(); }
          stat.bridged.push(s + nm + n + '-' + (m - 1)); n = m; break;
        }
      }
    }
    for (const [fs, nm, n, R] of forced) if (fs === s && D[nm]) retimeWindow(D[nm], n - R, n + R - 1, N);
    for (const nm of ['ua', 'fa']) {
      const d = D[nm]; const R = new Array(N).fill(SPIKE.R0);
      for (let p = 0; p < SPIKE.passes; p++) {
        const a = turns(d).map((x) => x * 180 / Math.PI); let any = false;
        for (let n = 2; n < N - 2; n++) {
          if (a[n] > SPIKE.min && a[n] > SPIKE.k * (a[n - 1] + a[n + 1]) / 2) {
            any = true; if (p === 0) stat.fixed.push(s + nm + n);
            retimeWindow(d, n - R[n], n + R[n] - 1, N); for (let m = n - 2; m <= n + 2; m++) if (m >= 0 && m < N) R[m] = Math.min(SPIKE.Rmax, R[m] + 1);
            n += 2;
          }
        }
        if (!any) break;
      }
      const a = turns(d).map((x) => x * 180 / Math.PI);
      for (let n = 2; n < N - 2; n++) if (a[n] > SPIKE.min && a[n] > SPIKE.k * (a[n - 1] + a[n + 1]) / 2) stat.left.push(s + nm + n);
    }
    for (let n = 0; n < N; n++) {
      const J = out[n];
      J[s + 'Elb'] = J[s + 'Sho'].clone().addScaledVector(D.ua[n], Ln.ua[n]); J[s + 'Wri'] = J[s + 'Elb'].clone().addScaledVector(D.fa[n], Ln.fa[n]);
      const q = new THREE.Quaternion().setFromUnitVectors(D0.fa[n], D.fa[n]);
      if (J[s + 'HandDir']) J[s + 'HandDir'] = J[s + 'HandDir'].clone().applyQuaternion(q).normalize();
      if (J[s + 'HandSide']) J[s + 'HandSide'] = J[s + 'HandSide'].clone().applyQuaternion(q).normalize();
      if (D.th[n].distanceTo(D0.th[n]) > 1e-9 || D.sh[n].distanceTo(D0.sh[n]) > 1e-9) {
        const ank0 = J[s + 'Ank'].clone();
        J[s + 'Knee'] = J[s + 'Hip'].clone().addScaledVector(D.th[n], Ln.th[n]); J[s + 'Ank'] = J[s + 'Knee'].clone().addScaledVector(D.sh[n], Ln.sh[n]);
        const dA = J[s + 'Ank'].clone().sub(ank0); for (const k of ['Heel', 'Toe']) if (J[s + k]) J[s + k] = J[s + k].clone().add(dA);
      }
    }
  }
  return stat;
}
// v8: whole-pose bridge for listed runs [a, b]: every joint of frames a..b is re-made from frames a-1 and b+1 (positions relative to the hip
// centre interpolated, the hip centre and root interpolated, quaternions slerped, directions re-normalised), then each limb chain is put back to
// its own bone lengths from its base joint. Used where the whole body holds a wrong pose for 1-4 frames and snaps back.
export function bridgePose8(out, N, runs) {
  const CH = [['Sho', 'Elb', 'Wri'], ['Hip', 'Knee', 'Ank']];
  for (const [a, b] of runs) {
    const A = out[a - 1], B = out[b + 1]; if (!A || !B) continue;
    for (let n = a; n <= b; n++) {
      const t = (n - a + 1) / (b - a + 2), J = out[n], L = {};
      for (const s of ['l', 'r']) for (const c of CH) for (let i = 1; i < 3; i++) L[s + c[i]] = J[s + c[i]].distanceTo(J[s + c[i - 1]]);
      const hA = A.hipC, hB = B.hipC, hc = hA.clone().lerp(hB, t);
      for (const k of Object.keys(J)) {
        const va = A[k], vb = B[k]; if (va === undefined || vb === undefined) continue;
        if (va && va.isQuaternion) J[k] = va.clone().slerp(vb, t);
        else if (va && va.isVector3) {
          if (k.endsWith('Dir') || k.endsWith('Side')) J[k] = va.clone().lerp(vb, t).normalize();
          else if (k === 'hipC' || k === 'root') J[k] = va.clone().lerp(vb, t);
          else J[k] = va.clone().sub(hA).lerp(vb.clone().sub(hB), t).add(hc);
        } else if (typeof va === 'number' && typeof vb === 'number') J[k] = va + (vb - va) * t;
      }
      for (const s of ['l', 'r']) for (const c of CH) for (let i = 1; i < 3; i++) {
        const d0 = J[s + c[i]].clone(), base = J[s + c[i - 1]], dir = d0.clone().sub(base).normalize(); J[s + c[i]] = base.clone().addScaledVector(dir, L[s + c[i]]);
        if (c[i] === 'Ank') { const dA = J[s + 'Ank'].clone().sub(d0); for (const k of ['Heel', 'Toe']) if (J[s + k]) J[s + k] = J[s + k].clone().add(dA); }
      }
    }
  }
  return runs;
}

// v10: one pose between two neighbouring frames (as bridgePose8: positions relative to the hip centre lerped, quaternions slerped,
// directions re-normalised, then each limb chain put back to frame A's bone lengths along its own direction). Other fields: the nearer frame's.
const CH10 = [['Sho', 'Elb', 'Wri'], ['Hip', 'Knee', 'Ank']];
export function lerpJ10(A, B, t) {
  const J = {}, near = t < 0.5 ? A : B, hc = A.hipC.clone().lerp(B.hipC, t);
  for (const k of Object.keys(A)) {
    const va = A[k], vb = B[k];
    if (va && va.isQuaternion && vb && vb.isQuaternion) J[k] = va.clone().slerp(vb, t);
    else if (va && va.isVector3 && vb && vb.isVector3) {
      if (k.endsWith('Dir') || k.endsWith('Side')) J[k] = va.clone().lerp(vb, t).normalize();
      else if (k === 'hipC' || k === 'root') J[k] = va.clone().lerp(vb, t);
      else J[k] = va.clone().sub(A.hipC).lerp(vb.clone().sub(B.hipC), t).add(hc);
    } else if (typeof va === 'number' && typeof vb === 'number') J[k] = va + (vb - va) * t;
    else J[k] = near[k] && near[k].clone ? near[k].clone() : near[k];
  }
  for (const s of ['l', 'r']) for (const c of CH10) for (let i = 1; i < 3; i++) {
    const L = A[s + c[i]].distanceTo(A[s + c[i - 1]]) * (1 - t) + B[s + c[i]].distanceTo(B[s + c[i - 1]]) * t;
    const d0 = J[s + c[i]].clone(), base = J[s + c[i - 1]], dir = d0.clone().sub(base).normalize(); J[s + c[i]] = base.clone().addScaledVector(dir, L);
    if (c[i] === 'Ank') { const dA = J[s + 'Ank'].clone().sub(d0); for (const k of ['Heel', 'Toe']) if (J[s + k]) J[s + k] = J[s + k].clone().add(dA); }
  }
  return J;
}
// v10: wrist offsets [[side, frame, dx, dy, dz], ...] (performer metres, from tools/armfix10.py): the arm is re-solved by two-bone IK from the
// shoulder to the moved wrist, the elbow bending toward its old side (pole = old elbow); bone lengths kept; the hand turns with the forearm.
export function armFix10(out, list) {
  let n0 = 0;
  for (const [s, n, dx, dy, dz] of list) {
    const J = out[n]; if (!J) continue;
    const S = J[s + 'Sho'], E0 = J[s + 'Elb'], W0 = J[s + 'Wri'], a = E0.distanceTo(S), b = W0.distanceTo(E0);
    const T = W0.clone().add(new THREE.Vector3(dx, dy, dz)); let d = T.clone().sub(S); const L = Math.min(Math.max(d.length(), Math.abs(a - b) + 1e-3), a + b - 1e-3); d.normalize();
    const pole = E0.clone().sub(S); pole.addScaledVector(d, -pole.dot(d)); if (pole.length() < 1e-6) pole.set(0, -1, 0); pole.normalize();
    const x = (a * a - b * b + L * L) / (2 * L), h = Math.sqrt(Math.max(0, a * a - x * x));
    const E = S.clone().addScaledVector(d, x).addScaledVector(pole, h), W = S.clone().addScaledVector(d, L);
    const fa0 = W0.clone().sub(E0).normalize(), fa1 = W.clone().sub(E).normalize(), q = new THREE.Quaternion().setFromUnitVectors(fa0, fa1);
    J[s + 'Elb'] = E; J[s + 'Wri'] = W;
    for (const k of ['HandDir', 'HandSide']) if (J[s + k]) J[s + k] = J[s + k].clone().applyQuaternion(q).normalize();
    n0++;
  }
  return n0;
}
