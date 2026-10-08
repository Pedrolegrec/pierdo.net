// Hand-built Quebec landmarks: Chateau Frontenac, Dufferin Terrace (deck, railing, gazebos, benches, lamps), Place Royale houses.
// Procedural geometry from OSM footprints + HRDEM LiDAR heights (scene/landmarks-data.js, made by tools/build_data.py).
// Same local frame as quebec-world (x east, z south, y up, metres, y=0 river datum). Plain MeshStandardMaterial only (wet-band ready).
import DATA from './landmarks-data.js';
const hash = (i) => { let h = (i * 374761393 + 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
const area = (r) => { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
const outward = (r) => (area(r) > 0 ? r.slice().reverse() : r);          // area<0 => normal (-ez,0,ex) points outward
function obb(r) {
  let best = 0, bi = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > best) { best = l; bi = i; } }
  const run = (ux, uz) => { let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9; for (const p of r) { const pu = p[0] * ux + p[1] * uz, pv = -p[0] * uz + p[1] * ux; u0 = Math.min(u0, pu); u1 = Math.max(u1, pu); v0 = Math.min(v0, pv); v1 = Math.max(v1, pv); } return { ux, uz, u0, u1, v0, v1 }; };
  const a = r[bi], b = r[(bi + 1) % r.length]; let o = run((b[0] - a[0]) / best, (b[1] - a[1]) / best);
  if (o.v1 - o.v0 > o.u1 - o.u0) o = run(-o.uz, o.ux); return o;
}
class MB {   // mesh builder: flat-shaded quads/tris with uv
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.i = []; }
  tri(a, b, c, ua, ub, uc, col) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz); if (l < 1e-9) return; nx /= l; ny /= l; nz /= l;
    const k = this.p.length / 3; for (const [p, u] of [[a, ua], [b, ub], [c, uc]]) { this.p.push(p[0], p[1], p[2]); this.n.push(nx, ny, nz); this.uv.push(u[0], u[1]); if (col) this.c.push(col[0], col[1], col[2]); }
    this.i.push(k, k + 1, k + 2);
  }
  quad(a, b, c, d, ua, ub, uc, ud, col) { this.tri(a, b, c, ua, ub, uc, col); this.tri(a, c, d, ua, uc, ud, col); }
  geom(THREE) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2)); if (this.c.length) g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.setIndex(this.i); return g; }
}
export function buildLandmarks(scene, THREE, { landmarks, groundHeightAt, quality = 'high' } = {}) {
  const HI = quality !== 'low', gh = groundHeightAt || (() => 0);
  const root = new THREE.Group(); root.name = 'landmarks-quebec'; scene.add(root);
  const chateau = new THREE.Group(), terrace = new THREE.Group(), placeRoyale = new THREE.Group(); chateau.name = 'chateau'; terrace.name = 'terrace'; placeRoyale.name = 'placeRoyale'; root.add(chateau, terrace, placeRoyale);
  let tris = { chateau: 0, terrace: 0, placeRoyale: 0 };
  const T = HI ? 128 : 64;
  // ---------- procedural textures (canvas) ----------
  function canvasTex(w, h, draw, rx = 1) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.repeat.set(rx, 1); return t; }
  const noise = (g, w, h, n, a) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${hash(i) < .5 ? '0,0,0' : '255,255,255'},${a * hash(i + 99)})`; g.fillRect(hash(i + 7) * w, hash(i + 13) * h, 2 + hash(i + 3) * 4, 1 + hash(i + 5) * 3); } };
  function windowCell(base, trim, glass, shutter) {   // one floor x one bay, window centred
    return (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h); noise(g, w, h, w * 2, 0.07);
      g.fillStyle = 'rgba(0,0,0,0.10)'; for (let y = 0; y < h; y += h / 14) g.fillRect(0, y, w, 1);                    // brick/stone courses
      const ww = w * .34, wh = h * .56, x = (w - ww) / 2, y = h * .2;
      g.fillStyle = trim; g.fillRect(x - 5, y - 6, ww + 10, wh + 12); g.fillStyle = glass; g.fillRect(x, y, ww, wh);
      const gr = g.createLinearGradient(0, y, 0, y + wh); gr.addColorStop(0, 'rgba(160,190,215,0.55)'); gr.addColorStop(.6, 'rgba(60,80,100,0.1)'); g.fillStyle = gr; g.fillRect(x, y, ww, wh);
      g.fillStyle = trim; g.fillRect(x + ww / 2 - 1.5, y, 3, wh); g.fillRect(x, y + wh * .4, ww, 3); g.fillRect(x - 7, y + wh + 6, ww + 14, 4);
      if (shutter) { g.fillStyle = shutter; g.fillRect(x - 5 - ww * .28, y - 4, ww * .26, wh + 8); g.fillRect(x + ww + 7, y - 4, ww * .26, wh + 8); }
    };
  }
  const roofTex = (base, seam) => canvasTex(64, 64, (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); noise(g, w, h, 160, 0.10); g.fillStyle = seam; g.fillRect(0, 0, 3, h); g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(3, 0, 2, h); });
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const M = {
    brick: std({ map: canvasTex(T, T, windowCell('#a9886a', '#d9d2c2', '#2d3b4a')), roughness: 0.92, metalness: 0 }),
    stone: std({ map: canvasTex(T, T, windowCell('#b5ad9c', '#ece6d6', '#2b3641', '#5c7a63')), roughness: 0.95, metalness: 0 }),
    stone2: std({ map: canvasTex(T, T, windowCell('#9d9486', '#e4ddcc', '#2b3641', '#7a3b2e')), roughness: 0.95, metalness: 0 }),
    copper: std({ map: roofTex('#5f9a86', '#3d6d5d'), roughness: 0.5, metalness: 0.25, side: THREE.DoubleSide }),
    slate: std({ map: roofTex('#4a5560', '#303a44'), roughness: 0.8, metalness: 0.05, side: THREE.DoubleSide }),
    tin: std({ map: roofTex('#8a4b3b', '#5e3226'), roughness: 0.7, metalness: 0.15, side: THREE.DoubleSide }),
    trimStone: std({ color: 0xcfc6b2, roughness: 0.9 }), shaft: std({ color: 0xb09479, roughness: 0.92 }), iron: std({ color: 0x1c3326, roughness: 0.5, metalness: 0.35 }),
    // wifscene6: cast-iron railing reads dark green-black (refs wilfredor-kiosks, jeangagnon-07), not a black metal slab; top rail worn lighter
    railIron: std({ color: 0x1d3a2a, roughness: 0.5, metalness: 0.15 }), railTop: std({ color: 0x3f5f4b, roughness: 0.32, metalness: 0.2 })   /* wifscene8: greener cast iron */,
    white: std({ color: 0xf1eee6, roughness: 0.6 }), kioskGreen: std({ color: 0x3f7a62, roughness: 0.5, metalness: 0.25 }), vc: std({ vertexColors: true, roughness: 0.85 }),
    deck: std({ map: canvasTex(128, 128, (g, w, h) => { for (let i = 0; i < 8; i++) { const l = 96 + 26 * hash(i * 3); g.fillStyle = `rgb(${l + 20},${l - 4},${l - 38})`; g.fillRect(i * w / 8, 0, w / 8, h); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(i * w / 8, 0, 2, h); for (let k = 0; k < 3; k++) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(i * w / 8, hash(i * 9 + k) * h, w / 8, 2); } } noise(g, w, h, 300, .08); }), roughness: 0.85 }),
    wall: std({ color: 0x8c8578, roughness: 1 }), lamp: std({ color: 0xffe2b0, emissive: 0xffd699, emissiveIntensity: 0.35, roughness: 0.4 }),
  };
  const mesh = (geo, mat, group, key, name) => { const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; m.name = name; group.add(m); tris[key] += geo.index.count / 3; return m; };
  const inst = (geo, mat, mats, group, key, name) => { const im = new THREE.InstancedMesh(geo, mat, mats.length), t = new THREE.Matrix4(); mats.forEach((m, i) => im.setMatrixAt(i, m)); im.instanceMatrix.needsUpdate = true; im.castShadow = im.receiveShadow = true; im.name = name; im.frustumCulled = false; group.add(im); tris[key] += (geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3) * mats.length; return im; };
  const mtx = (x, y, z, sx = 1, sy = 1, sz = 1, ry = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(sx, sy, sz));
  // vertex-coloured unit pieces for the small instanced parts
  const box = (b, x0, y0, z0, x1, y1, z1, col) => { const P = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], f = [[4, 5, 6, 7], [1, 0, 3, 2], [5, 1, 2, 6], [0, 4, 7, 3], [7, 6, 2, 3], [0, 1, 5, 4]]; for (const q of f) b.quad(P[q[0]], P[q[1]], P[q[2]], P[q[3]], [0, 0], [1, 0], [1, 1], [0, 1], col); };
  const prism = (b, x0, y0, z0, x1, y1, z1, rise, col) => { const xm = (x0 + x1) / 2, ym = y1 + rise; b.quad([x0, y1, z1], [xm, ym, z1], [xm, ym, z0], [x0, y1, z0], [0, 0], [1, 0], [1, 1], [0, 1], col); b.quad([xm, ym, z1], [x1, y1, z1], [x1, y1, z0], [xm, ym, z0], [0, 0], [1, 0], [1, 1], [0, 1], col); b.tri([x0, y1, z1], [x1, y1, z1], [xm, ym, z1], [0, 0], [1, 0], [.5, 1], col); b.tri([x1, y1, z0], [x0, y1, z0], [xm, ym, z0], [0, 0], [1, 0], [.5, 1], col); };
  // dormer (faces +z), chimney, bench
  const dB = new MB(); box(dB, -.8, 0, -.2, .8, 1.5, 1.2, [.75, .72, .64]); box(dB, -.45, .35, 1.2, .45, 1.25, 1.27, [.12, .17, .22]); prism(dB, -1, 1.5, -.2, 1, 1.5, 1.45, .9, [.37, .6, .52]); const dormerGeo = dB.geom(THREE);
  const cB = new MB(); box(cB, -.45, -1.2, -.45, .45, 2.4, .45, [.55, .32, .27]); box(cB, -.55, 2.4, -.55, .55, 2.6, .55, [.62, .6, .55]); const chimneyGeo = cB.geom(THREE);
  // wifscene8: slatted bench (4 seat slats, 3 back slats with gaps) on green-black cast-iron ends
  const bB = new MB(); const SL = [.24, .36, .25], FR = [.07, .12, .09]; for (let k = 0; k < 4; k++) { const z0 = -.22 + k * .115; box(bB, -.9, .42, z0, .9, .46, z0 + .085, SL); }
  for (let k = 0; k < 3; k++) { const y0 = .52 + k * .15; box(bB, -.9, y0, .2 + k * .025, .9, y0 + .1, .235 + k * .025, SL); }
  for (const sx of [-.85, .78]) { box(bB, sx, 0, -.2, sx + .07, .42, -.14, FR); box(bB, sx, 0, .14, sx + .07, .42, .2, FR); box(bB, sx, .36, -.2, sx + .07, .42, .2, FR); box(bB, sx, .42, .17, sx + .07, .98, .23, FR); box(bB, sx, .58, -.2, sx + .07, .63, .14, FR); }
  const benchGeo = bB.geom(THREE);
  const dormers = { chateau: [], placeRoyale: [] }, chimneys = [];
  // ---------- generic roofed block from a footprint ----------
  function block(group, key, ring0, o) {
    const ring = outward(ring0.map((p) => [p[0], p[1]])), n = ring.length, g0 = Math.min(...ring.map((p) => gh(p[0], p[1]))), gm = o.ground ?? g0;
    const ob = obb(ring), a = (ob.u1 - ob.u0) / 2, b = (ob.v1 - ob.v0) / 2, cu = (ob.u0 + ob.u1) / 2, cv = (ob.v0 + ob.v1) / 2;
    let rise = Math.min(o.maxRise ?? 16, Math.max(2.2, (o.riseF ?? 1.2) * b)), eave = o.top - rise; if (eave < gm + 4) { eave = gm + 4; rise = Math.max(1.5, o.top - eave); }
    const kind = o.roof === 'flat' ? 'flat' : o.roof, rl = kind === 'gabled' ? a : kind === 'pyramidal' ? 0 : Math.max(a - b, 0);
    const toXZ = (pu, pv) => [pu * ob.ux - pv * ob.uz, pu * ob.uz + pv * ob.ux], base = g0 - 2.5;
    const wall = new MB(), roof = new MB(); let acc = 0; const floors = Math.max(1, Math.round((eave - gm) / (o.floorH ?? 3.6))), cellV = (eave - gm) / floors;
    for (let i = 0; i < n; i++) {
      const p = ring[i], q = ring[(i + 1) % n], L = Math.hypot(q[0] - p[0], q[1] - p[1]), cells = Math.max(1, Math.round(L / (o.cellW ?? 3.4))), u0 = acc, u1 = acc + cells; acc = u1;
      wall.quad([p[0], base, p[1]], [q[0], base, q[1]], [q[0], eave, q[1]], [p[0], eave, p[1]], [u0, (base - gm) / cellV], [u1, (base - gm) / cellV], [u1, floors], [u0, floors]);
      if (kind === 'flat') continue;
      const rp = (pt) => { const pu = pt[0] * ob.ux + pt[1] * ob.uz, r = toXZ(Math.min(cu + rl, Math.max(cu - rl, pu)), cv); return [r[0], eave + rise, r[1]]; };
      const rpp = rp(p), rq = rp(q), sl = Math.hypot(L * .2, rise) + 1;
      roof.quad([p[0], eave, p[1]], [q[0], eave, q[1]], rq, rpp, [0, 0], [L / 0.6, 0], [L / 0.6, sl / 3], [0, sl / 3]);
      // dormers on long sides (edges parallel to the main axis)
      if (o.dormer && L > 7 && Math.abs(((q[0] - p[0]) * ob.ux + (q[1] - p[1]) * ob.uz) / L) > 0.92) {
        const nx = -(q[1] - p[1]) / L, nz = (q[0] - p[0]) / L, cnt = Math.floor((L - 3) / (o.dormerStep ?? 5.5)); for (let k = 0; k < cnt; k++) {
          const t = (k + 0.5) / cnt, x = p[0] + (q[0] - p[0]) * t, z = p[1] + (q[1] - p[1]) * t, r = rp([x, z]), f = 0.4, px = x + (r[0] - x) * f, pz = z + (r[2] - z) * f;
          dormers[key].push(mtx(px, eave + rise * f - 0.3, pz, 1, 1, 1, Math.atan2(nx, nz)));
        }
      }
    }
    if (kind === 'flat') { const sh = new THREE.Shape(ring.map((p) => new THREE.Vector2(p[0], p[1]))), g = new THREE.ShapeGeometry(sh); g.rotateX(Math.PI / 2); g.translate(0, eave, 0); mesh(g, M.slate, group, key, 'flat-roof'); }
    mesh(wall.geom(THREE), M[o.wallMat], group, key, 'walls');
    if (kind !== 'flat') mesh(roof.geom(THREE), M[o.roofMat], group, key, 'roof');
    if (o.chimneys && kind !== 'flat') { const m = (rl > 3 ? [-1, 1] : [0]); for (const s of m) { const c = toXZ(cu + s * (rl - 1.0), cv + (hash(o.id + s) - .5) * b * .3); chimneys.push(mtx(c[0], eave + rise * 0.97, c[1])); } }
    return { ring, ob, eave, rise, gm, a, b, cu, cv, rl, toXZ };
  }
  // ---------- Chateau Frontenac ----------
  const C = DATA.chateau, tur = [], cones = [];
  const rg = outward(C.ring), baseTop = Math.min(...C.parts.map((p) => p.top - 12)), ge = Math.min(...rg.map((p) => gh(p[0], p[1])));
  block(chateau, 'chateau', C.ring, { id: 1, top: ge + 24, ground: ge + 0.5, roof: 'flat', wallMat: 'brick', floorH: 3.9, cellW: 3.8 });          // main mass under the parts, flat dark cap hidden by the wings
  for (const p of C.parts) {
    const big = p.levels >= 10, r = block(chateau, 'chateau', p.ring, { id: p.id, top: p.top, ground: Math.min(p.ground, ge + 1), roof: p.roof, riseF: big ? 1.8 : 1.25, maxRise: big ? 30 : 17, wallMat: 'brick', roofMat: 'copper', floorH: 3.9, cellW: 3.8, dormer: !big });
    const R = r.ring; for (let i = 0; i < R.length; i++) {      // corner turrets with conical copper roofs
      const a = R[(i + R.length - 1) % R.length], b = R[i], c = R[(i + 1) % R.length], e1 = [b[0] - a[0], b[1] - a[1]], e2 = [c[0] - b[0], c[1] - b[1]], l1 = Math.hypot(...e1), l2 = Math.hypot(...e2);
      const cr = (e1[0] * e2[1] - e1[1] * e2[0]) / (l1 * l2), dt = (e1[0] * e2[0] + e1[1] * e2[1]) / (l1 * l2);
      if (cr > -0.7 || Math.abs(dt) > 0.4 || hash(p.id + i) < 0.35 || l1 < 6 || l2 < 6) continue;
      const nin = [(e1[1] / l1 + e2[1] / l2), -(e1[0] / l1 + e2[0] / l2)], nl = Math.hypot(...nin) || 1, rad = big ? 3.0 : 2.2;
      const cx = b[0] + (nin[0] / nl) * rad * 0.35, cz = b[1] + (nin[1] / nl) * rad * 0.35, top = r.eave + (big ? 4 : 3), base = r.gm;
      tur.push(mtx(cx, base - 1, cz, rad, top - base + 1, rad)); cones.push(mtx(cx, top, cz, rad * 1.3, big ? 12 : 8.5, rad * 1.3));
    }
    if (big) {  // the 1924 central tower: stepped lantern, balustrade and a taller spire
      const cc = r.toXZ(r.cu, r.cv), sp = new THREE.ConeGeometry(1, 1, 8); sp.translate(0, .5, 0); cones.push(mtx(cc[0], p.top - 0.5, cc[1], 2.1, 12, 2.1)); tur.push(mtx(cc[0], p.top - 6, cc[1], 2.1, 6, 2.1));
    }
  }
  const cyl = new THREE.CylinderGeometry(1, 1, 1, HI ? 14 : 8); cyl.translate(0, .5, 0); const cone = new THREE.ConeGeometry(1, 1, HI ? 14 : 8); cone.translate(0, .5, 0);
  inst(cyl, M.shaft, tur, chateau, 'chateau', 'turret-shafts'); inst(cone, M.copper, cones, chateau, 'chateau', 'turret-roofs'); inst(dormerGeo, M.vc, dormers.chateau, chateau, 'chateau', 'chateau-dormers');
  // ---------- Dufferin Terrace ----------
  const Tm = DATA.terrace, rail = Tm.rail, W = Tm.width, N = rail.length, dy = [], tan = [], inn = [];
  for (let i = 0; i < N; i++) { const a = rail[Math.max(0, i - 1)], b = rail[Math.min(N - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]); tan.push([(b[0] - a[0]) / l, (b[1] - a[1]) / l]); inn.push([-(b[1] - a[1]) / l, (b[0] - a[0]) / l]); }
  for (let i = 0; i < N; i++) { const p = rail[i], q = [p[0] + inn[i][0] * W * .5, p[1] + inn[i][1] * W * .5], s = [p[0] + inn[i][0] * W, p[1] + inn[i][1] * W]; dy.push(Math.max(gh(p[0], p[1]), gh(q[0], q[1]), gh(s[0], s[1]), p[2]) + 0.07); }
  const sy = dy.map((_, i) => { let s = 0, c = 0; for (let k = -3; k <= 3; k++) { const j = Math.min(N - 1, Math.max(0, i + k)); s += dy[j]; c++; } return s / c; });
  const dk = new MB(), sk = new MB(); let dist = 0;
  for (let i = 0; i < N - 1; i++) {
    const p = rail[i], q = rail[i + 1], L = Math.hypot(q[0] - p[0], q[1] - p[1]), pi = [p[0] + inn[i][0] * W, p[1] + inn[i][1] * W], qi = [q[0] + inn[i + 1][0] * W, q[1] + inn[i + 1][1] * W];
    dk.quad([pi[0], sy[i], pi[1]], [qi[0], sy[i + 1], qi[1]], [q[0], sy[i + 1], q[1]], [p[0], sy[i], p[1]], [0, dist / 4], [0, (dist + L) / 4], [W / 1.2, (dist + L) / 4], [W / 1.2, dist / 4]);
    sk.quad([p[0], sy[i], p[1]], [q[0], sy[i + 1], q[1]], [q[0], sy[i + 1] - 4.5, q[1]], [p[0], sy[i] - 4.5, p[1]], [dist / 3, 1.5], [(dist + L) / 3, 1.5], [(dist + L) / 3, 0], [dist / 3, 0]); dist += L;
  }
  mesh(dk.geom(THREE), M.deck, terrace, 'terrace', 'deck'); mesh(sk.geom(THREE), M.wall, terrace, 'terrace', 'deck-wall');
  // railing: posts every ~1.1 m, top and mid rails, pickets (high quality)
  const posts = [], pick = [], rb = new MB(); let acc2 = 0, nextP = 0, nextK = 0;
  const yAt = (i, t) => sy[i] + (sy[Math.min(N - 1, i + 1)] - sy[i]) * t;
  for (let i = 0; i < N - 1; i++) {
    const p = rail[i], q = rail[i + 1], L = Math.hypot(q[0] - p[0], q[1] - p[1]), ang = Math.atan2(q[0] - p[0], q[1] - p[1]);
    for (const h of [1.0, 0.55]) { const w = h > .9 ? .06 : .035, ya = yAt(i, 0) + h, yb = yAt(i + 1, 0) + h, nxn = [-(q[1] - p[1]) / L * w, (q[0] - p[0]) / L * w]; // thin bar as a quad strip (top face + sides)
      rb.quad([p[0] - nxn[0], ya + w, p[1] - nxn[1]], [q[0] - nxn[0], yb + w, q[1] - nxn[1]], [q[0] + nxn[0], yb + w, q[1] + nxn[1]], [p[0] + nxn[0], ya + w, p[1] + nxn[1]], [0, 0], [1, 0], [1, 1], [0, 1]);
      rb.quad([p[0] + nxn[0], ya + w, p[1] + nxn[1]], [q[0] + nxn[0], yb + w, q[1] + nxn[1]], [q[0] + nxn[0], yb - w, q[1] + nxn[1]], [p[0] + nxn[0], ya - w, p[1] + nxn[1]], [0, 0], [1, 0], [1, 1], [0, 1]);
      rb.quad([q[0] - nxn[0], yb + w, q[1] - nxn[1]], [p[0] - nxn[0], ya + w, p[1] - nxn[1]], [p[0] - nxn[0], ya - w, p[1] - nxn[1]], [q[0] - nxn[0], yb - w, q[1] - nxn[1]], [0, 0], [1, 0], [1, 1], [0, 1]); }
    for (let d = 0; d < L; d += 0.18) { const t = d / L, x = p[0] + (q[0] - p[0]) * t, z = p[1] + (q[1] - p[1]) * t, post = (acc2 + d) >= nextP; if (post) { posts.push(mtx(x, yAt(i, t) + 0.55, z, .11, 1.1, .11, ang)); nextP += 1.8; } else if (HI) pick.push(mtx(x, yAt(i, t) + 0.5, z, .028, .95, .028, ang)); }
    acc2 += L;
  }
  const unit = new THREE.BoxGeometry(1, 1, 1); inst(unit, M.railIron, posts, terrace, 'terrace', 'railing-posts'); if (HI) inst(unit, M.railIron, pick, terrace, 'terrace', 'railing-pickets'); mesh(rb.geom(THREE), M.railTop, terrace, 'terrace', 'railing-rails');
  const deckY = (z) => { let bi = 0, bd = 1e9; for (let i = 0; i < N; i++) { const d = Math.abs(rail[i][1] - z); if (d < bd) { bd = d; bi = i; } } return sy[bi]; };
  const railX = (z) => { let bi = 0, bd = 1e9; for (let i = 0; i < N; i++) { const d = Math.abs(rail[i][1] - z); if (d < bd) { bd = d; bi = i; } } return rail[bi][0]; };
  // gazebos (green and white kiosks), OSM positions
  const kf = new THREE.CylinderGeometry(1, 1, 1, 8); const kfl = [], kpo = [], kro = [], kcr = [];
  for (const k of Tm.kiosks) { const y = deckY(k.z), r = 3.1; kfl.push(mtx(k.x, y, k.z, r, .35, r, Math.PI / 8)); for (let j = 0; j < 8; j++) { const t = j * Math.PI / 4 + Math.PI / 8; kpo.push(mtx(k.x + Math.cos(t) * r * .92, y + .3, k.z + Math.sin(t) * r * .92, .13, 2.6, .13)); }
    kcr.push(mtx(k.x, y + 2.9, k.z, r * 1.02, .3, r * 1.02, Math.PI / 8)); kro.push(mtx(k.x, y + 3.2, k.z, r * 1.25, 2.9, r * 1.25, Math.PI / 8)); }
  const kcone = new THREE.ConeGeometry(1, 1, 8); kcone.translate(0, .5, 0); const kcyl = new THREE.CylinderGeometry(1, 1, 1, 8); kcyl.translate(0, .5, 0); const kpost = new THREE.CylinderGeometry(1, 1, 1, 6); kpost.translate(0, .5, 0);
  // wifscene9: bell-shaped roof in 16 alternating dark-green / white segments, white valance at the eave, flag-pole finial (ref wilfredor-kiosks)
  const bellPts = [[1.0, 0.0], [0.97, 0.06], [0.86, 0.13], [0.66, 0.26], [0.46, 0.43], [0.3, 0.62], [0.17, 0.8], [0.08, 0.93], [0.0, 1.0]].map(([x, y]) => new THREE.Vector2(x, y));
  const SEG = 16, bell = new THREE.LatheGeometry(bellPts, SEG).toNonIndexed(), per = (bellPts.length - 1) * 2 * 3, bc = [], cg = new THREE.Color(0x163a2a), cw = new THREE.Color(0xe2e0d6);   // wifscene14: darker green, slightly grey white so the stripes read backlit at the climb end (was 0x24543f / 0xeeece4)
  for (let v = 0; v < bell.attributes.position.count; v++) { const c = Math.floor(v / per) % 2 ? cw : cg; bc.push(c.r, c.g, c.b); }
  bell.setAttribute('color', new THREE.Float32BufferAttribute(bc, 3)); bell.computeVertexNormals();
  const kroofM = std({ vertexColors: true, roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide });
  const kval = [], kfin = [];
  for (const k of Tm.kiosks) { const y = deckY(k.z), r = 3.1; kval.push(mtx(k.x, y + 2.95, k.z, r * 1.26, .38, r * 1.26, 0)); kfin.push(mtx(k.x, y + 5.9, k.z, .05, 3.6, .05)); }
  const kvalG = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true); kvalG.translate(0, .5, 0);
  inst(kcyl, M.white, kfl.concat(kcr), terrace, 'terrace', 'kiosk-floor-cornice'); inst(kpost, M.white, kpo.concat(kfin), terrace, 'terrace', 'kiosk-posts'); inst(bell, kroofM, kro, terrace, 'terrace', 'kiosk-roofs');
  inst(kvalG, std({ color: 0xf1eee6, roughness: 0.6, side: THREE.DoubleSide }), kval, terrace, 'terrace', 'kiosk-valance');
  // benches facing the river (+x) and lamp posts
  const bn = Tm.benches.map((b, i) => mtx(b[0], deckY(b[1]), b[1], 1, 1, 1, Math.PI / 2)); inst(benchGeo, M.vc, bn, terrace, 'terrace', 'benches');
  const lps = [], lan = [], arms = []; for (let z = -170; z < 210; z += 26) { const x = railX(z) + inn[0][0] * 2.4 + 0, y = deckY(z); lps.push(mtx(x, y, z, .07, 4.0, .07)); lan.push(mtx(x, y + 4.25, z, .2, .2, .2), mtx(x, y + 3.62, z - .55, .17, .17, .17), mtx(x, y + 3.62, z + .55, .17, .17, .17)); arms.push(mtx(x, y + 3.42, z, .05, .06, 1.12), mtx(x, y + 3.95, z, .1, .14, .1), mtx(x, y + 3.5, z - .55, .045, .14, .045), mtx(x, y + 3.5, z + .55, .045, .14, .045)); }
  // wifscene8: multi-globe lamp standard (refs wilfredor-kiosks): taller post, cross arm with two globes plus a top globe
  const globeGeo = new THREE.SphereGeometry(1, 16, 12); inst(globeGeo, M.lamp, lan, terrace, 'terrace', 'lamp-globes'); inst(unit, M.railIron, arms, terrace, 'terrace', 'lamp-arms');
  inst(kpost, M.iron, lps, terrace, 'terrace', 'lamp-posts');
  // wifscene6: a fluted cast-iron base (0.17 m radius, 0.9 m) at each lamp standard, so the bases stand out of flood water
  inst(kpost, M.railIron, lps.map((m) => { const P = new THREE.Vector3().setFromMatrixPosition(m); return mtx(P.x, P.y, P.z, .17, .9, .17); }), terrace, 'terrace', 'lamp-bases'); 
  // ---------- Place Royale ----------
  const wallPick = ['stone', 'stone2'], roofPick = ['copper', 'slate', 'tin', 'slate'];
  for (const h of DATA.placeRoyale.houses) {
    const hv = hash(h.id), r0 = h.ring; if (h.top - h.ground < 3) continue;
    const o = { id: h.id, top: h.top, ground: h.ground, roof: h.church ? 'gabled' : (hv < 0.8 ? 'gabled' : 'hipped'), riseF: h.church ? 1.0 : 1.05, maxRise: 9, wallMat: h.church ? 'stone2' : wallPick[hv < .5 ? 0 : 1], roofMat: h.church ? 'slate' : roofPick[Math.floor(hash(h.id + 5) * 4)], floorH: 3.2, cellW: 3.0, dormer: !h.church && h.area > 90, dormerStep: 4.2, chimneys: !h.church };
    const r = block(placeRoyale, 'placeRoyale', r0, o);
    if (h.church) { const tc = r.toXZ(r.cu + r.a * .78, r.cv), ts = Math.min(r.b * 1.1, 3.2), topT = r.eave + r.rise + 5; const tb = new MB(); box(tb, -1, 0, -1, 1, 1, 1, [.7, .66, .58]); const sq = new THREE.BoxGeometry(1, 1, 1); sq.translate(0, .5, 0); inst(sq, M.stone2, [mtx(tc[0], r.gm - 1, tc[1], ts * 2, topT - r.gm + 1, ts * 2, Math.atan2(r.ob.uz, r.ob.ux) * -1)], placeRoyale, 'placeRoyale', 'church-tower'); inst(cone, M.copper, [mtx(tc[0], topT, tc[1], ts * 1.5, ts * 4, ts * 1.5)], placeRoyale, 'placeRoyale', 'church-spire'); }
  }
  inst(dormerGeo, M.vc, dormers.placeRoyale, placeRoyale, 'placeRoyale', 'house-dormers'); inst(chimneyGeo, M.vc, chimneys, placeRoyale, 'placeRoyale', 'chimneys');
  // ---------- hiding helper for the world ----------
  const hidePolys = [DATA.chateau.ring].concat(DATA.placeRoyale.houses.map((h) => h.ring), Tm.kiosks.map((k) => Array.from({ length: 8 }, (_, j) => [k.x + Math.cos(j * Math.PI / 4) * 4.5, k.z + Math.sin(j * Math.PI / 4) * 4.5])));
  const inPoly = (x, z, r) => { let c = false; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  const isHidden = (x, z) => hidePolys.some((p) => inPoly(x, z, p));
  // wifscene12: the OSM Chateau's wall triangles lie on the footprint edge, so their centroids fell in or out at random and the survivors
  // showed as a flat grey slab z-fighting with the hand-made walls (climb end, frames 440-458): also drop triangles within 2.5 m of that edge
  const segD = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };
  const nearChateau = (x, z) => { const r = DATA.chateau.ring; for (let i = 0; i < r.length; i++) if (segD(x, z, r[i], r[(i + 1) % r.length]) < 2.5) return true; return false; };
  // removes triangles of the world's merged 'buildings' mesh whose centroid lies inside a hand-modelled footprint (the world rows carry no OSM id)
  function maskWorldBuildings(m) { const g = m.geometry, pos = g.attributes.position, ix = g.index ? g.index.array : Uint32Array.from({ length: pos.count }, (_, i) => i), keep = []; for (let i = 0; i < ix.length; i += 3) { const x = (pos.getX(ix[i]) + pos.getX(ix[i + 1]) + pos.getX(ix[i + 2])) / 3, z = (pos.getZ(ix[i]) + pos.getZ(ix[i + 1]) + pos.getZ(ix[i + 2])) / 3; if (!isHidden(x, z) && !nearChateau(x, z)) keep.push(ix[i], ix[i + 1], ix[i + 2]); } g.setIndex(keep); return ix.length / 3 - keep.length / 3; }
  const total = tris.chateau + tris.terrace + tris.placeRoyale;
  return { root, chateau, terrace, placeRoyale, hideFootprints: DATA.hide.slice(), hidePolygons: hidePolys, isHidden, maskWorldBuildings, materials: M, stats: { triangles: { ...tris, total }, quality }, railing: { path: rail.map((p, i) => [p[0], sy[i], p[1]]) } };
}
