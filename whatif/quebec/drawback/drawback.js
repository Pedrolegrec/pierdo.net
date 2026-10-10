// wifdscene1: "POV: the sea pulls back at Quebec's Old Port" (72 s). Water level by time, the quay camera (spot A), quay walls, stranded boats.
// Loaded by main.js when ?tl=drawback. Scene frame: origin = Terrace railing, x east, z south, y up; level L (m vs mean river) -> world y = L - 0.65.
import * as THREE from 'three';
const mergeGeometries = (gs) => { const out = new THREE.BufferGeometry();   // non-indexed parts with position, normal, color
  for (const k of ['position', 'normal', 'color']) { const n = gs.reduce((a, g) => a + g.attributes[k].array.length, 0), a = new Float32Array(n); let o = 0;
    for (const g of gs) { a.set(g.attributes[k].array, o); o += g.attributes[k].array.length; } out.setAttribute(k, new THREE.BufferAttribute(a, 3)); } return out; };

const P = new URLSearchParams(location.search), num = (k, d) => (P.has(k) ? Number(P.get(k)) : d);
export const DB_DURATION = 74.0;   // wifdtext1: 72 -> 74 s (end card 69-74 s, 2,220 frames)
export const MEAN_Y = -0.65;

// ---- water level: ONE table, [time s, level m vs mean]. Retime by editing the rows. Monotone cubic (PCHIP): no overshoot, no stop at each key
// except where the table holds flat (0-2 s, 46-54 s, 69-72 s).
export const DB_LEVEL_KEYS = [[0, 0], [2, 0], [8, -2], [18, -8], [32, -20], [46, -30], [54, -30], [64, 4], [69, 0], [72, 0], [74, 0]];
const pchip = (K) => { const n = K.length, h = [], d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) { h[i] = K[i + 1][0] - K[i][0]; d[i] = (K[i + 1][1] - K[i][1]) / h[i]; }
  for (let i = 1; i < n - 1; i++) if (d[i - 1] * d[i] > 0) { const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]); }
  return (t) => { if (t <= K[0][0]) return K[0][1]; if (t >= K[n - 1][0]) return K[n - 1][1]; let i = 0; while (t > K[i + 1][0]) i++;
    const s = (t - K[i][0]) / h[i], s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * K[i][1] + (s3 - 2 * s2 + s) * h[i] * m[i] + (-2 * s3 + 3 * s2) * K[i + 1][1] + (s3 - s2) * h[i] * m[i + 1]; }; };
export const dbLevel0 = pchip(DB_LEVEL_KEYS);
// ---- wifdscene7: the returning wave. After FRONT_T0 the water is a level FIELD along the river's downstream axis (az DB_RIV_AZ; s m downstream
// of DB_CAM, n m across toward Levis). FRONT_KEYS = our side's front position s (m) vs time, linear, retimable. Elsewhere the front has run
// c(n)/c(0) times as far, c = sqrt(g d), d(n) 15 m near us -> 30 m in the channel by Levis (12.1 -> 17.2 m/s): a curved front, leading in the
// channel. Speed-up 1.5x (18.15 m/s on our side) to fit 46-60 s. Ahead of the front -30; behind it the level rises over R m to DB_LTOP(t), plus
// a lip H (1.2 m near us, 3.8 m in the channel) that grows 46-55 s. Same formula in water.js (vertex shader); keep both in step.
export const DB_RIV_AZ = num('dbriv', 50), FRONT_T0 = 46;
// wifdscene10: a TRAIN of three breaking bores replaces the single long rise. Tables (our side, linear, retimable): s (m downstream of DB_CAM) vs t.
// Bore 1 keeps the wifdscene8 basis (20.9 m/s over the near-dry bed, under the dam-break tip limit 2 sqrt(g h)); later bores ride deeper, already
// moving water and run faster (sqrt(g d) on d 12 / 24 m = 10.8 / 15.3 m/s plus the upstream flow behind the previous bore): 22.5 and 25 m/s.
// Steps at our wall: -30 > -18 (bore 1, 56 s) > -6 (bore 2, 59.5 s) > top +4 (bore 3, 62.5 s), then DB_LTOP settles to 0 by 69 s.
export const BORE_KEYS = [[[46, 209], [56, 0], [72, -334.4]], [[46, 303.75], [59.5, 0], [72, -281.25]], [[46, 412.5], [62.5, 0], [72, -237.5]]];
export const FRONT_KEYS = BORE_KEYS[0];
const DB_LTOP = pchip([[46, 4], [64, 4], [69, 0], [72, 0]]);
const sm = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
const lin1 = (K, t) => { let i = 1; while (i < K.length - 1 && t > K[i][0]) i++; const a = K[i - 1], b = K[i]; return a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0]); };
const RD = [Math.sin(DB_RIV_AZ * Math.PI / 180), -Math.cos(DB_RIV_AZ * Math.PI / 180)];
const depN = (n) => 15 + 15 * sm(150, 450, n) * (1 - sm(900, 1150, n));
export const dbFront = (t) => ({ on: t > FRONT_T0 ? 1 : 0, s0: BORE_KEYS.map((K) => K[0][1]), sn: BORE_KEYS.map((K) => lin1(K, t)), top: DB_LTOP(t), gr: sm(FRONT_T0, FRONT_T0 + 1.8, t), lipg: sm(46, 55, t) * (1 - sm(64, 69, t)) });
const BORE_UP = (top, gr = 1) => [12 * gr, 12 * gr, (top + 6) * gr];   // level steps (m) of bores 1-3; wifdboat1: gr grows the faces in over 46-47.8 s (they popped in at full height); arrival times unchanged
export function dbFieldB(t, x, z) { const F = dbFront(t), px = x - DB_CAM.x, pz = z - DB_CAM.z, s = px * RD[0] + pz * RD[1], n = -px * RD[1] + pz * RD[0];
  const d = depN(n), r = Math.sqrt(d / 15); return { F, b: F.s0.map((s0, i) => s - (s0 - (s0 - F.sn[i]) * r)), r }; }
export function dbFieldLevel(t, x, z) { if (t <= FRONT_T0) return dbLevel0(t); const { F, b, r } = dbFieldB(t, x, z);
  // wifdscene10: each bore a steep face over Wf = 16 + 6(r-1) m (smoothstep; d10a's 9 m zigzagged on the grid), a roller bump 0.1 step r^2 (6 m) near its top; flat water between
  const Wf = 16 + 6 * (r - 1), up = BORE_UP(F.top, F.gr); let L = -30;
  for (let i = 0; i < 3; i++) L += up[i] * sm(0, Wf, b[i]) + 0.1 * up[i] * r * r * F.lipg * Math.exp(-(((b[i] - 0.8 * Wf) / 6) ** 2));
  return L; }
export function dbWaterUniforms(U, t) { const F = dbFront(t); U.uFOn.value = F.on; if (U.uGr) U.uGr.value = F.gr; U.uS0.value = F.s0[0]; U.uSN.value = F.sn[0]; U.uLtop.value = F.top + MEAN_Y;
  U.uB0.value.set(...F.s0); U.uBN.value.set(...F.sn);
  U.uBaseY.value = -30 + MEAN_Y; U.uLipG.value = F.lipg; U.uO.value.set(DB_CAM.x, DB_CAM.z); U.uD.value.set(RD[0], RD[1]); U.uSilt.value = 1.0 - 0.4 * sm(66, 72, t);   /* wifdscene11: silty brown between bores (was 0.8, 1 - 0.6 late) */
  if (U.uDeckF) { const k = 0.7071, dir = t < 64.6 ? -1 : 1; U.uDeckF.value.set(dir * k, dir * k, sm(62.8, 63.2, t) * (1 - sm(66.5, 68.5, t))); } }   /* deck flow: in over the corner edge, then back off it */
export const dbLevel = (t) => (t > FRONT_T0 ? dbFieldLevel(t, 235.6, -157) : dbLevel0(t));   // metres vs mean at our wall (the counter's number)
export const dbWaterY = (t) => dbLevel(t) + MEAN_Y;      // world y of the water plane

// ---- camera, spot A: at the south edge of the Lower Town pier north of the ferry berth (terrain quay top about 3.0 m), r1 stood 40 m back (all pier top),
// wifdscene3: spot B, planned with a terrain script (log.md): the NE corner of the same pier (edge 3.25 m ahead), looking SE straight across to Levis; the ferry sits 250 m out on the crossing line (bed about -25 m) and grounds there.
// looking SSE across the river to Levis. Overrides: ?dbx= dbz= dbaz= dbp= dbf= dbeye= ; push = fov narrowing over 60 s (4 %).
export const DB_CAM = { x: num('dbx', 232), z: num('dbz', -157), eye: num('dbeye', 1.7), az: num('dbaz', 138), pitch: num('dbp', 14), fov: num('dbf', 74), push: num('dbpush', 0.04) };
// wifdscene4: "lean over the edge". DB_CAM_KEYS rows [t s, forward m along az, pitch deg]; each segment eased with smootherstep (zero velocity
// at every key). The eye height stays 1.7 m above the quay top at the start spot (not the ground under the eye, which is the bed once we lean
// out). forward 5.2 = the head 0.5 m past the east wall face (x 235) along az 138: the body leans over the coping. Override ?dbcamk=0 to hold.
// r2: rows [t, forward m along DB_LEAN_AZ, pitch, az]; the lean turns to face the east wall's normal (az 95) so the face spans the frame bottom.
// wifdscene5: look ALONG the east face: walk 3.49 m along az 81.8 to (235.45, -157.5) (head 0.45 m past the face, 6.5 m north of the corner),
// turn to az 162 (toward the corner and Levis), pitch 35 (planner: corner top at row ~25 %, its wet foot ~84 %, Levis skyline at the top edge).
export const DB_LEAN_AZ = 81.8;
export const DB_CAM_KEYS = [[0, 0, 14, 138], [20, 0, 14, 138], [25, 3.8, 38, 174], [28, 3.8, 38, 174], [32, 0, 14, 138], [50, 0, 14, 138], [54, 0, 11, 112], [57, 0, 12, 104], [59.5, 0, 15, 108], [61.5, -1.4, 19, 122], [64, -1.4, 16, 134], [68, 0, 14, 138], [72, 0, 14, 138]];
const camKey = (t) => { const K = DB_CAM_KEYS; if (!num('dbcamk', 1) || t <= K[0][0]) return K[0]; for (let i = 1; i < K.length; i++) if (t <= K[i][0]) {
  const a = K[i - 1], b = K[i], u = (t - a[0]) / (b[0] - a[0]), e = u * u * u * (u * (u * 6 - 15) + 10); return [t, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e, a[3] + (b[3] - a[3]) * e]; }
  return K[K.length - 1]; };
export function dbCamera(camera, t, gh) {
  const C = DB_CAM, r = Math.PI / 180, y = gh(C.x, C.z) + C.eye, k = Math.min(1, t / 60), e = k * k * (3 - 2 * k);
  const [, fwd, pk, ak] = camKey(t), sway = num('dbsway', 1);
  const az = ak - 138 + C.az + sway * (0.22 * Math.sin(t * 0.37) + 0.12 * Math.sin(t * 0.83 + 1.0)), pitch = (pk - 14 + C.pitch) + sway * (0.15 * Math.sin(t * 0.51 + 2.0) + 0.08 * Math.sin(t * 1.13));
  const x = C.x + Math.sin(DB_LEAN_AZ * r) * fwd, z = C.z - Math.cos(DB_LEAN_AZ * r) * fwd;   // forward 4.0 -> head ~1 m past the east face (x 235)
  camera.fov = C.fov * (1 - C.push * e); camera.updateProjectionMatrix(); camera.position.set(x, y, z);
  camera.lookAt(x + Math.sin(az * r) * Math.cos(pitch * r) * 1000, y - Math.sin(pitch * r) * 1000, z - Math.cos(az * r) * Math.cos(pitch * r) * 1000);
}

// ---- quay walls: vertical faces where land (> 1.8 m) meets bed (< 0.5 m) on a 2 m grid in a box around the view, 0.2 m out from the land
// sample, top = land height, down to -40 m. Bands (level m vs mean): dry stone, pale high-tide line 1.9-2.3, wet dark below, darkest + glossy
// below the usual low tide (-2.1).
const lin = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const WC = { dry: lin(0x8a8378), pale: lin(0xb9b2a2), wet: lin(0x3d3a30), deep: lin(0x262a22) };
function buildWalls(gh, box = { x0: 120, x1: 340, z0: -300, z1: 40 }) {
  const S = 2, pos = [], col = [], LAND = 1.8, BED = 0.5, OUT = 0.2, BOT = -40;
  const bands = [[2.3, 'dry'], [1.9, 'pale'], [-2.1, 'wet'], [BOT - MEAN_Y, 'deep']];   // band lower edges (level m), colour above it
  const quad = (ax, az, bx, bz, top) => { // wall from top down to BOT, split into bands; faces built two-sided via material
    let yTop = top; for (const [lo, name] of bands) { const yLo = Math.max(BOT, lo + MEAN_Y); if (yLo >= yTop) continue; const c = WC[name];
      pos.push(ax, yTop, az, bx, yTop, bz, bx, yLo, bz, ax, yTop, az, bx, yLo, bz, ax, yLo, az); for (let k = 0; k < 6; k++) col.push(...c); yTop = yLo; } };
  let n = 0;
  for (let x = box.x0; x < box.x1; x += S) for (let z = box.z0; z < box.z1; z += S) {
    if (x >= CB.x0 && x <= CB.x1 && z >= CB.z0 && z <= CB.z1) continue;   // wifdscene4: the camera corner gets buildCornerWalls() instead
    const h = gh(x, z); if (h < LAND) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { if (gh(x + dx * S, z + dz * S) > BED) continue;
      const ox = x + dx * OUT, oz = z + dz * OUT, hx = dz * S / 2, hz = dx * S / 2;   // edge centred on the land sample, perpendicular to (dx,dz)
      quad(ox - hx, oz - hz, ox + hx, oz + hz, h + 0.05); n++; } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.0, side: THREE.DoubleSide })); m.name = 'quay-walls'; m.castShadow = m.receiveShadow = true; m.userData.edges = n;
  return m;
}

// ---- wifdscene4: the camera pier corner as two clean faces (east face x = 235 from z -177 to the corner, north face z = -151 from x 214 to the
// corner, both 3.05 m top down to -40), masonry blocks 1.4 x 0.55 m in running bond with per-block tone jitter and dark joints, the same level
// bands as buildWalls (applyWetness adds the live wet band and the 4 s drying band), plus a 0.35 m granite coping that covers the sloped
// terrain cell behind the face. Faces are one-sided, normals outward; the corner meets exactly at (235, -151).
const CB = { x0: 212, x1: 240, z0: -180, z1: -147 };
function buildCornerWalls(gh) {
  const TOP = 3.05, BOT = -40, BW = 1.4, BH = 0.55, J = 0.03, pos = [], col = [], nor = [];
  const bands = [[2.3, 'dry'], [1.9, 'pale'], [-2.1, 'wet'], [-1e9, 'deep']], bandAt = (y) => { for (const [lo, n] of bands) if (y - MEAN_Y >= lo) return WC[n]; return WC.deep; };
  const hash = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
  // face: origin (ox, oz), along unit (ux, uz) for length L, outward normal (nx, nz)
  const quad = (p, c, n) => { for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(...p[i]); col.push(...c); nor.push(...n); } };
  const face = (ox, oz, ux, uz, L, nx, nz, fid) => {
    const P = (s, y, o = 0) => [ox + ux * s + nx * o, y, oz + uz * s + nz * o];
    let row = 0; for (let y1 = TOP - 0.35; y1 > BOT; y1 -= BH, row++) { const y0 = Math.max(BOT, y1 - BH), off = (row % 2) * BW * 0.5;
      for (let s0 = -off; s0 < L; s0 += BW) { const a = Math.max(0, s0), b = Math.min(L, s0 + BW); if (b <= a) continue;
        const base = bandAt((y0 + y1) / 2), k = 0.84 + 0.3 * hash(fid * 97 + row, Math.round(s0 * 10)), c = base.map((v) => v * k);
        quad([P(a + J, y1 - J), P(b - J, y1 - J), P(b - J, y0 + J), P(a + J, y0 + J)], c, [nx, 0, nz]);
        const jc = base.map((v) => v * 0.45); quad([P(a, y1, -0.02), P(b, y1, -0.02), P(b, y0, -0.02), P(a, y0, -0.02)], jc, [nx, 0, nz]); } }
    // wifdscene5: narrow (0.5 m) dark granite coping in 0.6-0.9 m stones; each stone's front line, height and tone jitter (chipped, uneven)
    for (let s0 = 0, i = 0; s0 < L; i++) { const s1 = Math.min(L, s0 + 0.6 + 0.3 * hash(fid * 13 + i, 7)), fr = 0.04 + 0.07 * hash(fid * 31 + i, 3), dy = 0.025 * (hash(fid * 7 + i, 11) - 0.5);
      const k = 0.8 + 0.35 * hash(fid * 53 + i, 5), g = [0.19 * k, 0.19 * k, 0.185 * k], g2 = g.map((v) => v * 0.8), T = TOP + dy, e = 0.012;
      quad([P(s0 + e, T, fr), P(s1 - e, T, fr), P(s1 - e, TOP - 0.38, fr), P(s0 + e, TOP - 0.38, fr)], g2, [nx, 0, nz]);
      quad([P(s0 + e, T, -0.42), P(s1 - e, T, -0.42), P(s1 - e, T, fr), P(s0 + e, T, fr)], g, [0, 1, 0]);
      quad([P(s0, TOP - 0.04, -0.45), P(s1, TOP - 0.04, -0.45), P(s1, TOP - 0.04, fr + 0.01), P(s0, TOP - 0.04, fr + 0.01)], [0.06, 0.06, 0.06], [0, 1, 0]); s0 = s1; } };   /* wifdboat1: dark joint underlay 3 cm lower: at TOP - 0.01 it sat ABOVE stones with dy < -0.01 (T down to TOP - 0.0125) and z-fought them (corner flicker 0-3 s) */
  // east face runs from the corner (235, -151) toward -z; north face from the corner toward -x. Winding: counter-clockwise seen from outside.
  face(235, -177, 0, 1, 26, 1, 0, 1);  face(235, -151, -1, 0, 21, 0, 1, 2);
  const gm = new THREE.BufferGeometry(); gm.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gm.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); gm.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  const m = new THREE.Mesh(gm, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.0, side: THREE.DoubleSide })); m.name = 'corner-walls'; m.castShadow = m.receiveShadow = true;
  // wifdscene5: worn concrete pier top behind the coping (0.75 m cells, tone noise, stains, saw-cut joints every 4.5 m), x 212-234.6, z -177 to -151.4
  const tp = [], tc = [], C0 = 0.75, Y = TOP + 0.03;   /* wifdscene10: back to 3.09 (3.13 / 3.23 in d10b/d10c did not remove the facets, so no mesh covers it), clear of the terrain (peaks 3.1) that drew facets through it */   // wifdscene6: lifted above the pale quay ground that covered it in d6a
  /* wifdscene11: one quad, concrete drawn in the shader from world xz (the 0.75 m vertex-colour grid is gone), no applyWetness (own wet uniform) */
  for (const [a, b] of [[200, -195], [200, -151.4], [234.6, -151.4], [200, -195], [234.6, -151.4], [234.6, -195]]) { tp.push(a, Y + 0.01, b); tc.push(1, 1, 1); }
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3)); tg.setAttribute('color', new THREE.Float32BufferAttribute(tc, 3)); tg.computeVertexNormals();
  const top = new THREE.Mesh(tg, pierTopMat({ roughness: 0.95, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }));   /* wifdscene9: wins over the terrain (up to 3.1 m under it) */   /* wifdscene9: winding fixed to +y (d8's order faced -y: culled from above, so we saw the terrain pit) */ top.name = 'pier-top'; top.receiveShadow = false;   /* wifdscene10: shadow acne drew big triangle facets; extended to x 200 / z -195 (wedge) */ m.add(top);
  // two cast-iron bollards and a steel ladder top on the east face (z -153.3): rails down to the bed, rungs every 0.3 m, hoops 0.9 m above the coping
  const parts = [], bol = (x, z) => { parts.push(colorize(cyl(0.175, 0.38, x, TOP, z), 0x161718), colorize(cyl(0.21, 0.07, x, TOP + 0.38, z), 0x161718), colorize(cyl(0.12, 0.05, x, TOP + 0.45, z), 0x1e1f20)); };
  // wifdscene6: 0.5 m tall, 0.35 m wide cast iron; the near one at the across frame's left edge (planner: just outside x 0 %), the other north, out of view
  bol(234.35, -156.0); bol(234.2, -167.5);
  // wifdscene6: ladder on the east face at z -155 (2.5 m south of the lean head), rails end flush with the coping (no hoops: nothing above the
  // quay top in the across view); steel grey above the old high-tide line, wet rust below
  const LZ = -155, HT = MEAN_Y + 1.9, stl = (y) => (y > HT ? 0x5d5f5c : 0x4a3222);
  for (const dz of [-0.22, 0.22]) { const z = LZ + dz; parts.push(colorize(box(0.05, TOP - 0.02 - HT, 0.05, 235.08, HT, z), 0x5d5f5c), colorize(box(0.055, HT + 8, 0.055, 235.08, -8, z), 0x4a3222)); }
  for (let y = TOP - 0.3; y > -8; y -= 0.3) parts.push(colorize(box(0.04, 0.035, 0.44, 235.08, y, LZ), stl(y)));
  if (0) {
  for (const dz of [-0.22, 0.22]) { const z = -153.3 + dz; parts.push(colorize(box(0.05, 3.05 + 8 + 0.9, 0.05, 235.08, -8, z), 0x5d5f5c), colorize(box(0.6, 0.05, 0.05, 234.8, TOP + 0.88, z), 0x5d5f5c), colorize(box(0.05, 0.9, 0.05, 234.52, TOP, z), 0x5d5f5c)); }
  for (let y = TOP - 0.3; y > -8; y -= 0.3) parts.push(colorize(box(0.04, 0.035, 0.44, 235.08, y, -153.3), 0x4f514e)); }
  const fx = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35 })); fx.name = 'quay-fixtures'; fx.castShadow = fx.receiveShadow = true; m.add(fx);
  return m;
}

// ---- boats: hull from a box, bottom narrowed and ends tapered (bow sharper). Origin at the keel, length along +z (bow at +z).
function hullGeom(L, B, D, { bow = 0.15, stern = 0.75, bottom = 0.45 } = {}) {
  const g = new THREE.BoxGeometry(B, D, L, 4, 3, 10); g.translate(0, D / 2, 0); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), u = z / (L / 2), v = y / D;
    const end = u > 0 ? 1 - (1 - bow) * Math.pow(u, 2.2) : 1 - (1 - stern) * Math.pow(-u, 3), w = (bottom + (1 - bottom) * Math.sqrt(Math.max(0, v))) * end;
    p.setX(i, x * w); p.setY(i, y + (u > 0 ? 0.25 * D * u * u : 0)); }   // sheer rises to the bow
  g.computeVertexNormals(); return g; }
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
const cyl = (r, h, x, y, z) => new THREE.CylinderGeometry(r, r, h, 12).translate(x, y + h / 2, z);
const colorize = (g, hex) => { g = g.index ? g.toNonIndexed() : g; const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[3 * i] = c.r; a[3 * i + 1] = c.g; a[3 * i + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); if (g.attributes.uv) g.deleteAttribute('uv'); return g; };
const TYPES = {
  dory: () => ({ L: 5, B: 1.6, D: 0.8, draft: 0.25, parts: [[hullGeom(5, 1.6, 0.8, { bottom: 0.35 }), 0x24506a], [box(1.62, 0.12, 4.6, 0, 0.18, 0), 0x3a3628], [box(1.3, 0.06, 4, 0, 0.7, 0), 0x7a6245]] }),
  sloop: () => ({ L: 9, B: 3, D: 1.6, draft: 1.3, parts: [[hullGeom(9, 3, 1.6), 0xc9c6bb], [box(3.02, 0.15, 7.6, 0, 0.32, 0), 0x4a4434], [box(0.25, 1.4, 9 * 0.3, 0, -1.3, 0), 0x333333], [box(2, 0.6, 3, 0, 1.5, -0.6), 0xd9d6cc], [cyl(0.08, 11, 0, 1.5, 0.8), 0xcccccc]] }),
  work: () => ({ L: 12, B: 4, D: 2, draft: 1.2, parts: [[hullGeom(12, 4, 2, { stern: 0.85 }), 0x7e2a20], [box(4.05, 0.3, 10.4, 0, 0.35, 0), 0x2e2a22], [box(3.2, 2.2, 3.6, 0, 2, -1.5), 0xe8e4da], [cyl(0.09, 4, 0.8, 4.2, -1.5), 0x222222]] }),
  barge: () => ({ L: 30, B: 9, D: 2.6, draft: 1.8, parts: [[hullGeom(30, 9, 2.6, { bow: 0.8, stern: 0.9, bottom: 0.85 }), 0x2c3034], [box(9.1, 0.5, 29, 0, 0.6, 0), 0x4a3a28], [box(8, 1.2, 8, 0, 2.6, 2), 0x6f5636]] }),
  // Quebec-Levis ferry (double-ended, about 76 m x 18 m): hull, main deck, superstructure, wheelhouse, bow door, one funnel
  ferry: () => ({ L: 76, B: 18, D: 6.5, draft: 3.6, parts: [[hullGeom(76, 18, 6.5, { bow: 0.55, stern: 0.55, bottom: 0.6 }), 0x16263a],
    [box(18.3, 1.1, 74, 0, 0.2, 0), 0x3b3a30], [box(18.25, 0.5, 75, 0, 2.6, 0), 0x6a1f1a],   // waterline stain + boot top
    [box(16.8, 0.4, 72, 0, 6.3, 0), 0x55595e], [box(0.3, 1.1, 64, 7.9, 6.7, 0), 0xdcdcd6], [box(0.3, 1.1, 64, -7.9, 6.7, 0), 0xdcdcd6],   // open car deck + bulwarks
    [box(0.15, 0.02, 60, 2.5, 6.71, 0), 0xd8d8c8], [box(0.15, 0.02, 60, -2.5, 6.71, 0), 0xd8d8c8],   // lane lines
    [box(5.5, 7.5, 44, 5.6, 6.7, 0), 0xeeeee8], [box(5.6, 0.9, 42, 5.6, 9.6, 0), 0x2a3440], [box(7, 2.6, 7, 4.8, 14.2, 0), 0xf4f4ef], [box(7.2, 0.8, 7.2, 4.8, 15.6, 0), 0x27313d],
    [cyl(1.1, 4.5, 6.3, 14.2, -12), 0xe9e9e4], [cyl(1.15, 1.0, 6.3, 18.7, -12), 0x1c2a3a],
    [box(9, 0.35, 5.5, 0, 6.2, 39.5), 0x4a4e52], [box(9.4, 1.2, 0.4, 0, 6.6, 37.4), 0x2b3440], [box(18.4, 0.9, 76, 0, 3.6, 0), 0xa8322a]] }),
};
// placements: world x, z, heading az (deg clockwise from north, bow direction), type. Ferry at its berth along the shore south of the pier.
export const DB_BOATS = [
  ['ferry', num('dbfx', 394.7), num('dbfz', 37.5), num('dbfaz', 215)], ['work', 214, -128, 200], ['dory', 229, -134, 150], ['sloop', 244, -102, 160], ['dory', 236, -126, 120],
];
function buildBoats(scene, gh) {
  const boats = [];
  for (const [type, x, z, az] of DB_BOATS) { const T = TYPES[type](); const g = mergeGeometries(T.parts.map(([geo, c]) => colorize(geo, c)));
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })); m.castShadow = m.receiveShadow = true; m.name = 'boat-' + type;
    const r = az * Math.PI / 180, fx = Math.sin(r), fz = -Math.cos(r), sx = -fz, sz = fx;   // bow direction, starboard
    const a = 0.4 * T.L, b = 0.4 * T.B;   // sample points: bow, stern (centreline), port side amidships
    boats.push({ m, T, x, z, r, pts: [[x + fx * a, z + fz * a], [x - fx * a, z - fz * a], [x - sx * b, z - sz * b], [x + sx * b, z + sz * b]] });
    scene.add(m); }
  const gs = boats.map((B) => B.pts.map(([px, pz]) => gh(px, pz)));
  // wifdboat1: dbFieldB's b is one value per bore since wifdscene10 (the old scalar b/140 gave NaN: every boat vanished at 46.0 s). Each bore adds a third
  // of the old shove/yaw (smooth over 140 m behind it); keel heights sample the drawn water field and the ground at the shoved bow/stern/port/starboard.
  const lvl = (t, x, z, wy) => (t > FRONT_T0 ? dbFieldLevel(t, x, z) + MEAN_Y : wy), ease = (v) => { const u = Math.min(1, Math.max(0, v)); return u * u * (3 - 2 * u); };
  return { boats, update(waterY, t = 0) { boats.forEach((B, i) => { const T = B.T, big = T.L > 40;
    const dr = t > FRONT_T0 ? dbFieldB(t, B.x, B.z).b.reduce((a, b) => a + ease(b / 140), 0) / 3 : 0;
    const push = dr * (big ? 14 : 34), yaw = (i % 2 ? -1 : 1) * (big ? 0.22 : 0.6) * dr, ox = -RD[0] * push, oz = -RD[1] * push, bx = B.x + ox, bz = B.z + oz;
    const kp = B.pts.map(([px, pz], k) => { const x = px + ox, z = pz + oz; return [lvl(t, x, z, waterY) - T.draft, push > 0.01 ? gh(x, z) : gs[i][k]]; });
    // keel height at each sample = max(float line, ground); bow/stern give pitch, port/starboard roll; slack when floating
    const [yb, ys, yp, yq] = kp.map(([fl, gg]) => Math.max(fl, gg)), a = 0.8 * T.L, b = 0.8 * T.B, cl = (v, m) => Math.max(-m, Math.min(m, v));
    const pitch = cl(Math.atan2(yb - ys, a), 0.3), gr = Math.min(1, Math.max(0, Math.max(kp[0][1] - kp[0][0], kp[1][1] - kp[1][0]) / 1.0)), roll = cl(Math.atan2(yp - yq, b) * 0.6 + gr * (i % 2 ? -1 : 1) * (T.L > 40 ? 0.025 : 0.09), 0.25), y = Math.max((yb + ys) / 2, (yp + yq) / 2 - 0.0);
    B.m.position.set(bx, y, bz); B.m.rotation.set(0, 0, 0); B.m.rotation.order = 'YXZ'; B.m.rotation.y = -B.r + Math.PI - yaw; B.m.rotation.x = -pitch; B.m.rotation.z = roll; }); } };
}

// ---- wifdscene2: bed shading on the terrain (Lambert) materials: vertices with aBed = 1 skip the ground texture; sand waves; the bed stays
// damp; a glossy wet band between the water line and where it was DB_WET_S seconds ago (dries over a few seconds); a faint sky sheen.
export const DB_WET_S = num('dbwet', 4);
export const PT_U = { uDeckWet: { value: 0 } };
// wifdscene11: worn concrete pier top in the shader: ~0.12 linear (0.3 in sun), three noise scales, faint 4.5 m slab joints, stains; wet = darker + glossier
function pierTopMat(o) { const m = new THREE.MeshStandardMaterial({ ...o, color: 0xffffff });
  m.onBeforeCompile = (sh) => { sh.uniforms.uDeckWet = PT_U.uDeckWet;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vPW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvPW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vPW; uniform float uDeckWet;
      float ph(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float pn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(ph(i), ph(i+vec2(1,0)), f.x), mix(ph(i+vec2(0,1)), ph(i+vec2(1,1)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      vec2 pq = vPW.xz; float tone = 0.09 * (0.84 + 0.16 * pn(pq * 0.35) + 0.10 * pn(pq * 1.7) + 0.06 * pn(pq * 7.0));
      vec2 sj = abs(fract((pq - vec2(200.0, -195.0)) / 4.5) - 0.5) * 4.5; float jn = 1.0 - 0.12 * (1.0 - smoothstep(0.012, 0.035, min(sj.x, sj.y)));
      float stn = smoothstep(0.62, 0.82, pn(pq * 0.22 + 3.0)) * 0.16;
      float wetK = uDeckWet * (0.82 + 0.18 * pn(pq * 0.6 + 5.0));
      diffuseColor.rgb = vec3(1.02, 1.0, 0.95) * tone * jn * (1.0 - stn) * mix(1.0, 0.50, wetK);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.30, wetK * smoothstep(0.25, 0.65, pn(vPW.xz * 0.4 + 9.0)));'); };
  return m; }
// wifdscene11: a soft spray sheet riding just behind each bore crest (vertical ribbon along the front, shaped/animated in the shader), taller where the face is
// wifdscene12: the flood sheet running back off the corner (64.6-66 s): a curtain of water and foam falling over the coping of the east face
// (x 235, z -177..-151) and the north face (z -151, x 214..235), arcing out 0.3 + 1.6 v^2 m, down to the water level
function buildPour() {
  const NS = 240, pos = [], idx = [], L1 = 26, L2 = 21;
  for (let i = 0; i <= NS; i++) for (let j = 0; j <= 16; j++) pos.push(i / NS, j / 16, 0);
  for (let i = 0; i < NS; i++) for (let j = 0; j < 16; j++) { const a = i * 17 + j; idx.push(a, a + 17, a + 1, a + 1, a + 17, a + 18); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  const U = { uT: { value: 0 }, uA: { value: 0 }, uTop: { value: 3.05 }, uBot: { value: -6 } };
  const mat = new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, premultipliedAlpha: true, side: THREE.DoubleSide, fog: false,
    vertexShader: `uniform float uTop, uBot; varying vec2 vQ; void main(){ float u = position.x * ${L1 + L2}.0, v = position.y, o = 0.3 * v + 1.6 * v * v;
        vec2 xz = u < ${L1}.0 ? vec2(235.0 + 0.1 + o, -177.0 + u) : vec2(235.0 - (u - ${L1}.0), -151.0 + 0.1 + o); vQ = vec2(u, v);
        gl_Position = projectionMatrix * viewMatrix * vec4(xz.x, mix(uTop + 0.05, uBot, v), xz.y, 1.0); }`,
    fragmentShader: `uniform float uT, uA; varying vec2 vQ;
      float hs(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(hs(i), hs(i+vec2(1,0)), f.x), mix(hs(i+vec2(0,1)), hs(i+vec2(1,1)), f.x), f.y); }
      void main(){ float u = vQ.x, v = vQ.y; float st = vn(vec2(u * 1.3, v * 3.0 - uT * 5.0)) * 0.6 + vn(vec2(u * 4.0, v * 8.0 - uT * 9.0)) * 0.4;
        float gap = smoothstep(0.30, 0.55, vn(vec2(u * 0.18, uT * 0.4)));   /* broken along the edge */
        float a = uA * gap * smoothstep(0.25, 0.7, st) * (1.0 - smoothstep(0.55, 1.0, v)) * 0.85; a = clamp(a, 0.0, 0.9);
        vec3 c = mix(vec3(0.42, 0.33, 0.22), vec3(0.86, 0.86, 0.82), smoothstep(0.5, 0.8, st)); gl_FragColor = vec4(c * a, a); }` });
  const mesh = new THREE.Mesh(g, mat); mesh.name = 'deck-pour'; mesh.frustumCulled = false; mesh.renderOrder = 9;
  return { mesh, update(t) { U.uT.value = t; U.uA.value = sm(64.5, 64.9, t) * (1 - sm(65.6, 66.4, t)); U.uBot.value = Math.min(2.05, dbWaterY(t)); mesh.visible = U.uA.value > 0.001; } }; }
function buildSpray() {
  const NS = 1200, n0 = -600, n1 = 1800, pos = [], idx = [];
  for (let b = 0; b < 3; b++) for (let i = 0; i <= NS; i++) for (let j = 0; j <= 1; j++) pos.push(n0 + (n1 - n0) * i / NS, j, b);
  for (let b = 0; b < 3; b++) for (let i = 0; i < NS; i++) { const a = (b * (NS + 1) + i) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  const U = { uB0: { value: new THREE.Vector3() }, uBN: { value: new THREE.Vector3() }, uY: { value: new THREE.Vector3() }, uU: { value: new THREE.Vector3() },
    uO: { value: new THREE.Vector2(DB_CAM.x, DB_CAM.z) }, uD: { value: new THREE.Vector2(RD[0], RD[1]) }, uT: { value: 0 }, uL: { value: 0 }, uOn: { value: 0 } };
  const mat = new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, premultipliedAlpha: true, side: THREE.DoubleSide, fog: false,
    vertexShader: `uniform vec3 uB0, uBN, uY, uU; uniform vec2 uO, uD; uniform float uL, uOn, uT; varying vec2 vQ; varying float vA, vDist, vC;
      float hs(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(hs(i), hs(i+vec2(1,0)), f.x), mix(hs(i+vec2(0,1)), hs(i+vec2(1,1)), f.x), f.y); }
      float dbDep(float n){ return 15.0 + 15.0 * smoothstep(150.0, 450.0, n) * (1.0 - smoothstep(900.0, 1150.0, n)); }
      void main(){ float n = position.x, v = position.y, b = position.z; float r = sqrt(dbDep(n) / 15.0), Wf = 16.0 + 6.0 * (r - 1.0);
        float B0 = b < 0.5 ? uB0.x : (b < 1.5 ? uB0.y : uB0.z), BN = b < 0.5 ? uBN.x : (b < 1.5 ? uBN.y : uBN.z), Y = b < 0.5 ? uY.x : (b < 1.5 ? uY.y : uY.z), up = b < 0.5 ? uU.x : (b < 1.5 ? uU.y : uU.z);
        float ck = max(smoothstep(0.58, 0.80, vn(vec2(n * 0.02 + b * 7.0, uT * 0.05))) * smoothstep(0.9, 1.25, r), 1.0 - smoothstep(25.0, 110.0, abs(n)));   /* wifdscene12: clumps: tallest parts + where the crest meets our wall */
        vC = ck; float sc = B0 - (B0 - BN) * r + 0.85 * Wf, s = sc + (3.0 + 5.0 * ck) * v;   /* leans back over the roller */
        float hh = 0.38 * up * (0.55 + 0.45 * r) * uL * (1.0 + 0.9 * vC), y0 = Y + up * 0.939 + 0.1 * up * r * r * uL;
        vec3 w = vec3(uO + s * uD + n * vec2(-uD.y, uD.x), y0 - 0.6 + v * (hh + 0.6)).xzy;
        vA = uOn * smoothstep(-25.0, 0.0, sc) * smoothstep(-600.0, -450.0, n) * (1.0 - smoothstep(1650.0, 1800.0, n)) * smoothstep(0.2, 0.6, uL); vQ = vec2(n, v);
        vec4 mv = viewMatrix * vec4(w, 1.0); vDist = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uT; varying vec2 vQ; varying float vA, vDist, vC;
      float hs(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(hs(i), hs(i+vec2(1,0)), f.x), mix(hs(i+vec2(0,1)), hs(i+vec2(1,1)), f.x), f.y); }
      void main(){ float n = vQ.x, v = vQ.y;
        float cl = vn(vec2(n * 0.10, v * 1.6 - uT * 0.7)) * 0.55 + vn(vec2(n * 0.42, v * 4.5 - uT * 1.8)) * 0.30 + vn(vec2(n * 1.6, v * 9.0 - uT * 3.0)) * 0.15;
        float vv = clamp(v, 0.0, 1.0), om = 1.0 - vv; float a = smoothstep(0.22, 0.70, cl) * om * sqrt(om) * 1.25 * smoothstep(0.0, 0.18, vv) * clamp(vA, 0.0, 1.0) * 0.7 * (1.0 - smoothstep(600.0, 1600.0, max(vDist, 0.0))); float cb = smoothstep(0.38, 0.72, vn(vec2(n * 0.16, v * 2.2 - uT * 0.9)) * 0.7 + vn(vec2(n * 0.7, v * 6.0 - uT * 2.2)) * 0.3) * vC * pow(om, 1.3) * smoothstep(0.0, 0.12, vv) * clamp(vA, 0.0, 1.0) * (1.0 - smoothstep(600.0, 1600.0, max(vDist, 0.0)));
        a = clamp(a + 0.85 * cb, 0.0, 0.92);   /* no pow of a negative (NaN through bloom blacked d11a) */
        gl_FragColor = vec4(vec3(0.84, 0.85, 0.82) * a, a); }` });
  const mesh = new THREE.Mesh(g, mat); mesh.name = 'bore-spray'; mesh.frustumCulled = false; mesh.renderOrder = 10;
  return { mesh, update(t) { const F = dbFront(t), up = BORE_UP(F.top, F.gr); U.uB0.value.set(...F.s0); U.uBN.value.set(...F.sn); U.uU.value.set(...up);
    U.uY.value.set(MEAN_Y - 30, MEAN_Y - 30 + up[0], MEAN_Y - 30 + up[0] + up[1]); U.uL.value = F.lipg; U.uOn.value = F.on; U.uT.value = t; } }; }
export const DB_U = { uWaterY: { value: 0 }, uWetTop: { value: 0 }, uSky: { value: new THREE.Color(0.62, 0.66, 0.72) } };
// wifdscene4: the dark-bed cause. main.js runs upgradeMaterials() (Lambert -> new MeshStandardMaterial) and applyWetness() AFTER buildDrawback(),
// so this patch, set on the old Lambert materials, never compiled (scene2/3 bed shading was dead code). main.js now calls DB.patchBed() after
// applyWetness and the bed patch chains onto the wetness hook. ?dbdbg=1 outputs the terrain albedo unlit (debug).
const DB_DBG = num('dbdbg', 0);
function patchBed(scene) {
  let n = 0; const seen = new Set();
  scene.traverse((o) => { if (!o.isMesh || !/^terrain-/.test(o.name) || !o.geometry.attributes.aBed) return; const m = o.material; if (seen.has(m)) return; seen.add(m); n++;
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, rr) => { if (prev) prev.call(m, sh, rr); Object.assign(sh.uniforms, DB_U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aBed; varying float vBed; varying vec3 vBW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBed = aBed; vBW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vBed; varying vec3 vBW; uniform float uWaterY; uniform vec3 uSky;' + (prev ? '' : ' uniform float uWetTop;'))
        .replace('#include <map_fragment>', `#ifdef USE_MAP
        vec4 sampledDiffuseColor = texture2D( map, vMapUv ); diffuseColor *= mix(sampledDiffuseColor, vec4(1.0), vBed);
        #endif
        float bedK = vBed;
        vec2 bp = vBW.xz; float sw = sin(dot(bp, vec2(0.52, 0.30)) + 1.6 * sin(dot(bp, vec2(-0.021, 0.037)))) ;
        float sw2 = sin(dot(bp, vec2(2.3, 1.1)) + 2.0 * sin(bp.x * 0.11));
        float sandK = bedK * smoothstep(-24.0, -3.0, vBW.y);
        diffuseColor.rgb *= 1.0 + sandK * (0.10 * sw + 0.04 * sw2);
        float above = vBW.y - uWaterY;
        float band = max(uWetTop - uWaterY, 0.4);
        float wetB = bedK * (1.0 - smoothstep(0.0, band, above)) * step(-0.05, above);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.333))) * vec3(1.0, 0.97, 0.92), 0.4 * bedK) * mix(1.0, 0.78, bedK);   // wifdscene4: damp grey-brown
        diffuseColor.rgb *= mix(1.0, 0.70, wetB);`)
        .replace('#include <opaque_fragment>', `vec3 vdir = normalize(cameraPosition - vBW); float fres = pow(1.0 - clamp(vdir.y, 0.0, 1.0), 5.0);
        float shine = bedK * (0.10 + 0.55 * wetB) * fres * (0.8 + 0.2 * sw2);
        outgoingLight = mix(outgoingLight, uSky * 0.9, clamp(shine, 0.0, 0.7));
        ${DB_DBG ? 'outgoingLight = diffuseColor.rgb;' : ''}
        #include <opaque_fragment>`); };
    m.needsUpdate = true; });
  return n; }

export function buildDrawback(scene, world) {
  const gh = world.groundHeightAt, walls = buildWalls(gh); scene.add(walls); scene.add(buildCornerWalls(gh)); const spray = buildSpray(); scene.add(spray.mesh); const pour = buildPour(); scene.add(pour.mesh);
  const boats = buildBoats(scene, gh);
  return { walls, boats, patchBed: () => patchBed(scene), info: { wallEdges: walls.userData.edges, boats: boats.boats.length, camGround: +gh(DB_CAM.x, DB_CAM.z).toFixed(2) },
    update(t) { spray.update(t); pour.update(t); PT_U.uDeckWet.value = sm(62.9, 63.3, t) * (1 - 0.55 * sm(66, 74, t)); const w = dbWaterY(t); boats.update(w, t); DB_U.uWaterY.value = w; DB_U.uWetTop.value = Math.max(w, dbWaterY(Math.max(0, t - DB_WET_S)), t > 61 ? 4 + MEAN_Y + 0.3 : -1e4); } };
}
