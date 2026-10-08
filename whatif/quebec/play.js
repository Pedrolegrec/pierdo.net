// Playable Quebec what-if (draft). Reuses the video engine's modules in ./scene and ./world; this file replaces the frame-by-frame main.js.
import './scene/seed.js';
import * as THREE from 'three';
import { installHeightFog, upgradeMaterials, makeEnvironment, makePost, FOG } from './scene/post.js';
import { smooth, Q_MURK, Q_CLIMB, Q_CLIMB2, Q_FOG_FLOOD } from './scene/config.js';
import { makeSky, SUN_DIR, FOG_COLOR } from './scene/sky.js';
import { createWater, applyWetness } from './scene/water.js';
import LM from './world/landmarks-data.js';

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search), hs = new URLSearchParams(location.hash.slice(1));
const MAX_DAY = 56;
const T = {
  en: { title: 'What if the sea rose one metre a day?', place: 'Québec City · Dufferin Terrace', day: 'Day', play: 'Play', pause: 'Pause', replay: 'Replay',
    terrace: 'Terrace', river: 'Over the river', levis: 'From Lévis', under: 'Under water now', none: 'Nothing yet.',
    hint: 'Drag to look around. Pinch or scroll to zoom.', next: 'Which city next?', more: 'More from PierDo', loading: 'Loading the map…',
    nogl: 'This page needs WebGL to show the 3D scene. Try another browser or device.',
    credits: ['Contains information licensed under the Open Government Licence – Canada (Natural Resources Canada)', '© OpenStreetMap contributors (ODbL)', 'three.js (MIT)', 'Cormorant Garamond (SIL Open Font License 1.1)'] },
  fr: { title: 'Et si la mer montait d’un mètre par jour ?', place: 'Ville de Québec · terrasse Dufferin', day: 'Jour', play: 'Lecture', pause: 'Pause', replay: 'Rejouer',
    terrace: 'Terrasse', river: 'Sur le fleuve', levis: 'Depuis Lévis', under: 'Sous l’eau maintenant', none: 'Rien encore.',
    hint: 'Glissez pour regarder autour. Pincez ou faites défiler pour zoomer.', next: 'Quelle ville ensuite ?', more: 'Plus de PierDo', loading: 'Chargement de la carte…',
    nogl: 'Cette page a besoin de WebGL pour afficher la scène 3D. Essayez un autre navigateur ou appareil.',
    credits: ['Contient des informations autorisées sous la Licence du gouvernement ouvert – Canada (Ressources naturelles Canada)', '© les contributeurs d’OpenStreetMap (ODbL)', 'three.js (MIT)', 'Cormorant Garamond (licence SIL Open Font 1.1)'] },
};
let lang = hs.get('l') || qs.get('l') || ((navigator.language || 'en').toLowerCase().startsWith('fr') ? 'fr' : 'en'); if (!T[lang]) lang = 'en';
let day = Math.max(0, Math.min(MAX_DAY, Number(hs.get('d') || qs.get('d') || 0)));
let vpName = ['terrace', 'river', 'levis'].includes(hs.get('v') || qs.get('v')) ? (hs.get('v') || qs.get('v')) : 'river';   // wifplay2: default = the video's climb shot
let playing = hs.get('p') === '1';

// ---- text -------------------------------------------------------------------------------------------------------------------------
const ev = { list: [] };   // under-water events (from the landmark terrain/model heights); wifplay2: the OSM roof count was dropped (many default heights)
function setText() {
  const s = T[lang]; document.documentElement.lang = lang;
  $('title').textContent = s.title; $('place').textContent = s.place; $('hint').textContent = s.hint;
  $('under').firstChild.textContent = s.under; $('next').textContent = s.next; $('more').textContent = s.more; $('loadmsg').textContent = s.loading; $('nogl').firstChild.textContent = s.nogl;
  document.querySelectorAll('.vp [data-v]').forEach((b) => { b.textContent = s[b.dataset.v]; });
  $('lang').textContent = lang === 'en' ? 'FR' : 'EN'; $('credits').innerHTML = s.credits.map((c) => `<li>${c}</li>`).join('');
  $('play').textContent = playing ? s.pause : (day >= MAX_DAY ? s.replay : s.play); updateHud(true);
}
let lastHud = '';
function updateHud(force) {
  const d = Math.floor(day + 1e-6), s = T[lang], wy = day - 0.65;
  $('counter').firstChild.textContent = `${s.day} ${d}`; $('counter').lastChild.textContent = `+${d} m`;
  let last = null; for (const e of ev.list) if (e.y <= wy) last = e;
  const line = last ? last[lang] : s.none;
  if (force || line !== lastHud) { lastHud = line; $('under').lastChild.textContent = line; }
}

// ---- quality preset ------------------------------------------------------------------------------------------------------------------
const sceneEl = $('scene'), canvas = $('gl');
const cssW = () => sceneEl.clientWidth, cssH = () => sceneEl.clientHeight;
const PHONE = qs.get('q') ? qs.get('q') === 'phone' : (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 900) || cssW() < 600;
const DPR = Number(qs.get('dpr') || devicePixelRatio || 1);
const PRESET = PHONE
  ? { name: 'phone', ratio: Math.min(DPR, 1.5) * 0.8, maxPix: 0.75e6, fps: 30, shadow: 2048, refl: 0.35, dscale: 0.35, ao: false, bloom: 0, msaa: 2, lmq: 'low' }
  : { name: 'desktop', ratio: Math.min(DPR, 2), maxPix: 2.6e6, fps: 60, shadow: 4096, refl: 0.5, dscale: 0.5, ao: true, bloom: 0.28, msaa: 4, lmq: 'high' };
let ratio = PRESET.ratio; if (cssW() * cssH() * ratio * ratio > PRESET.maxPix) ratio = Math.sqrt(PRESET.maxPix / (cssW() * cssH()));
const RW = Math.round(cssW() * ratio), RH = Math.round(cssH() * ratio);

// ---- renderer (no WebGL -> poster + one sentence) -------------------------------------------------------------------------------
let renderer = null;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }); } catch (e) { renderer = null; }
if (!renderer) { setText(); $('loading').style.display = 'none'; $('nogl').style.display = 'flex'; document.querySelectorAll('#panel button, #panel input').forEach((b) => { if (b.id !== 'lang') b.disabled = true; }); $('lang').onclick = () => { lang = lang === 'en' ? 'fr' : 'en'; setText(); }; await new Promise(() => {}); }
renderer.setPixelRatio(1); renderer.setSize(RW, RH, false);
// wifplay3: a lost context (phones drop it when memory runs low) shows the no-WebGL poster instead of a frozen canvas
let glLost = false;
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); glLost = true; playing = false; $('loading').style.display = 'none'; $('hint').style.display = 'none'; $('nogl').style.display = 'flex';
  document.querySelectorAll('#panel button, #panel input').forEach((b) => { if (b.id !== 'lang') b.disabled = true; }); });
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.autoUpdate = false;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.92;
installHeightFog();
FOG.ext = 0.0003; FOG.k = 0.009;
setText();

const scene = new THREE.Scene(); scene.background = FOG_COLOR.clone(); scene.fog = new THREE.FogExp2(FOG_COLOR, FOG.ext);
const camera = new THREE.PerspectiveCamera(44, RW / RH, 0.5, 9000); scene.add(camera);
scene.add(makeSky()); const skyG = scene.children[scene.children.length - 1];
scene.add(new THREE.HemisphereLight(0xcfe3f7, 0x8a7f6c, 0.12));
const sun = new THREE.DirectionalLight(0xfff0d2, 4.2); sun.target.position.set(150, 0, -30); sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 600); scene.add(sun, sun.target);
sun.castShadow = true; sun.shadow.mapSize.set(PRESET.shadow, PRESET.shadow);
Object.assign(sun.shadow.camera, { left: -280, right: 280, top: 280, bottom: -280, near: 1, far: 1400 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.06; sun.shadow.radius = 3; sun.shadow.blurSamples = 16; sun.shadow.camera.updateProjectionMatrix();

const QM = await import('./scene/world-q.js');
const Q = await QM.loadQuebec(scene, { quality: PRESET.lmq });
const wat = createWater(scene, THREE, { renderer, camera, size: [RW, RH], reflScale: PRESET.refl, depthScale: PRESET.dscale, groundHeightAt: Q.world.groundHeightAt });
wat.mesh.scale.set(14000 / 3000, 1, 14000 / 3000);
upgradeMaterials(scene); applyWetness(scene, wat.uniforms);
{ const env = makeEnvironment(renderer, () => makeSky(), 1); scene.environment = env.texture; scene.environmentIntensity = 0.42; }
const QPRESET = Q.world.cameraPresets.terraceFlood;
if (QPRESET && wat && wat.setObstacles) { const cp = QPRESET.position, Mx = new THREE.Matrix4(), P = new THREE.Vector3(), got = { 'railing-posts': [], 'lamp-bases': [], 'kiosk-posts': [], 'benches': [] };   // wifscene9: + kiosk posts and bench legs
  (Q.landmarks.root || Q.landmarks.terrace).traverse((o) => { if (!o.isInstancedMesh || !got[o.name]) return;
    for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, Mx); P.setFromMatrixPosition(Mx); const d = Math.hypot(P.x - cp[0], P.z - cp[2]); if (d < 45) { if (o.name === 'benches') { const ax = new THREE.Vector3().setFromMatrixColumn(Mx, 0).normalize().multiplyScalar(0.8); got.benches.push([i, d, P.x + ax.x, P.z + ax.z], [i, d, P.x - ax.x, P.z - ax.z]); } else got[o.name].push([i, d, P.x, P.z]); } } });
  const near = (a, n) => a.sort((x, y) => x[1] - y[1]).slice(0, n).sort((x, y) => x[0] - y[0]);
  wat.setObstacles([...near(got['railing-posts'], 18).map((e) => [e[2], e[3], -0.06]), ...near(got['lamp-bases'], 4).map((e) => [e[2], e[3], 0.18]), ...near(got['kiosk-posts'], 4).map((e) => [e[2], e[3], 0.13]), ...near(got.benches, 6).map((e) => [e[2], e[3], 0.06])]); }
const post = makePost(renderer, scene, camera, RW, RH, { ao: PRESET.ao, aoFade: null, aoIntensity: 1.2, aoRadius: 4, bloom: PRESET.bloom, bloomThreshold: 0.85, grain: 0.010, vig: 0.20, samples: PRESET.msaa });

// ---- under-water facts from the data (landmark heights) ----------------------------------------------
{
  const houses = LM.placeRoyale.houses, dk = Q.world.cameraPresets.terraceDry.deck, ch = LM.chateau.ground;
  const E = (y, en, fr) => ev.list.push({ y, en, fr });
  for (const h of houses) if (h.name) { E(h.ground, `${h.name}: water at ground level`, `${h.name} : l’eau au niveau du sol`); E(h.top, `${h.name}: roof under water`, `${h.name} : toit sous l’eau`); }
  const g = houses.map((h) => h.ground), t = houses.map((h) => h.top), n = houses.length;
  E(Math.min(...g), 'Place Royale: water reaches the first house', 'Place-Royale : l’eau atteint la première maison');
  E(Math.max(...g), 'Place Royale: water at the doorsteps', 'Place-Royale : l’eau aux portes des maisons');
  E(Math.max(...t), 'Place Royale: the roofs go under', 'Place-Royale : les toits passent sous l’eau');
  E(dk, 'Dufferin Terrace: water reaches the deck', 'Terrasse Dufferin : l’eau atteint la promenade');
  E(ch, 'Château Frontenac: water at ground level', 'Château Frontenac : l’eau au niveau du sol');
  ev.list.sort((a, b) => a.y - b.y);
}

// ---- viewpoints and look-around ---------------------------------------------------------------------------------------------------------
const dirOf = (az, p) => { const r = Math.PI / 180; return new THREE.Vector3(Math.sin(az * r) * Math.cos(p * r), -Math.sin(p * r), -Math.cos(az * r) * Math.cos(p * r)); };
// wifplay2: river = the video's climb shot (engine config Q_CLIMB: 250, 62, -150, az 278, pitch 9, fov 30); terrace = the video's flood pose
// (world-q TERRACE_CAM_FLOOD: on the deck 8 m behind the rail at z -128, az 160 along the terrace to the kiosk, lamps and Chateau);
// levis = on the Levis cliff top 1.83 km across the river, straight across from the Chateau (terrain 57-61 m; eye 66 m above it, like a high lookout, so the Lower Town and cliff read over the river; eye-level read as a white sheet).
const TF = Q.world.cameraPresets.terraceFlood, lv = [1135, 1271], lvY = Math.max(58, Q.world.groundHeightAt(lv[0], lv[1])) + 6;
const VP = {
  // the video's pose (Q_CLIMB) only framed the cliff face at Day 20-54; on a phone page the river and the Chateau fell outside it, so the playable
  // pose stands 350 m further out over the river and higher, looking at the same cliff (Lower Town, cliff, terrace rail, Chateau in one frame), and
  // pushes in 70 m as the days pass (push: m along the view by Day 56), like the video's slow push-in, and tilts up
  // 3 deg from Day 20 to 56 (lift) so the rising water line stays mid-frame with the Chateau above it, like the video's end pose looking up at the rail.
  // wifplay3: az 270 -> 266, pitch 5.5 -> 3.5, fov 21 -> 26 so the Chateau's top stays under the title and place line, right of "Day N",
  // at 360x780, 390x844 and 412x915 from Day 0 to 56 (measured: 9 px or more below the place line at 360 wide)
  river: { pos: [600, 80, -150], az: 266, pitch: 3.5, fov: 26, push: 70, lift: 3, yawLim: 50, pitchLim: [-12, 20], fog: 1 },
  // wifplay3: 9 deg left of the video's pose so the lamp stands right of "Day N" (was over it)
  terrace: { pos: TF.position, az: TF.az - 9, pitch: TF.pitch, fov: TF.fov, yawLim: 80, pitchLim: [-14, 35], fog: Q_FOG_FLOOD },
  levis: { pos: [lv[0], lvY + 60, lv[1]], az: 318, pitch: 2.2, fov: 14, yawLim: 30, pitchLim: [-6, 10], fog: 0.35 },
};
const view = { yaw: 0, pitch: 0, zoom: 1, tyaw: 0, tpitch: 0, tzoom: 1 }, cur = { pos: new THREE.Vector3(), az: 0, pitch: 0, fov: 44, fog: 1 };
function setViewpoint(name, instant, noSave) {
  vpName = name; document.querySelectorAll('.vp [data-v]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === name ? 'true' : 'false'));
  view.tyaw = view.tpitch = 0; view.tzoom = 1; glide = instant ? 1 : 0; from = { pos: cur.pos.clone(), az: cur.az, pitch: cur.pitch, fov: cur.fov, fog: cur.fog };
  if (instant) { const p = poseOf(name); cur.pos.copy(p.pos); cur.az = p.az; cur.pitch = p.pitch; cur.fov = p.fov; cur.fog = p.fog; view.yaw = view.pitch = 0; view.zoom = 1; }
  if (!noSave) save();
}
let glide = 1, from = null;
const aspect = RW / RH, fAdj = 1 - 0.38 * smooth(0.8, 1.6, aspect);
let fogK = 1;
const _p = new THREE.Vector3();
function poseOf(name) {   // target pose of a viewpoint (river can depend on the day: see RIVER_END)
  const v = VP[name]; _p.fromArray(v.pos); if (v.push) _p.addScaledVector(dirOf(v.az, 0), v.push * smooth(0, MAX_DAY, day)); return { pos: _p.clone(), az: v.az, pitch: v.pitch - (v.lift || 0) * smooth(20, MAX_DAY, day), fov: v.fov, fog: v.fog };
}
function applyCamera() {
  const v = VP[vpName], P = poseOf(vpName), k = glide < 1 ? smooth(0, 1, glide) : 1;
  const mix = (a, b) => a + (b - a) * k, azd = ((((P.az - from.az) % 360) + 540) % 360) - 180;
  const pos = k < 1 ? from.pos.clone().lerp(P.pos, k) : P.pos;
  const az = k < 1 ? from.az + azd * k : P.az, pc = k < 1 ? mix(from.pitch, P.pitch) : P.pitch, fov0 = k < 1 ? mix(from.fov, P.fov) : P.fov;
  fogK = k < 1 ? mix(from.fog, P.fog) : P.fog;
  view.yaw += (view.tyaw - view.yaw) * 0.25; view.pitch += (view.tpitch - view.pitch) * 0.25; view.zoom += (view.tzoom - view.zoom) * 0.25;
  // wifplay3: the sky dome (radius 1500 m, centred on the origin) follows the camera; from Levis (1.7 km out) the camera stood outside it and the
  // water's depth pass drew the dome's outer faces in front of the river, so the contact foam covered the whole river (the pale white sheet)
  skyG.position.set(pos.x, 0, pos.z);
  camera.position.copy(pos); const d = dirOf(az + view.yaw, pc + view.pitch); camera.lookAt(pos.x + d.x * 1000, pos.y + d.y * 1000, pos.z + d.z * 1000);
  camera.fov = 2 * Math.atan(Math.tan(fov0 * Math.PI / 360) * fAdj * view.zoom) * 180 / Math.PI; camera.aspect = RW / RH; camera.updateProjectionMatrix();
  cur.pos.copy(pos); cur.az = az; cur.pitch = pc; cur.fov = fov0; cur.fog = fogK;
}
// pointers: one finger/mouse = turn, two fingers = pinch zoom, wheel = zoom
const ptr = new Map(); let pinch0 = 0, zoom0 = 1;
function interacted() { $('hint').style.opacity = '0'; }
sceneEl.addEventListener('pointerdown', (e) => { interacted(); try { sceneEl.setPointerCapture(e.pointerId); } catch (err) { /* wifplay3: hint fades even if capture fails */ } ptr.set(e.pointerId, [e.clientX, e.clientY]); sceneEl.classList.add('drag');
  if (ptr.size === 2) { const [a, b] = [...ptr.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); zoom0 = view.tzoom; } interacted(); });
sceneEl.addEventListener('pointermove', (e) => { const p = ptr.get(e.pointerId); if (!p) return; const dx = e.clientX - p[0], dy = e.clientY - p[1]; p[0] = e.clientX; p[1] = e.clientY;
  const v = VP[vpName];
  if (ptr.size === 2) { const [a, b] = [...ptr.values()]; const dd = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch0 > 0) view.tzoom = Math.max(0.55, Math.min(1.25, zoom0 * pinch0 / dd)); return; }
  const dpp = camera.fov / cssH();   // degrees per CSS pixel (vertical)
  view.tyaw = Math.max(-v.yawLim, Math.min(v.yawLim, view.tyaw - dx * dpp)); view.tpitch = Math.max(v.pitchLim[0], Math.min(v.pitchLim[1], view.tpitch - dy * dpp)); });
const endPtr = (e) => { ptr.delete(e.pointerId); if (!ptr.size) sceneEl.classList.remove('drag'); pinch0 = 0; };
sceneEl.addEventListener('pointerup', endPtr); sceneEl.addEventListener('pointercancel', endPtr);
sceneEl.addEventListener('wheel', (e) => { e.preventDefault(); view.tzoom = Math.max(0.55, Math.min(1.25, view.tzoom * Math.exp(e.deltaY * 0.001))); interacted(); }, { passive: false });
document.querySelectorAll('.vp [data-v]').forEach((b) => { b.onclick = () => setViewpoint(b.dataset.v); });
$('lang').onclick = () => { lang = lang === 'en' ? 'fr' : 'en'; setText(); save(); };

// ---- days: slider + play (the video's pacing: Days 0-5 slow, Lower Town 5-20 in 6 s, fast up the cliff, slow onto the deck) --------------------------
const KEYS = [[0, 0], [2.5, 2], [4.5, 5], [10.5, 20], [13.0, 38], [15.3, 54.5]], T_END = 17.0;
function hermite(t) { const n = KEYS.length; if (t <= 0) return 0; if (t >= KEYS[n - 1][0]) return KEYS[n - 1][1] + (MAX_DAY - KEYS[n - 1][1]) * smooth(KEYS[n - 1][0], T_END, t);
  let i = 0; while (t > KEYS[i + 1][0]) i++; const [t0, y0] = KEYS[i], [t1, y1] = KEYS[i + 1], h = t1 - t0, u = (t - t0) / h;
  const sl = (j) => { const a = KEYS[Math.max(0, j - 1)], b = KEYS[Math.min(n - 1, j + 1)]; return Math.max(0, (b[1] - a[1]) / (b[0] - a[0])); };
  const m0 = Math.min(sl(i), 3 * (y1 - y0) / h), m1 = Math.min(sl(i + 1), 3 * (y1 - y0) / h), u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * y0 + (u3 - 2 * u2 + u) * h * m0 + (-2 * u3 + 3 * u2) * y1 + (u3 - u2) * h * m1; }
const tOfDay = (d) => { let lo = 0, hi = T_END; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (hermite(m) < d) lo = m; else hi = m; } return lo; };
let playT = tOfDay(day);
$('day').value = String(day);
$('day').addEventListener('input', () => { day = Number($('day').value); playT = tOfDay(day); if (playing) setPlaying(false); setText(); save(); });
function setPlaying(p) { playing = p; if (p && day >= MAX_DAY - 1e-3) { day = 0; playT = 0; } setText(); save(); }
$('play').onclick = () => setPlaying(!playing);
function save() { const h = '#d=' + Math.round(day * 10) / 10 + '&v=' + vpName + '&l=' + lang + (playing ? '&p=1' : ''); if (h === location.hash) return; try { history.replaceState(null, '', h); } catch (e) { /* ignore */ } }
// a different window shape needs new render targets: reload with the state kept in the hash
let rsz = 0; addEventListener('resize', () => { clearTimeout(rsz); rsz = setTimeout(() => { if (Math.abs(cssW() / (RW / ratio) - 1) > 0.12 || Math.abs(cssH() / (RH / ratio) - 1) > 0.3) { save(); location.reload(); } }, 500); });

// ---- frame loop -------------------------------------------------------------------------------------------------------------------------
let tPrev = performance.now(), tAcc = 0, frames = 0, nFrame = 0; const minDt = 1000 / PRESET.fps - 2; let lastDraw = 0;
const murk = (d) => smooth(Q_MURK[0], Q_MURK[1], d);
function frame(now) {
  requestAnimationFrame(frame); if (document.hidden) { tPrev = now; return; }
  const dt = Math.min(0.1, (now - tPrev) / 1000); tPrev = now;
  if (playing) { playT += dt; day = Math.min(MAX_DAY, hermite(playT)); $('day').value = String(day); if (day >= MAX_DAY - 1e-3) { playing = false; setText(); save(); } updateHud(); }
  if (glide < 1) glide = Math.min(1, glide + dt / 1.2);
  if (glLost) return;
  if (now - lastDraw < minDt) return; lastDraw = now;
  const level = QM.waterY(day), tt = now / 1000;
  applyCamera(); scene.fog.density = FOG.ext * fogK; camera.updateMatrixWorld(true);
  if (skyG.userData.setTime) skyG.userData.setTime(tt * 0.02);
  wat.setLevel(level); wat.update(tt); wat.uniforms.uMurk.value = murk(day); wat.uniforms.uFogDensity.value = scene.fog.density;
  renderer.shadowMap.needsUpdate = true; wat.prepare(); post.render(nFrame++);
  if (!window.__ready) { window.__ready = true; $('loading').classList.add('done'); }
  if (window.__bench) { frames++; }
}
requestAnimationFrame(frame);
setViewpoint(vpName, true);
window.play = { VP, scene, camera, get day() { return day; }, shot: (v, d) => { day = d; playT = tOfDay(d); $('day').value = String(d); setText(); setViewpoint(v, true, true); return window.play.draw(); }, draw: () => { glide = 1; applyCamera(); scene.fog.density = FOG.ext * fogK; camera.updateMatrixWorld(true); wat.setLevel(QM.waterY(day)); wat.update(performance.now() / 1000); wat.uniforms.uMurk.value = murk(day); wat.uniforms.uFogDensity.value = scene.fog.density; renderer.shadowMap.needsUpdate = true; wat.prepare(); post.render(nFrame++); return day; }, setDay: (d) => { day = d; playT = tOfDay(d); $('day').value = String(d); setText(); }, setViewpoint, view, renderer, info: () => ({ preset: PRESET.name, RW, RH, ratio, calls: renderer.info.render.calls, tris: renderer.info.render.triangles }),
  bench: (n) => new Promise((res) => { const ts = []; let k = 0; const step = () => { const t0 = performance.now(); applyCamera(); const level = QM.waterY(day); wat.setLevel(level); wat.update(k * 0.033); renderer.shadowMap.needsUpdate = true; wat.prepare(); post.render(k); renderer.getContext().readPixels(0, 0, 1, 1, renderer.getContext().RGBA, renderer.getContext().UNSIGNED_BYTE, new Uint8Array(4)); ts.push(performance.now() - t0); if (++k < n) step(); else { ts.sort((a, b) => a - b); res({ median: ts[n >> 1], p90: ts[Math.floor(n * 0.9)], n }); } }; step(); }) };
