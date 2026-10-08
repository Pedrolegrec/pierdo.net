// Quebec mode (?world=quebec): loads the copied world data, carves the river bed, builds the world and the hand-made landmarks.
// Datum: world y = 0 is the survey-day river surface (0.90 m CGVD2013); mean river is 0.25 m, so level L (m above mean river) -> water y = L - 0.65.
import * as THREE from 'three';
import { loadQuebecWorldData, buildQuebecWorld } from '../world/world-quebec.js';
import { buildLandmarks } from '../world/landmarks-quebec.js';
import LMDATA from '../world/landmarks-data.js';

export const MEAN_RIVER_Y = -0.65;
export const waterY = (level) => level + MEAN_RIVER_Y;

// Class 2 = water bed. The survey-day river surface is flat at y about 0, above a water plane at level 0 (y -0.65), so the plane would be
// invisible. Lower the bed: chamfer distance (m) from the nearest non-water vertex, bed = -0.65 - (0.3 + BED_SLOPE * min(d, BED_CAP)).
// Vertices above 1.5 m are ponds/creek mouths on land and are left alone. Mutates the terrain ArrayBuffer in place (the data/ copy is untouched).
export function carveRiver(data, { slope = 0.2, cap = 30 } = {}) {
  const hdr = data.world.terrain; let carved = 0;
  for (const l of hdr.levels) {
    const n = l.nx * l.nz, q = new Uint16Array(data.terrain, l.hOff, n), c = new Uint8Array(data.terrain, l.cOff, n);
    const isW = new Uint8Array(n); for (let i = 0; i < n; i++) isW[i] = (c[i] === 2 && q[i] * hdr.hScale - hdr.hOffset <= 1.5) ? 1 : 0;
    const d = new Float32Array(n), BIG = 1e9; for (let i = 0; i < n; i++) d[i] = isW[i] ? BIG : 0;
    const a = 1, b = Math.SQRT2, nx = l.nx, nz = l.nz;
    const relax = (i, j, di, dj, w) => { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) return; const v = d[jj * nx + ii] + w; if (v < d[j * nx + i]) d[j * nx + i] = v; };
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) if (isW[j * nx + i]) { relax(i, j, -1, 0, a); relax(i, j, 0, -1, a); relax(i, j, -1, -1, b); relax(i, j, 1, -1, b); }
    for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) if (isW[j * nx + i]) { relax(i, j, 1, 0, a); relax(i, j, 0, 1, a); relax(i, j, 1, 1, b); relax(i, j, -1, 1, b); }
    for (let i = 0; i < n; i++) if (isW[i]) {
      const dm = d[i] >= BIG ? cap : Math.min(d[i] * l.cell, cap), y = MEAN_RIVER_Y - (0.3 + slope * dm);
      q[i] = Math.max(0, Math.min(65535, Math.round((y + hdr.hOffset) / hdr.hScale))); carved++;
    }
  }
  return carved;
}

// opts: { carve (default true), quality ('low' = fewer railing pickets) }. Returns { world, landmarks, carved, masked }.
export async function loadQuebec(scene, opts = {}) {
  const data = await loadQuebecWorldData('./world/data/');
  const carved = opts.carve === false ? 0 : carveRiver(data);
  const world = buildQuebecWorld(scene, THREE, { data });
  const quays = opts.quays === false ? null : greyQuays(world);
  const landmarks = buildLandmarks(scene, THREE, { landmarks: world.landmarks, groundHeightAt: world.groundHeightAt, quality: opts.quality || 'high' });
  const bmesh = world.group.children.find((o) => o.name === 'buildings');
  const masked = bmesh ? landmarks.maskWorldBuildings(bmesh) : 0;
  // trees under the hand-made footprints (Place Royale, Chateau) would poke through: drop their instances by scaling to zero
  const tm = world.group.children.find((o) => o.name === 'trees'); let treesHidden = 0;
  if (tm) { const M = new THREE.Matrix4(), P = new THREE.Vector3(), Z = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < tm.count; i++) { tm.getMatrixAt(i, M); P.setFromMatrixPosition(M); if (landmarks.isHidden(P.x, P.z)) { tm.setMatrixAt(i, Z); treesHidden++; } } tm.instanceMatrix.needsUpdate = true; }
  // Terrain skirts are written with both windings, so their vertex normals cancel to (0,0,0) and the shader's normalize() gives NaN. NaN is
  // black in LDR but spreads through the HDR bloom/reflection chain (whole frame black). Replace near-zero normals by straight up.
  let badNormals = 0;
  world.group.children.forEach((o) => { if (!o.isMesh || !o.geometry.attributes.normal) return; const nr = o.geometry.attributes.normal;
    for (let i = 0; i < nr.count; i++) { const x = nr.getX(i), y = nr.getY(i), z = nr.getZ(i); if (!(Math.hypot(x, y, z) > 0.2)) { nr.setXYZ(i, 0, 1, 0); badNormals++; } } nr.needsUpdate = true; });
  world.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  // wifscene4: move the hand-made railing, deck, deck wall and lamps out to the real DTM cliff edge (per rail station, see shiftTerrace).
  const shift = opts.terraceShift === false ? null : shiftTerrace(root(landmarks), world.groundHeightAt, opts.cam || {});
  // wifscene3: the OSM benches of the outer row stood 2-5 m OUTSIDE the hand-made railing. wifscene4: with the railing moved out they are on
  // the deck; only benches still more than 0.3 m outside the MOVED railing are hidden (zero scale). Data untouched.
  let benchesHidden = 0; const rl = RAIL;
  root(landmarks).traverse((o) => { if (!o.isInstancedMesh || o.name !== 'benches') return; const M = new THREE.Matrix4(), P = new THREE.Vector3(), Z = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, M); P.setFromMatrixPosition(M); let k = 0; for (let j = 1; j < rl.length; j++) if (Math.abs(rl[j][1] - P.z) < Math.abs(rl[k][1] - P.z)) k = j;
      const a = rl[Math.max(0, k - 1)], b = rl[Math.min(rl.length - 1, k + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]), out = ((P.x - rl[k][0]) * (b[1] - a[1]) - (P.z - rl[k][1]) * (b[0] - a[0])) / l;
      if (out > 0.3) { o.setMatrixAt(i, Z); benchesHidden++; } } o.instanceMatrix.needsUpdate = true; });
  // wifscene4: cliff-slope trees within 40 m outward of the moved railing whose crowns rise above the deck block the view down onto the
  // Lower Town (the refs show the crowns below the railing). Hide them (zero scale); trees further out or lower stay.
  let cliffTreesHidden = 0;
  if (tm && shift) { const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), Z = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < tm.count; i++) { tm.getMatrixAt(i, M); M.decompose(P, Q, S); if (S.y === 0) continue; let k = 0; for (let j = 1; j < RAIL.length; j++) if (Math.abs(RAIL[j][1] - P.z) < Math.abs(RAIL[k][1] - P.z)) k = j;
      const a = RAIL[Math.max(0, k - 1)], b = RAIL[Math.min(RAIL.length - 1, k + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]), out = ((P.x - RAIL[k][0]) * (b[1] - a[1]) - (P.z - RAIL[k][1]) * (b[0] - a[0])) / l;
      if (out > -1 && out < 40 && P.y + S.y > RAIL[k][2] - 3) { tm.setMatrixAt(i, Z); cliffTreesHidden++; } } tm.instanceMatrix.needsUpdate = true; }
  terraceCameras(world, opts.cam || {});
  return { world, landmarks, carved, masked, treesHidden, badNormals, benchesHidden, terraceShift: shift, quays, cliffTreesHidden };
}

// wifscene3: the world's terrace preset stands at x 5.4, which is 5.4 m OUTSIDE the hand-made railing (the DTM cliff edge lies 4-6 m
// outward of landmarks-data's rail), so the railing and deck were behind the camera. Stand on the deck instead: at rail station z = cz,
// `back` m inward of the rail (along its inward normal), eye 1.6 m above the deck (deck = rail y + 0.07, as landmarks-quebec builds it).
// Defaults chosen from SwiftShader tests against quebec-refs/ (Quebec_pan, Kiosks): see log.md # wifscene3. URL overrides for tuning:
// qz, qback, qaz, qpitch, qfov (terrace) and the same with W suffix for terraceWide.
export const TERRACE_CAM = { z: -150, back: 0.95, az: 78, pitch: 9, fov: 44 };   // wifscene5: pitch 7->9, back 1.0->0.95 (Mac tests out/scene5/mac/p1-p3: top rail a ~3 % band, sky ~30 %). wifscene4: Lower Town roofs below, river middle, Levis across the top third (laptop check out/scene4/laptop/k.png); Mac renders in out/scene4 used z -30 az 52 pitch 6 fov 40
export const TERRACE_WIDE_CAM = { z: -150, back: 0.6, az: 76, pitch: 7, fov: 58 };   // wifscene5: rail out of frame (Mac out/scene5/final/terraceWide-l0-p7b06.png)
// wifscene6: when the river is over the deck (Day 56: 0.36 m), the terrace camera steps back and tilts down so the railing, posts and lamp
// bases stand out of the water in the lower frame, river and Levis above. URL: qbackF, qpitchF, qfovF (flood pose only); level from ?level.
export const TERRACE_CAM_FLOOD = { z: -128, back: 8, az: 160, pitch: 5, fov: 52 };   // wifscene14: back 4 -> 8 (same az; out/scene14/mac/prev-sheet.png): the lamp moves left of the kiosk, roof whole; back 2 z -134 put a bench in front and cut the kiosk.   // wifscene12: tried z -126 az 156 fov 55 (out/scene12/mac/w12a-sheet.png, 540/585): lamp at the kiosk's right edge but the roof still cut at frame right; kept the old pose.   // wifscene9: z -128 az 160 (out/scene9/mac/s8-s9b): closer lamp and kiosk, a little more river toward Levis; was z -135 az 166.   // wifscene8: look along the rail: a whole multi-globe lamp standard (z -118) and the kiosk (z -102) with the Levis shore at left (out/scene8/mac/c.png); was { z: -143, back: 5, az: 78, pitch: 12, fov: 50 }.   // Mac sweeps out/scene6/mac/scene4-s6b..s6d   // wifscene11: tried z -126 az 156 (out/scene10/mac/w11a-sheet.png): lamp off the kiosk line but the kiosk roof is cut at frame right; kept z -128 az 160
const root = (lm) => lm.root || lm.terrace;
function terraceCameras(world, o) {
  const rail = RAIL, rad = Math.PI / 180;
  const num = (k, d) => (o[k] !== undefined && o[k] !== null && o[k] !== '' ? Number(o[k]) : d);
  const lvl = o.level !== undefined && o.level !== null && o.level !== '' ? Number(o.level) : null;
  const stand = (c) => {
    let i = 0; for (let k = 1; k < rail.length; k++) if (Math.abs(rail[k][1] - c.z) < Math.abs(rail[i][1] - c.z)) i = k;
    const a = rail[Math.max(0, i - 1)], b = rail[Math.min(rail.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const inn = [-(b[1] - a[1]) / l, (b[0] - a[0]) / l], p = rail[i];
    const deck = DECK_Y ? DECK_Y(p[0] + inn[0] * c.back, p[1] + inn[1] * c.back) : Math.max(p[2], world.groundHeightAt(p[0] + inn[0] * c.back, p[1] + inn[1] * c.back)) + 0.07;   // wifscene4: the real deck surface (smoothed, can be 0.3 m above the rail foot)
    const F = TERRACE_CAM_FLOOD;
    if (c.flood && lvl !== null && waterY(lvl) > deck - 0.3) return stand({ z: num('qzF', F.z), back: num('qbackF', F.back), az: num('qazF', F.az), pitch: num('qpitchF', F.pitch), fov: num('qfovF', F.fov), flooded: true });
    const pos = [p[0] + inn[0] * c.back, deck + 1.6, p[1] + inn[1] * c.back];
    const f = [Math.sin(c.az * rad) * Math.cos(c.pitch * rad), -Math.sin(c.pitch * rad), -Math.cos(c.az * rad) * Math.cos(c.pitch * rad)];
    return { position: pos, target: [pos[0] + f[0] * 1000, pos[1] + f[1] * 1000, pos[2] + f[2] * 1000], fov: c.fov, az: c.az, pitch: c.pitch, deck, fwd: f,
      note: `wifscene4: on the deck ${c.back} m behind the railing at rail z ${c.z}, eye 1.6 m${c.flooded ? ' (wifscene6 flood pose)' : ''}` };
  };
  const T = TERRACE_CAM, TW = TERRACE_WIDE_CAM;
  world.cameraPresets.terrace = stand({ z: num('qz', T.z), back: num('qback', T.back), az: num('qaz', T.az), pitch: num('qpitch', T.pitch), fov: num('qfov', T.fov), flood: true });
  // wifscene7: the flood pose is always available (Quebec timeline cuts to it when the water reaches the deck), plus the terrace pose's deck
  const FF = TERRACE_CAM_FLOOD; world.cameraPresets.terraceFlood = stand({ z: num('qzF', FF.z), back: num('qbackF', FF.back), az: num('qazF', FF.az), pitch: num('qpitchF', FF.pitch), fov: num('qfovF', FF.fov), flooded: true });
  world.cameraPresets.terraceDry = stand({ z: num('qz', T.z), back: num('qback', T.back), az: num('qaz', T.az), pitch: num('qpitch', T.pitch), fov: num('qfov', T.fov) });
  world.cameraPresets.terraceWide = stand({ z: num('qzW', TW.z), back: num('qbackW', TW.back), az: num('qazW', TW.az), pitch: num('qpitchW', TW.pitch), fov: num('qfovW', TW.fov) });
}

// wifscene4: landmarks-data's railing runs 3-6 m inland of the real cliff edge (log.md # wifscene3), so the DTM ledge hid the Lower Town.
// Per rail station: walk outward along the rail normal until the DTM is 1 m below the rail foot (the lip), shift = lip - 0.5 m (the rail
// stands just inside the lip), smoothed by a 9-station median, clamped 0..7 m. Railing, deck wall and lamps move by the full shift; the deck's
// inner edge stays put, so the deck widens to reach the new railing (vertices inside -3 m blend to no shift at the inner edge, -8.5 m).
// Kiosks and benches keep their OSM positions (real, already on the real deck). RAIL (shifted) is used by the cameras and the bench hide.
// URL: tshift=N forces one constant shift (m) for A/B; tshift=0 is the old geometry.
let RAIL = LMDATA.terrace.rail, DECK_Y = null;
function shiftTerrace(terrace, gh, o) {
  const r0 = LMDATA.terrace.rail, N = r0.length, W = LMDATA.terrace.width, out = [], raw = [];
  for (let i = 0; i < N; i++) { const a = r0[Math.max(0, i - 1)], b = r0[Math.min(N - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]); out.push([(b[1] - a[1]) / l, -(b[0] - a[0]) / l]); }
  for (let i = 0; i < N; i++) { const p = r0[i]; let lip = 0; for (let s = 0; s <= 12; s += 0.25) { if (gh(p[0] + out[i][0] * s, p[1] + out[i][1] * s) < p[2] - 1) { lip = s; break; } } raw.push(lip > 0 ? lip - 0.5 : 0); }
  const forced = o.tshift !== undefined && o.tshift !== null && o.tshift !== '' ? Number(o.tshift) : null;
  const d = raw.map((_, i) => { if (forced !== null) return forced; const w = []; for (let k = -4; k <= 4; k++) w.push(raw[Math.min(N - 1, Math.max(0, i + k))]); w.sort((x, y) => x - y); return Math.min(7, Math.max(0, w[4])); });
  RAIL = r0.map((p, i) => [p[0] + out[i][0] * d[i], p[1] + out[i][1] * d[i], p[2]]);
  // nearest station by z, signed outward distance from the ORIGINAL rail
  const near = (x, z) => { let k = 0; for (let j = 1; j < N; j++) if (Math.abs(r0[j][1] - z) < Math.abs(r0[k][1] - z)) k = j; return k; };
  const move = (x, z) => { const k = near(x, z), sd = (x - r0[k][0]) * out[k][0] + (z - r0[k][1]) * out[k][1], f = sd > -3 ? 1 : Math.max(0, (sd + W) / (W - 3)); return [x + out[k][0] * d[k] * f, z + out[k][1] * d[k] * f]; };
  const skip = /^(kiosk|benches)/; const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(); let moved = 0;
  terrace.traverse((m) => { if (!m.isMesh || skip.test(m.name)) return;
    if (m.isInstancedMesh) { for (let i = 0; i < m.count; i++) { m.getMatrixAt(i, M); M.decompose(P, Q, S); const [x, z] = move(P.x, P.z); P.x = x; P.z = z; M.compose(P, Q, S); m.setMatrixAt(i, M); moved++; } m.instanceMatrix.needsUpdate = true; }
    else { const pa = m.geometry.attributes.position; for (let i = 0; i < pa.count; i++) { const [x, z] = move(pa.getX(i), pa.getZ(i)); pa.setXYZ(i, x, pa.getY(i), z); moved++; } pa.needsUpdate = true; m.geometry.computeBoundingSphere(); m.geometry.computeBoundingBox(); }
    m.frustumCulled = false; });
  const dm = terrace.children.find((m) => m.name === 'deck');
  if (dm) { const pa = dm.geometry.attributes.position; DECK_Y = (x, z) => { let best = 1e9, y = 0; for (let i = 0; i < pa.count; i++) { const e = Math.hypot(pa.getX(i) - x, pa.getZ(i) - z); if (e < best) { best = e; y = pa.getY(i); } } return y; }; }
  const q = [...d].sort((x, y) => x - y);
  const stats = { moved, min: q[0], median: q[N >> 1], max: q[N - 1], at: Object.fromEntries([-150, -100, -60, -30, 0, 40, 100, 150, 200].map((z) => [z, +d[near(0, z)].toFixed(2)])) };
  if (typeof window !== 'undefined') window.__terraceShift = stats; return stats;
}

// wifscene4: the port quays and parking areas below the cliff (Bassin Louise / Pointe-a-Carcy fan, the ferry and Place Royale shore) are grass
// green in the baked ground texture and in the coarse class colours. Recolour, only on the Quebec side below the cliff (QUAY_BOX, world m)
// and below 15 m height: light-grass texels -> concrete/asphalt grey (texel noise kept), class-0 (grass) vertices of the coarse levels too.
// Trees (dark green texels) and everything outside the box stay. Data files untouched; the texture is redrawn into a canvas at load.
export const QUAY_BOX = { x0: 60, x1: 900, z0: -950, z1: 320, ymax: 15 };
function greyQuays(world) {
  const B = QUAY_BOX, gh = world.groundHeightAt, st = { texels: 0, verts: 0 }; let tex = null;
  world.group.children.forEach((m) => { if (!m.isMesh || !/^terrain/.test(m.name)) return;
    if (m.material.map) { tex = m.material.map; return; }
    const pa = m.geometry.attributes.position, ca = m.geometry.attributes.color; if (!ca) return;
    for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), z = pa.getZ(i), y = pa.getY(i); if (x < B.x0 || x > B.x1 || z < B.z0 || z > B.z1 || y < 0.3 || y > B.ymax) continue;
      const r = ca.getX(i), g = ca.getY(i), b = ca.getZ(i); if (g > r * 1.25 && g > b * 1.4) { const f = g / 0.19; ca.setXYZ(i, 0.21 * f, 0.20 * f, 0.19 * f); st.verts++; } }
    ca.needsUpdate = true; });
  if (tex && tex.image && typeof document !== 'undefined') {
    const im = tex.image, W = im.width, H = im.height, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0);
    const gx = (W - 1) / (2700 + 1500), gz = (H - 1) / (2100 + 1500);   // ground.json extent -1500..2700 x, -1500..2100 z (1 m per texel)
    const px0 = Math.floor((B.x0 + 1500) * gx), px1 = Math.ceil((B.x1 + 1500) * gx), pz0 = Math.floor((B.z0 + 1500) * gz), pz1 = Math.ceil((B.z1 + 1500) * gz);
    const d = cx.getImageData(px0, pz0, px1 - px0, pz1 - pz0), a = d.data, w = px1 - px0;
    for (let k = 0; k < a.length; k += 4) { const r = a[k], g = a[k + 1], b = a[k + 2]; if (!(g > r * 1.2 && g > b * 1.5 && g > 90)) continue;   // light grass only (trees are darker)
      const i = (k >> 2) % w, j = (k >> 2) / w | 0, x = (px0 + i) / gx - 1500, z = (pz0 + j) / gz - 1500, y = gh(x, z); if (!(y > 0.3 && y < B.ymax)) continue;
      const n = g / 120; a[k] = Math.min(255, 128 * n); a[k + 1] = Math.min(255, 125 * n); a[k + 2] = Math.min(255, 120 * n); st.texels++; }
    cx.putImageData(d, px0, pz0); tex.image = cv; tex.needsUpdate = true; }
  return st;
}
