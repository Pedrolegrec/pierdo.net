// Stage for the dance toy: the night backyard from the dance video (same scene code), with handles for the toggles. No Math.random: the set dressing is seeded.
import * as THREE from 'three';
const q = (k, d) => d;
export function buildStage(scene, SHADOW = 2048) {
  const GROUND = -1.6;
  let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  let moon = null, halo = null; const pumpkinGroups = [];
// ---- sky: vertical gradient background plus a few stars ----
{
  const c = document.createElement('canvas'); c.width = 4; c.height = 256; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#071436'); gr.addColorStop(0.30, '#0e2358'); gr.addColorStop(0.55, '#16306a'); gr.addColorStop(1, '#1b2250'); g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; scene.background = t;
  const pos = []; for (let i = 0; i < 160; i++) { const a = rnd() * Math.PI * 0.9 - Math.PI * 0.45, e = 0.35 + rnd() * 0.5; pos.push(Math.sin(a) * 40, 6 + e * 22, -45); }
  const st = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)), new THREE.PointsMaterial({ color: new THREE.Color(1.4, 1.4, 1.6), size: 0.18, fog: false })); scene.add(st);
}
scene.fog = new THREE.Fog(0x0d1a3c, 12, 34);

// ---- lights ----
const hemi = new THREE.HemisphereLight(0x3a5a9a, 0x1a1830, q('hemi', 0.5)); scene.add(hemi);
const key = new THREE.DirectionalLight(0xb0607a, q('key', 1.5)); key.position.set(-4.5, 3.6, 3.0); key.target.position.set(0, 1.0, 0); scene.add(key, key.target);
key.castShadow = true; key.shadow.mapSize.set(SHADOW, SHADOW); Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 14 }); key.shadow.bias = -0.0006; key.shadow.normalBias = 0.02;
const rim = new THREE.DirectionalLight(0x5ab4ff, q('rim', 1.3)); rim.position.set(4.5, 3.0, -4.5); rim.target.position.set(0, 1, 0); scene.add(rim, rim.target);
const rim2 = new THREE.DirectionalLight(0x4ac8ff, q('rim2', 0.9)); rim2.position.set(-4.5, 3.2, -4.5); rim2.target.position.set(0, 1, 0); scene.add(rim2, rim2.target);
const front = new THREE.DirectionalLight(0xdcefe0, q('front', 1.25)); front.position.set(0.8, 1.6, 6); front.target.position.set(0, 1.2, 0); scene.add(front, front.target);
const top = new THREE.PointLight(0xffb070, 1.6, 7, 1.6); top.position.set(0.3, 3.6, 1.4); scene.add(top);
const pLights = [];
const faceFill = new THREE.PointLight(0xdff4d6, q('ff', 4.5), 6, 2); scene.add(faceFill);   // v2: a cool pale fill that follows the head, so the face is the brightest skin area and reads grey-green

// ---- platform, ground, fence, building ----
const wood = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0 });
const plat = new THREE.Mesh(new THREE.BoxGeometry(4.4, -GROUND, 2.8), wood(0x4a3640)); plat.position.set(0, GROUND / 2, 0); plat.receiveShadow = true; scene.add(plat);
{ // plank lines on the platform top and the front face
  const mat = new THREE.MeshBasicMaterial({ color: 0x120a0a });
  for (let i = -5; i <= 5; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.004, 2.8), mat); l.position.set(i * 0.4, 0.0025, 0); scene.add(l); }
  const e = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.05, 0.05), wood(0x3a2418)); e.position.set(0, 0.0, 1.4); scene.add(e);
}
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), wood(0x0a1428)); ground.rotation.x = -Math.PI / 2; ground.position.set(0, GROUND, -4); scene.add(ground);
// ---- night backyard: dark tree line (two rows), a dark blue fence, a moon ----
{ const fence = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 2.4, 0.08), wood(0xffffff), 70); const m = new THREE.Matrix4(), col = new THREE.Color();
  for (let i = 0; i < 70; i++) { m.makeTranslation(-7 + i * 0.2, -0.4 + (rnd() - 0.5) * 0.04, -3.4 + (rnd() - 0.5) * 0.02); fence.setMatrixAt(i, m); const v = 0.55 + rnd() * 0.45; fence.setColorAt(i, col.setRGB(0.10 * v, 0.14 * v, 0.27 * v)); } scene.add(fence);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(14, 0.1, 0.1), wood(0x1c2848)); rail.position.set(0, 0.15, -3.3); scene.add(rail); }
{ const tree = (x, z, h, w, col, round) => { const g = round ? new THREE.SphereGeometry(1, 12, 8) : new THREE.ConeGeometry(1, 1, 9); const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col }));
    if (round) { m.scale.set(w, h * 0.5, w); m.position.set(x, GROUND + h * 0.5, z); } else { m.scale.set(w, h, w); m.position.set(x, GROUND + h / 2, z); } scene.add(m);
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, h * 0.3, 6), new THREE.MeshBasicMaterial({ color: col })); tr.position.set(x, GROUND + h * 0.12, z); scene.add(tr); };
  for (let i = 0; i < 26; i++) { const x = -15 + i * 1.2 + (rnd() - 0.5) * 1.0; tree(x, -15 - rnd() * 2, 4.5 + rnd() * 2.6, 0.8 + rnd() * 0.5, 0x0c1b3d, i % 5 === 4); }
  for (let i = 0; i < 18; i++) { const x = -12 + i * 1.4 + (rnd() - 0.5) * 1.2; tree(x, -9.5 - rnd() * 1.5, 3.4 + rnd() * 2.0, 0.7 + rnd() * 0.5, 0x060d22, i % 4 === 3); }
  moon = new THREE.Mesh(new THREE.CircleGeometry(1.15, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.80, 0.88, 1.0), fog: false })); moon.position.set(-4.6, 9.2, -30); scene.add(moon);
  const gc = document.createElement('canvas'); gc.width = gc.height = 128; const gg = gc.getContext('2d'); const gr2 = gg.createRadialGradient(64, 64, 8, 64, 64, 64); gr2.addColorStop(0, 'rgba(160,190,255,0.55)'); gr2.addColorStop(1, 'rgba(160,190,255,0)'); gg.fillStyle = gr2; gg.fillRect(0, 0, 128, 128);
  halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(gc), transparent: true, depthWrite: false, fog: false, opacity: 0.5 })); halo.scale.set(9, 9, 1); halo.position.set(-4.6, 9.2, -30.5); scene.add(halo); }

// ---- string lights: warm, orange and purple bulbs with bloom ----
const bulbCols = [0xffd08a, 0xffd08a, 0xffd08a, 0xffb060, 0xff7a1a, 0xa24dff, 0xffd08a, 0xff8a3a, 0xb060ff];
const bulbs = [];
function stringLights(x0, y0, x1, y1, sag, z, n) {
  const pts = []; for (let i = 0; i <= 24; i++) { const u = i / 24; pts.push(new THREE.Vector3(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u - sag * (1 - (2 * u - 1) ** 2), z)); }
  const cv = new THREE.CatmullRomCurve3(pts);
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(cv, 60, 0.008, 4), new THREE.MeshBasicMaterial({ color: 0x0a0710 })));
  for (let i = 0; i < n; i++) { const p = cv.getPoint((i + 0.5) / n); const bc = bulbCols[(i * 5 + Math.floor(z * 3)) % bulbCols.length]; const c = new THREE.Color(bc).multiplyScalar(bc === 0xa24dff || bc === 0xb060ff ? 1.1 : 1.9);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshBasicMaterial({ color: c, fog: false })); b.position.copy(p); scene.add(b); bulbs.push(b); }
}
stringLights(-9, 5.4, 9, 5.7, 0.7, -7.0, 10);

// ---- jack-o'-lanterns on the platform edge ----
function pumpkin(x, z, s, ry) {
  const g = new THREE.SphereGeometry(1, 28, 20); const p = g.attributes.position; const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const az = Math.atan2(v.z, v.x); const k = 1 + 0.06 * Math.cos(az * 9); p.setXYZ(i, v.x * k * 0.2 * s, v.y * 0.16 * s, v.z * k * 0.2 * s); } g.computeVertexNormals();
  const grp = new THREE.Group();
  const body = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xff6a10, roughness: 0.6, emissive: 0xff4a00, emissiveIntensity: 0.165 })); body.castShadow = true; grp.add(body);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02 * s, 0.03 * s, 0.07 * s, 8), wood(0x3a4a1a)); stem.position.y = 0.17 * s; stem.rotation.z = 0.2; grp.add(stem);
  const gm = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.78, 0.25).multiplyScalar(0.86), side: THREE.DoubleSide, fog: false });
  const tri = (a, b, c) => { const sh = new THREE.Shape([new THREE.Vector2(...a), new THREE.Vector2(...b), new THREE.Vector2(...c)]); const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), gm); m.scale.setScalar(s * 0.2); m.position.z = 0.2 * s * 0.99; grp.add(m); };
  tri([-0.62, 0.35], [-0.2, 0.28], [-0.4, 0.68]); tri([0.62, 0.35], [0.2, 0.28], [0.4, 0.68]); tri([-0.08, 0.1], [0.08, 0.1], [0, 0.26]);
  { const sh = new THREE.Shape(); const pts = [[-0.62, -0.1], [-0.4, -0.28], [-0.25, -0.12], [-0.1, -0.3], [0.05, -0.12], [0.2, -0.3], [0.38, -0.12], [0.62, -0.1], [0.4, -0.5], [0.0, -0.58], [-0.4, -0.5]]; sh.moveTo(...pts[0]); pts.slice(1).forEach((p) => sh.lineTo(...p)); const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), gm); m.scale.setScalar(s * 0.2); m.position.z = 0.2 * s * 0.97; grp.add(m); }
  grp.position.set(x, 0.16 * s, z); grp.rotation.y = ry; pumpkinGroups.push(grp);
  const l = new THREE.PointLight(0xff8a2a, 0.8, 3.2, 1.8); l.position.set(x, 0.3 * s + 0.1, z + 0.35); scene.add(l); pLights.push(l);
  scene.add(grp);
}
pumpkin(-0.64, 0.98, 1.0, 0.35); pumpkin(0.52, 0.94, 0.85, -0.3); pumpkin(-0.18, 1.14, 0.55, 0.1);

// ---- low fog: soft sprites drifting along the ground ----
const fogSprites = [];
{ const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c); const cols = [0x6a5ad0, 0x4a7ad0, 0xc04a9a, 0x3a9ac0];
  for (let i = 0; i < 12; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: cols[i % 4], transparent: true, opacity: q('fog', 0.085) * (0.7 + 0.6 * rnd()), depthWrite: false, fog: false }));
    sp.scale.set(3.4 + rnd() * 2.4, 0.9 + rnd() * 0.5, 1); sp.userData = { x: -3.5 + rnd() * 7, y: -0.1 + rnd() * 0.55, z: -1.8 + rnd() * 4.4, ph: rnd() * 6.28, sp: 0.08 + rnd() * 0.1 }; scene.add(sp); fogSprites.push(sp); } }

// ---- crowd: simple low-poly silhouettes from behind, phones with glowing screens, a few hats ----
const crowd = [];
{ const dark = [0x241a30, 0x1c1526, 0x2a1c34, 0x181220], phoneMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.75, 0.9, 1.0).multiplyScalar(0.9), fog: false }), phoneBody = new THREE.MeshStandardMaterial({ color: 0x08080c, roughness: 0.5 });
  const spots = [[-1.45, 2.1], [-0.95, 1.95], [-0.45, 2.15], [0.05, 1.98], [0.55, 2.12], [1.0, 1.96], [1.5, 2.1], [-1.2, 2.55], [-0.2, 2.5], [0.75, 2.52], [1.35, 2.5], [-0.7, 2.9], [0.35, 2.9]];
  const hats = { 1: 'witch', 5: 'party', 8: 'witch', 10: 'party' };
  spots.forEach(([x, z], i) => {
    const mat = new THREE.MeshStandardMaterial({ color: dark[i % 4], roughness: 0.92 }); const grp = new THREE.Group(); const hy = GROUND + 1.52 + (rnd() - 0.5) * 0.18;
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10).scale(0.30, 0.44, 0.2), mat); body.position.y = hy - 0.5; grp.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.125, 14, 10), mat); head.position.y = hy; grp.add(head);
    if (hats[i] === 'witch') { const h = new THREE.Group(); const cone = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.36, 12), new THREE.MeshStandardMaterial({ color: 0x2c1650, roughness: 0.8 })); cone.position.y = 0.26; const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.012, 16), cone.material); brim.position.y = 0.085;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.04, 12), new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.7, emissive: 0x401500 })); band.position.y = 0.11; h.add(cone, brim, band); h.position.y = hy + 0.08; h.rotation.z = 0.12; grp.add(h); }
    if (hats[i] === 'party') { const cone = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.24, 10), new THREE.MeshStandardMaterial({ color: i === 5 ? 0xffd23a : 0xff3aa0, roughness: 0.6, emissive: i === 5 ? 0x806000 : 0x70002a })); cone.position.set(0.03, hy + 0.19, 0); cone.rotation.z = -0.18; grp.add(cone); }
    let arm = null, phone = null;
    if (i % 3 !== 2) { const side = i % 2 ? 1 : -1; arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.55, 8), mat); arm.position.set(side * 0.27, hy - 0.2, 0.0); arm.rotation.z = -side * 0.35; grp.add(arm);
      phone = new THREE.Group(); const pb = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.15, 0.012), phoneBody); const ps = new THREE.Mesh(new THREE.PlaneGeometry(0.063, 0.135), phoneMat); ps.position.z = 0.0075; phone.add(pb, ps); phone.position.set(side * 0.37, hy + 0.12 + (rnd() - 0.5) * 0.1, 0.05); phone.rotation.x = -0.1; grp.add(phone); }
    grp.position.set(x, 0, z); grp.rotation.y = (rnd() - 0.5) * 0.25; scene.add(grp); crowd.push({ grp, ph: rnd() * 6.28, phone, arm });
  });
}


  const sw = (t, f, p) => Math.sin(t * f + p);
  return {
    GROUND, key, rim, rim2, hemi, front, top, faceFill, moon, halo, pumpkinGroups, pLights, bulbs, fogSprites, crowd, plat,
    setMoon(on) { moon.visible = halo.visible = on; rim.intensity = on ? 1.3 : 0.12; rim2.intensity = on ? 0.9 : 0.1; hemi.intensity = on ? 0.5 : 0.22; },
    setPumpkins(on) { pumpkinGroups.forEach((g) => { g.visible = on; }); pLights.forEach((l) => { l.visible = on; }); },
    update(t, ph, Jc, S0) {
  const hw = Jc.head.clone().multiplyScalar(S0); faceFill.position.set(hw.x + 0.25, hw.y + 0.25, hw.z + 1.5);
  // v8: the face fill is a strong close point light (inverse-square). A hand brought up in front of the face (527-536, 584-586) came within
  // ~0.8 m of it and got 3-4x the face's light, which the bloom turned into a white hot spot. When a hand (wrist or hand tip) would get more
  // than FF_CAP x the face's fill, the light backs away along its own offset by s and its intensity rises by s^2: the face keeps exactly the
  // same light, the hand gets at most FF_CAP x. Other frames: s = 1, unchanged.
  { const FF_CAP = 2.3, off = new THREE.Vector3(0.25, 0.25, 1.5), J = Jc, S = S0;
    const pts = []; for (const sd of ['l', 'r']) { pts.push(J[sd + 'Wri'].clone().multiplyScalar(S)); if (J[sd + 'HandDir']) pts.push(J[sd + 'Wri'].clone().addScaledVector(J[sd + 'HandDir'], 0.15).multiplyScalar(S)); }
    let s = 1; for (; s < 4; s += 0.05) { const Lp = hw.clone().addScaledVector(off, s), df = off.length() * s; if (pts.every((p) => (df / p.distanceTo(Lp)) ** 2 <= FF_CAP)) break; }
    faceFill.position.copy(hw).addScaledVector(off, s); faceFill.intensity = q('ff', 4.5) * s * s; faceFill.distance = 6 * s; window.__ffScale = s; }
      const pulse = Math.exp(-ph * 3.5);
      key.intensity = 2.2 * (0.9 + 0.22 * pulse); bulbs.forEach((b, i) => b.scale.setScalar(1 + 0.12 * pulse * (i % 2 ? 1 : 0.6)));
      pLights.forEach((l, i) => { l.intensity = 0.75 + 0.2 * sw(t, 7 + i, i * 2) + 0.1 * pulse; });
      fogSprites.forEach((s) => { const u = s.userData; s.position.set(u.x + 0.6 * sw(t, u.sp, u.ph), u.y + 0.05 * sw(t, 0.4, u.ph), u.z); });
      crowd.forEach((c) => { c.grp.position.y = Math.sin(t / 0.9056 * Math.PI * 2 + c.ph) * 0.025 - Math.abs(Math.sin(c.ph * 3 + t * 1.3)) * 0.01; if (c.phone) c.phone.rotation.z = 0.08 * sw(t, 1.7, c.ph); });
    },
  };
}
