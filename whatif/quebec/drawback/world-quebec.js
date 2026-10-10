// Old Quebec + Levis shore world (real HRDEM LiDAR + OSM footprints). Local frame: origin = Dufferin Terrace railing,
// x east, z south, y up, metres, y = 0 is the survey-day river surface (see ../SOURCES.md).
// buildQuebecWorld(scene, THREE, opts): opts.data = result of loadQuebecWorldData(baseUrl) (sync build); returns the world object.
export async function loadQuebecWorldData(base = '../data/', bedBase = null) {   // wifdscene1: terrain.bin + world.json from bedBase when given (wifbed1's bed), the rest from base
  const tb = bedBase || base;
  const [terrain, world, buildings, trees, ground, groundImage] = await Promise.all([
    fetch(tb + 'terrain.bin').then(r => r.arrayBuffer()), fetch(tb + 'world.json').then(r => r.json()),
    fetch(base + 'buildings.json').then(r => r.json()), fetch(base + 'trees.bin').then(r => r.arrayBuffer()),
    fetch(base + 'ground.json').then(r => r.json()), new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = base + 'ground.jpg'; })]);
  return { terrain, world, buildings, trees, ground, groundImage };
}
const lin = (c) => c.map(v => Math.pow(v, 2.2));
const COL = [[.33, .47, .20], [.42, .38, .33], [.18, .27, .30], [.40, .38, .36], [.15, .27, .12], [.50, .48, .45]].map(lin); // grass rock waterbed roof tree urban (sRGB, as in data/ground.jpg)
const hash = (i) => { let h = (i * 374761393 + 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
// wifdscene2: river bed colours (classes 20 shallow, 21 deep): wet grey-brown silt/sand when shallow, darker mud deeper, dark rock on steep slopes; linear RGB
const BED_SAND = lin([.56, .50, .41]), BED_SILT = lin([.47, .43, .36]), BED_MUD = lin([.37, .35, .30]), BED_ROCK = lin([.36, .35, .33]);
function bedColor(l, i, j, li) { const H = (a, b) => l.q[Math.min(l.nz - 1, Math.max(0, b)) * l.nx + Math.min(l.nx - 1, Math.max(0, a))];
  const h = H(i, j) * 0.01 - BED_HOFF, gx = (H(i + 1, j) - H(i - 1, j)) * 0.01 / (2 * l.cell), gz = (H(i, j + 1) - H(i, j - 1)) * 0.01 / (2 * l.cell), sl = Math.hypot(gx, gz);
  const d = Math.min(1, Math.max(0, (-h - 2) / 18)), r1 = hash(i * 7919 + j * 104729 + li), r2 = hash(i * 31337 + j * 7331 + li * 17);
  const base = d < 0.4 ? BED_SAND.map((v, k) => v + (BED_SILT[k] - v) * d / 0.4) : BED_SILT.map((v, k) => v + (BED_MUD[k] - v) * Math.min(1, (d - 0.4) / 0.6));
  const rk = Math.min(1, Math.max(0, (sl - 0.18) / 0.25)) * (0.6 + 0.4 * r2), n = 0.82 + 0.36 * r1;
  return base.map((v, k) => (v + (BED_ROCK[k] - v) * rk) * n * (r2 > 0.97 ? 0.6 : 1)); }
let BED_HOFF = 70;
const TERRACE_AZ = 80, TERRACE_PITCH = 20, TERRACE_FOV = 62, RAIL = [5.4, 1.0];   // RAIL = camera x,z on the walk, 0.6 m before the cliff drop (DTM edge at r = 6 m along azimuth 100)   // chosen from test renders, see log.md
export function buildQuebecWorld(scene, THREE, opts = {}) {
  const { terrain, world, buildings, trees, ground, groundImage } = opts.data;
  const hdr = world.terrain, lv = hdr.levels.map(l => ({ ...l, q: new Uint16Array(terrain, l.hOff, l.nx * l.nz), c: new Uint8Array(terrain, l.cOff, l.nx * l.nz) }));
  const hAt = (l, i, j) => l.q[j * l.nx + i] * hdr.hScale - hdr.hOffset; BED_HOFF = hdr.hOffset;
  function groundHeightAt(x, z) {
    for (const l of lv) {
      const fx = (x - l.x0) / l.cell, fz = (z - l.z0) / l.cell;
      if (fx < 0 || fz < 0 || fx > l.nx - 1 || fz > l.nz - 1) continue;
      const i = Math.min(l.nx - 2, Math.floor(fx)), j = Math.min(l.nz - 2, Math.floor(fz)), tx = fx - i, tz = fz - j;
      return hAt(l, i, j) * (1 - tx) * (1 - tz) + hAt(l, i + 1, j) * tx * (1 - tz) + hAt(l, i, j + 1) * (1 - tx) * tz + hAt(l, i + 1, j + 1) * tx * tz;
    }
    return 0;
  }
  const group = new THREE.Group(); group.name = 'quebec-world'; scene.add(group);
  let groundTex = null; if (groundImage) { groundTex = new THREE.Texture(groundImage); groundTex.flipY = false; groundTex.colorSpace = THREE.SRGBColorSpace; groundTex.anisotropy = 8; groundTex.generateMipmaps = true; groundTex.minFilter = THREE.LinearMipmapLinearFilter; groundTex.needsUpdate = true; }
  // terrain: nested levels (finest first); each level omits the cells covered by the finer one, skirts hide the T-junction cracks
  const SK = 8;
  lv.forEach((l, li) => {
    const fine = li > 0 ? lv[li - 1] : null; const nx = l.nx, nz = l.nz;
    const inHole = (ci, cj) => { if (!fine) return false; const x0 = l.x0 + ci * l.cell, z0 = l.z0 + cj * l.cell; return x0 >= fine.x0 && x0 + l.cell <= fine.x0 + (fine.nx - 1) * fine.cell && z0 >= fine.z0 && z0 + l.cell <= fine.z0 + (fine.nz - 1) * fine.cell; };
    const inc = (ci, cj) => ci >= 0 && cj >= 0 && ci < nx - 1 && cj < nz - 1 && !inHole(ci, cj);
    const pos = [], col = [], idx = [], uv = [], bedA = []; const nv = nx * nz; const tex = li < 2 && groundTex;   // two finest levels carry the baked ground texture
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = l.x0 + i * l.cell, z = l.z0 + j * l.cell; pos.push(x, hAt(l, i, j), z); const cls = l.c[j * nx + i], isBed = cls >= 20; bedA.push(isBed ? 1 : 0);
      if (isBed) { const c = bedColor(l, i, j, li); col.push(c[0], c[1], c[2]); uv.push((x - ground.x0) / (ground.x1 - ground.x0), (z - ground.z0) / (ground.z1 - ground.z0)); continue; }
      const c = tex ? [1, 1, 1] : (COL[cls] || COL[0]), n = tex ? 0.96 + 0.08 * hash(i * 7919 + j * 104729 + li) : 0.88 + 0.24 * hash(i * 7919 + j * 104729 + li);
      col.push(c[0] * n, c[1] * n, c[2] * n); uv.push((x - ground.x0) / (ground.x1 - ground.x0), (z - ground.z0) / (ground.z1 - ground.z0));
    }
    let sv = nv; const skirt = (a, b) => { // a,b vertex ids along an open edge
      for (const v of [a, b]) { bedA.push(bedA[v] || 0); pos.push(pos[v * 3], pos[v * 3 + 1] - SK, pos[v * 3 + 2]); col.push(col[v * 3] * .7, col[v * 3 + 1] * .7, col[v * 3 + 2] * .7); uv.push(uv[v * 2], uv[v * 2 + 1]); }
      idx.push(a, b, sv + 1, a, sv + 1, sv); idx.push(a, sv + 1, b, a, sv, sv + 1); sv += 2; };
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      if (!inc(i, j)) continue; const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1; idx.push(a, c, b, b, c, d);
      if (!inc(i, j - 1)) skirt(a, b); if (!inc(i, j + 1)) skirt(c, d); if (!inc(i - 1, j)) skirt(a, c); if (!inc(i + 1, j)) skirt(b, d);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); if (bedA.some(v => v)) { while (bedA.length < pos.length / 3) bedA.push(1); g.setAttribute('aBed', new THREE.Float32BufferAttribute(bedA, 1)); }
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial(tex ? { vertexColors: true, map: groundTex } : { vertexColors: true })); m.name = 'terrain-' + l.cell + 'm'; group.add(m);
  });
  // buildings: extruded OSM footprints (LiDAR eave height) with a hip/gable roof cap from the footprint's long axis; flat roof for big/low ones.
  // record: [base, eave, flag(bit0 Chateau, bit1 flat), roofHeight, x0, z0, x1, z1, ...]
  const bp = [], bn = [], bc = []; let nb = 0, nPitched = 0;
  const addTri = (A, B, Cc, col, hint) => { let ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = Cc[0] - A[0], vy = Cc[1] - A[1], vz = Cc[2] - A[2];
    let nx_ = uy * vz - uz * vy, ny_ = uz * vx - ux * vz, nz_ = ux * vy - uy * vx; const L = Math.hypot(nx_, ny_, nz_); if (L < 1e-9) return; nx_ /= L; ny_ /= L; nz_ /= L;
    if (nx_ * hint[0] + ny_ * hint[1] + nz_ * hint[2] < 0) { const t = B; B = Cc; Cc = t; nx_ = -nx_; ny_ = -ny_; nz_ = -nz_; }
    for (const P of [A, B, Cc]) { bp.push(P[0], P[1], P[2]); bn.push(nx_, ny_, nz_); bc.push(col[0], col[1], col[2]); } };
  const WALLS = [[.66, .60, .50], [.72, .68, .60], [.58, .57, .55], [.62, .54, .46], [.70, .64, .55]].map(lin), ROOFS = [[.27, .29, .33], [.33, .35, .38], [.46, .27, .22], [.40, .30, .25], [.30, .42, .38]].map(lin), CHW = lin([.64, .58, .48]), CHR = lin([.33, .56, .47]);
  const roofCap = (pts, y, rh, col, hx, hz) => {
    const n = pts.length; let mx = 0, mz = 0; for (const p of pts) { mx += p.x; mz += p.y; } mx /= n; mz /= n; let sxx = 0, sxz = 0, szz = 0;
    for (const p of pts) { const dx = p.x - mx, dz = p.y - mz; sxx += dx * dx; sxz += dx * dz; szz += dz * dz; }
    const th = 0.5 * Math.atan2(2 * sxz, sxx - szz), ux = Math.cos(th), uz = Math.sin(th), vx = -uz, vz = ux; let s0 = 1e9, s1 = -1e9, q0 = 1e9, q1 = -1e9;
    for (const p of pts) { const s_ = (p.x - mx) * ux + (p.y - mz) * uz, q_ = (p.x - mx) * vx + (p.y - mz) * vz; s0 = Math.min(s0, s_); s1 = Math.max(s1, s_); q0 = Math.min(q0, q_); q1 = Math.max(q1, q_); }
    const w = q1 - q0, qm = (q0 + q1) / 2, h2 = Math.max(0, (s1 - s0 - w) / 2), sm = (s0 + s1) / 2, ya = y + rh;
    const A1 = [mx + ux * (sm - h2) + vx * qm, ya, mz + uz * (sm - h2) + vz * qm], A2 = [mx + ux * (sm + h2) + vx * qm, ya, mz + uz * (sm + h2) + vz * qm];
    for (let k = 0; k < n; k++) { const p = pts[k], q = pts[(k + 1) % n]; const P = [p.x, y, p.y], Q = [q.x, y, q.y], sp = (p.x - mx) * ux + (p.y - mz) * uz, sq = (q.x - mx) * ux + (q.y - mz) * uz;
      const hint = [(p.x + q.x) / 2 - mx, 1.5, (p.y + q.y) / 2 - mz];   // outward and up
      if (sp <= sm && sq <= sm) addTri(P, Q, A1, col, hint); else if (sp >= sm && sq >= sm) addTri(P, Q, A2, col, hint); else { addTri(P, Q, A2, col, hint); addTri(P, A2, A1, col, hint); } }
    return [mx, mz]; };
  // wifscene10: the grey placeholder tower read as a box behind the cliff in the climb shot; the hand-built Chateau (landmarks-quebec) stands in. ?qtower=1 restores it
  const KEEP_TOWER = typeof location !== 'undefined' && new URLSearchParams(location.search).get('qtower') === '1';
  buildings.forEach((r, bi_) => {
    const n = (r.length - 4) / 2; if (n < 3) return; const base = r[0], eave = r[1], flag = r[2], rh = r[3]; const pts = []; for (let k = 0; k < n; k++) pts.push(new THREE.Vector2(r[4 + 2 * k], r[5 + 2 * k]));
    if (!KEEP_TOWER && eave - base > 50 && Math.hypot(pts[0].x, pts[0].y) < 700) return;   // wifscene10: the untextured 56 m office tower (~-298, -215) read as a grey placeholder box above the cliff in the climb shot; hidden
    let area = 0; for (let k = 0; k < n; k++) { const p = pts[k], q = pts[(k + 1) % n]; area += p.x * q.y - q.x * p.y; } const sgn = area > 0 ? 1 : -1;
    const hv = Math.floor(hash(bi_) * 5), wall = (flag & 1) ? CHW : WALLS[hv], roof = (flag & 1) ? CHR : ROOFS[Math.floor(hash(bi_ + 9) * 4.999)].map(v => v * (0.9 + 0.2 * hash(bi_ + 3)));
    for (let k = 0; k < n; k++) { const p = pts[k], q = pts[(k + 1) % n]; const hint = [(q.y - p.y) * sgn, 0, -(q.x - p.x) * sgn];
      const a = [p.x, base, p.y], b = [q.x, base, q.y], c = [q.x, eave, q.y], d = [p.x, eave, p.y]; addTri(a, b, c, wall, hint); addTri(a, c, d, wall, hint); }
    if (rh > 0 && n <= 40) { const [mx, mz] = roofCap(pts, eave, rh, roof, 0, 0); nPitched++;
      if ((flag & 1) && KEEP_TOWER) { const t = 8, e2 = eave + 2; // Chateau placeholder tower: a square shaft with a pyramid cap at the footprint centre
        const cc = [[mx - t, mz - t], [mx + t, mz - t], [mx + t, mz + t], [mx - t, mz + t]]; for (let k = 0; k < 4; k++) { const p = cc[k], q = cc[(k + 1) % 4]; const hint = [(p[0] + q[0]) / 2 - mx, 0, (p[1] + q[1]) / 2 - mz];
          addTri([p[0], e2, p[1]], [q[0], e2, q[1]], [q[0], e2 + 22, q[1]], wall, hint); addTri([p[0], e2, p[1]], [q[0], e2 + 22, q[1]], [p[0], e2 + 22, p[1]], wall, hint); addTri([p[0], e2 + 22, p[1]], [q[0], e2 + 22, q[1]], [mx, e2 + 34, mz], roof, [hint[0], 1.2, hint[2]]); } } }
    { const tri = (() => { try { return THREE.ShapeUtils.triangulateShape(pts, []); } catch (e) { return []; } })(); for (const t of tri) addTri([pts[t[0]].x, eave, pts[t[0]].y], [pts[t[1]].x, eave, pts[t[1]].y], [pts[t[2]].x, eave, pts[t[2]].y], roof, [0, 1, 0]); }
    nb++;
  });
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3)); bg.setAttribute('normal', new THREE.Float32BufferAttribute(bn, 3)); bg.setAttribute('color', new THREE.Float32BufferAttribute(bc, 3));
  const bmesh = new THREE.Mesh(bg, new THREE.MeshLambertMaterial({ vertexColors: true })); bmesh.name = 'buildings'; group.add(bmesh);
  const lm = world.landmarks, ry = lm.terraceRailing.y;
  // trees: instanced low-poly blobs. None on the Terrace itself (high flat ground within 120 m of the railing) or within 45 m of the camera: the real Terrace is an open boardwalk and the cliff edge has an open view.
  const t16 = new Int16Array(trees), nt0 = t16.length / 4, keep = []; for (let k = 0; k < nt0; k++) { const x = t16[4 * k] / 2, z = t16[4 * k + 1] / 2, gy = t16[4 * k + 2] / 10, d = Math.hypot(x, z); if ((d < 120 && gy > 48) || d < 45) continue; keep.push(k); }
  const nt = keep.length, tm = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), nt); const M = new THREE.Matrix4(), C = new THREE.Color();
  keep.forEach((k, ii) => { const h = t16[4 * k + 3] / 10, rx = Math.max(1.4, 0.24 * h + 0.7); M.makeScale(rx, h * 0.5, rx); M.setPosition(t16[4 * k] / 2, t16[4 * k + 2] / 10 + h * 0.55, t16[4 * k + 1] / 2); tm.setMatrixAt(ii, M); const v = hash(k); tm.setColorAt(ii, C.setRGB(.10 + .10 * v, .22 + .14 * v, .08 + .06 * v)); });
  tm.name = 'trees'; group.add(tm);
  const L2 = lv[lv.length - 1];
  const bounds = { minX: L2.x0, maxX: L2.x0 + (L2.nx - 1) * L2.cell, minZ: L2.z0, maxZ: L2.z0 + (L2.nz - 1) * L2.cell };
  // camera presets: azimuth in degrees clockwise from north (x east, z south), pitch below the horizon, vertical fov
  const eye = ry + 1.6, rad = Math.PI / 180, fwd = (az, pitch, d = 1000) => [Math.sin(az * rad) * Math.cos(pitch * rad) * d, -Math.sin(pitch * rad) * d, -Math.cos(az * rad) * Math.cos(pitch * rad) * d];
  const cam = (pos, az, pitch, fov, note) => { const f = fwd(az, pitch); return { position: pos, target: [pos[0] + f[0], pos[1] + f[1], pos[2] + f[2]], fov, az, pitch, note }; };
  const cameraPresets = { terrace: cam([RAIL[0], eye, RAIL[1]], TERRACE_AZ, TERRACE_PITCH, TERRACE_FOV, 'portrait 9:16, vertical fov; standing at the Dufferin Terrace railing, eye 1.6 m above the walk, looking over the Lower Town and the river to Levis'),
    terraceWide: cam([RAIL[0], eye, RAIL[1]], TERRACE_AZ, TERRACE_PITCH - 3, 82, 'wide lens, same stand'),
    aerial: { position: [-980, 260, 2216], target: [150, 40, 0], fov: 50, note: 'upstream over the river, looking NE at the cliff and the Terrace' } };
  return { group, groundHeightAt, bounds, cameraPresets, landmarks: lm, stats: { buildings: nb, pitchedRoofs: nPitched, trees: nt, treesRemoved: nt0 - nt, levels: lv.length, groundTexture: !!groundTex }, datumCGVD2013: hdr.datumCGVD2013, camFor: cam };
}
