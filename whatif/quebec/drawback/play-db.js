// Playable "the sea pulls back" scenario (what-if video 2) on the shared /whatif/quebec/ page. Loaded by ../boot.js when ?s=drawback.
// Reuses the rise scenario's three.js, fonts, city (../world, ../scene) and the video engine's drawback modules in this folder (drawback.js, water.js,
// world-q.js, world-quebec.js; copied unchanged from the approved video 2 engine except import paths). The story is a pure function of the time t (s),
// so the slider scrubs it and Play runs it at the video's speed. Only the camera (drag to look around, pinch/scroll to zoom) is added.
import '../scene/seed.js';
import * as THREE from 'three';
import { installHeightFog, upgradeMaterials, makeEnvironment, makePost, FOG } from '../scene/post.js';
import { smooth } from '../scene/config.js';
import { makeSky, SUN_DIR, FOG_COLOR } from '../scene/sky.js';
import { createWater, applyWetness } from './water.js';
import * as DBM from './drawback.js';
import { loadQuebec } from './world-q.js';

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search), hs = new URLSearchParams(location.hash.slice(1));
const T_END = 69;   // the video's end card starts at 69 s; the water has settled to 0.0 m
// captions: the video's own (config.js DB_CAPTIONS, wifdtext1), [from s, to s, FR, EN]; the last one stays up to 7 s from its start
const CAPS = [[4.0, 7.0, 'Le fleuve baisse. Doucement.', 'The river is going down. Slowly.'], [17.6, 20.4, 'Huit mètres plus bas.', 'Eight metres lower.'], [21.0, 24.0, 'Le lit du fleuve apparaît.', 'The riverbed appears.'],
  [25.5, 28.5, 'Le mur du quai, à nu.', 'The quay wall, laid bare.'], [35.0, 38.0, 'Le silence.', 'Silence.'], [43.8, 46.8, 'Trente mètres sous le niveau normal.', 'Thirty metres under normal.'],
  [47.4, 50.6, "Une ligne à l'horizon.", 'A line on the horizon.'], [55.0, 58.0, 'Elle revient.', 'It comes back.']];
const CHS = 'This product was made by PierDo and contains intellectual property of the Canadian Hydrographic Service (CHS) of the Department of Fisheries and Oceans. This product does not meet the requirements of the Navigation Safety Regulations, 2020 under the Canada Shipping Act, 2001. Charts and publications issued by or on the authority of CHS must be used to meet the requirements of those regulations. The copyright in the data are and remain the property of His Majesty the King in Right of Canada and shall not be sold, licensed, leased, assigned or given to a third party. The incorporation of CHS data in this product does not constitute an endorsement or an approval of this product by the Canadian Hydrographic Service, the Department of Fisheries and Oceans or His Majesty the King in Right of Canada.';
const TX = {
  en: { doc: 'What if the sea pulled back? Québec Old Port', title: 'What if the sea pulled back?', place: 'Québec City · Old Port', play: 'Play', pause: 'Pause', replay: 'Replay', sim: 'simulation', time: 'Time',
    hint: 'Drag to look around. Pinch or scroll to zoom. Press Play or drag the time.', next: 'Which city next?', more: 'More from PierDo', loading: 'Loading the map…', cap: 'Caption',
    nogl: 'This page needs WebGL to show the 3D scene. Try another browser or device.',
    note: 'A simulation, not a forecast: an imaginary scenario, far beyond any documented drawback. We found no record of a tsunami at Québec City. The riverbed comes from Canadian Hydrographic Service bathymetry; the quay walls, boats and ferry are modelled by hand and the waves are an animation. At Québec City the river already rises and falls about 4.3 m, twice a day (Canadian Hydrographic Service).',
    credits: ['Contains information licensed under the Open Government Licence – Canada (Natural Resources Canada; Fisheries and Oceans Canada, Canadian Hydrographic Service, NONNA-10)', '© OpenStreetMap contributors (ODbL)', 'three.js (MIT)', 'Cormorant Garamond (SIL Open Font License 1.1)', CHS] },
  fr: { doc: 'Et si la mer se retirait ? Vieux-Port de Québec', title: 'Et si la mer se retirait ?', place: 'Ville de Québec · Vieux-Port', play: 'Lecture', pause: 'Pause', replay: 'Rejouer', sim: 'simulation', time: 'Temps',
    hint: 'Glissez pour regarder autour. Pincez ou faites défiler pour zoomer. Lancez la lecture ou glissez le temps.', next: 'Quelle ville ensuite ?', more: 'Plus de PierDo', loading: 'Chargement de la carte…', cap: 'Légende',
    nogl: 'Cette page a besoin de WebGL pour afficher la scène 3D. Essayez un autre navigateur ou appareil.',
    note: 'Une simulation, pas une prévision : un scénario imaginaire, bien au-delà de tout retrait documenté. Nous n’avons trouvé aucune trace de tsunami à Québec. Le lit du fleuve vient des données bathymétriques du Service hydrographique du Canada ; les murs de quai, les bateaux et le traversier sont modélisés à la main et les vagues sont une animation. À Québec, le fleuve monte et descend déjà d’environ 4,3 m, deux fois par jour (Service hydrographique du Canada).',
    credits: ['Contient des informations autorisées sous la Licence du gouvernement ouvert – Canada (Ressources naturelles Canada ; Pêches et Océans Canada, Service hydrographique du Canada, NONNA-10)', '© les contributeurs d’OpenStreetMap (ODbL)', 'three.js (MIT)', 'Cormorant Garamond (licence SIL Open Font 1.1)', CHS + ' (notice required by the CHS licence)'] },
};
let lang = hs.get('l') || qs.get('l') || ((navigator.language || 'en').toLowerCase().startsWith('fr') ? 'fr' : 'en'); if (!TX[lang]) lang = 'en';
let t = Math.max(0, Math.min(T_END, Number(hs.get('t') || qs.get('t') || 0)));
let playing = hs.get('p') === '1';

// ---- text and HUD -------------------------------------------------------------------------------------------------------------------
const MINUS = '−';
function clock(tt) { const s = Math.round(tt < 2 ? tt : tt <= 46 ? 2 + 20 * (tt - 2) : 882 + (tt - 46)); return 'T+' + String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }   // the video's clock: x20 from 2 to 46 s
let lastCap = '', lastNum = '';
function updateHud(force) {
  const s = TX[lang], L = DBM.dbLevel(t), r = Math.round(L * 10) / 10;
  $('counter').firstChild.textContent = (r > 0 ? '+' : r < 0 ? MINUS : '') + Math.abs(r).toFixed(1) + ' m';
  const num = clock(t) + (t >= 2 && t < 46 ? ' ×20' : '') + ' · ' + s.sim;
  if (force || num !== lastNum) { lastNum = num; $('counter').lastChild.textContent = num; }
  let cap = ''; for (const c of CAPS) if (t >= c[0] && t < Math.max(c[1], c[0] + 7) && !CAPS.some((d) => d !== c && d[0] > c[0] && d[0] <= t)) cap = c[lang === 'fr' ? 2 : 3];
  if (force || cap !== lastCap) { lastCap = cap; $('under').lastChild.textContent = cap; $('under').firstChild.textContent = cap ? s.cap : ''; }
}
function setText() {
  const s = TX[lang]; document.documentElement.lang = lang; document.title = s.doc;
  $('title').textContent = s.title; $('place').textContent = s.place; $('hint').textContent = s.hint; $('next').textContent = s.next; $('more').textContent = s.more; $('loadmsg').textContent = s.loading; $('nogl').firstChild.textContent = s.nogl;
  $('lang').textContent = lang === 'en' ? 'FR' : 'EN'; $('credits').innerHTML = s.credits.map((c, i) => `<li${i === 4 ? ' class="chs"' : ''}>${c}</li>`).join(''); $('note').textContent = s.note; $('note').hidden = false;
  $('play').textContent = playing ? s.pause : (t >= T_END ? s.replay : s.play); $('day').setAttribute('aria-label', s.time); updateHud(true);
}
{ const vp = document.querySelector('.vp'); vp.hidden = true; vp.style.display = 'none'; }   // the rise scenario's viewpoint buttons do not apply here: one camera (the video's), plus looking around (.vp has display:flex, which beats [hidden])
const range = $('day'); range.min = '0'; range.max = String(T_END); range.value = String(t);

// ---- quality preset (same as the rise scenario) ------------------------------------------------------------------------------------
const sceneEl = $('scene'), canvas = $('gl'), cssW = () => sceneEl.clientWidth, cssH = () => sceneEl.clientHeight;
const PHONE0 = qs.get('q') ? qs.get('q') === 'phone' : (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 900) || cssW() < 600;
// Adaptive quality: on a laptop iGPU (AMD 780M, 1806x869) the desktop preset costs ~35 ms a frame, so Play ran at 20 fps. If a run of live frames is slow, the page
// reloads once at the next lighter preset (the hash keeps t, language and play state) and remembers it for the session. A fast machine stays on tier 0 (the video look).
// ?q=desktop|lite|phone forces one preset and turns this off.
const TIER_KEY = 'wif-db-tier'; let tierStore = null; try { sessionStorage.setItem(TIER_KEY + '-t', '1'); tierStore = sessionStorage; } catch (e) { /* no storage: no adaptation, so no reload loop */ }
const TIER = PHONE0 ? 2 : qs.get('q') === 'lite' ? 1 : qs.get('q') ? 0 : Math.min(2, Number(tierStore && tierStore.getItem(TIER_KEY)) || 0);
const ADAPT = !qs.get('q') && !PHONE0 && !!tierStore && TIER < 2 && qs.get('adapt') !== '0';
const PHONE = TIER === 2;
const DPR = Number(qs.get('dpr') || devicePixelRatio || 1);
const PRESETS = [
  { name: 'desktop', ratio: Math.min(DPR, 2), maxPix: 2.6e6, fps: 60, shadow: 4096, refl: 0.5, dscale: 0.5, ao: true, bloom: 0.28, msaa: 4, lmq: 'high' },
  { name: 'lite', ratio: Math.min(DPR, 1.25), maxPix: 1.0e6, fps: 60, shadow: 2048, refl: 0.4, dscale: 0.4, ao: true, bloom: 0.28, msaa: 2, lmq: 'high' },
  { name: 'phone', ratio: Math.min(DPR, 1.5) * 0.8, maxPix: 0.75e6, fps: 30, shadow: 2048, refl: 0.35, dscale: 0.35, ao: false, bloom: 0, msaa: 2, lmq: 'low' }
];
const PRESET = PRESETS[TIER];
let ratio = PRESET.ratio; if (cssW() * cssH() * ratio * ratio > PRESET.maxPix) ratio = Math.sqrt(PRESET.maxPix / (cssW() * cssH()));
const RW = Math.round(cssW() * ratio), RH = Math.round(cssH() * ratio);

let renderer = null;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }); } catch (e) { renderer = null; }
const lockUi = () => { $('loading').style.display = 'none'; $('hint').style.display = 'none'; $('nogl').style.display = 'flex'; document.querySelectorAll('#panel button, #panel input').forEach((b) => { b.disabled = true; }); };
if (!renderer) { setText(); lockUi(); $('lang').onclick = () => { lang = lang === 'en' ? 'fr' : 'en'; setText(); }; await new Promise(() => {}); }
renderer.setPixelRatio(1); renderer.setSize(RW, RH, false);
let glLost = false;
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); glLost = true; playing = false; lockUi(); });
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.autoUpdate = false;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.92;
installHeightFog(); FOG.ext = 0.0003; FOG.k = 0.009;
setText();

// ---- scene: the video's (engine main.js, tl=drawback) -------------------------------------------------------------------------------
const scene = new THREE.Scene(); scene.background = FOG_COLOR.clone(); scene.fog = new THREE.FogExp2(FOG_COLOR, FOG.ext);
const camera = new THREE.PerspectiveCamera(74, RW / RH, 0.5, 9000); scene.add(camera);
const skyG = makeSky(); scene.add(skyG);
scene.add(new THREE.HemisphereLight(0xcfe3f7, 0x8a7f6c, 0.12));
const sun = new THREE.DirectionalLight(0xfff0d2, 4.2); sun.target.position.set(150, 0, -30); sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 600); scene.add(sun, sun.target);
sun.castShadow = true; sun.shadow.mapSize.set(PRESET.shadow, PRESET.shadow);
Object.assign(sun.shadow.camera, { left: -280, right: 280, top: 280, bottom: -280, near: 1, far: 1400 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.06; sun.shadow.radius = 3; sun.shadow.blurSamples = 16; sun.shadow.camera.updateProjectionMatrix();
const Q = await loadQuebec(scene, { bedBase: './drawback/bed/', carveOpts: { slope: 0.2, cap: 150 }, quality: PRESET.lmq, carve: true });
const DB = DBM.buildDrawback(scene, Q.world);
const wat = createWater(scene, THREE, { renderer, camera, size: [RW, RH], reflScale: PRESET.refl, depthScale: PRESET.dscale, groundHeightAt: Q.world.groundHeightAt });
wat.mesh.scale.set(14000 / 3000, 1, 14000 / 3000);
wat.uniforms.uWetTop = DBM.DB_U.uWetTop;
upgradeMaterials(scene); applyWetness(scene, wat.uniforms); DB.patchBed();
{ const env = makeEnvironment(renderer, () => makeSky(), 1); scene.environment = env.texture; scene.environmentIntensity = 0.42; }
const post = makePost(renderer, scene, camera, RW, RH, { ao: PRESET.ao, aoFade: null, aoIntensity: 1.2, aoRadius: 4, bloom: PRESET.bloom, bloomThreshold: 0.85, grain: 0.010, vig: 0.20, samples: PRESET.msaa });

// ---- camera: the video's path (drawback.js dbCamera) plus look-around ------------------------------------------------------------------
const aspect = RW / RH, fAdj = 1 - 0.38 * smooth(0.8, 1.6, aspect), UP = new THREE.Vector3(0, 1, 0), qa = new THREE.Quaternion(), RAD = Math.PI / 180;
const view = { yaw: 0, pitch: 0, zoom: 1, tyaw: 0, tpitch: 0, tzoom: 1 };
function applyCamera() {
  DBM.dbCamera(camera, t, Q.world.groundHeightAt); const fov0 = camera.fov;
  view.yaw += (view.tyaw - view.yaw) * 0.25; view.pitch += (view.tpitch - view.pitch) * 0.25; view.zoom += (view.tzoom - view.zoom) * 0.25;
  if (Math.abs(view.yaw) > 1e-3 || Math.abs(view.pitch) > 1e-3) { camera.quaternion.premultiply(qa.setFromAxisAngle(UP, -view.yaw * RAD)); camera.rotateX(view.pitch * RAD); }
  camera.fov = 2 * Math.atan(Math.tan(fov0 * Math.PI / 360) * fAdj * view.zoom) * 180 / Math.PI; camera.aspect = RW / RH; camera.updateProjectionMatrix();
  skyG.position.set(camera.position.x, 0, camera.position.z);
}
const ptr = new Map(); let pinch0 = 0, zoom0 = 1;
const interacted = () => { $('hint').style.opacity = '0'; };
sceneEl.addEventListener('pointerdown', (e) => { if (e.target.closest && e.target.closest('button')) return;   // the language button sits inside #scene: capturing its pointer would swallow its click
  interacted(); try { sceneEl.setPointerCapture(e.pointerId); } catch (err) { /* hint fades even if capture fails */ } ptr.set(e.pointerId, [e.clientX, e.clientY]); sceneEl.classList.add('drag');
  if (ptr.size === 2) { const [a, b] = [...ptr.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); zoom0 = view.tzoom; } });
sceneEl.addEventListener('pointermove', (e) => { const p = ptr.get(e.pointerId); if (!p) return; const dx = e.clientX - p[0], dy = e.clientY - p[1]; p[0] = e.clientX; p[1] = e.clientY;
  if (ptr.size === 2) { const [a, b] = [...ptr.values()]; const dd = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch0 > 0) view.tzoom = Math.max(0.5, Math.min(1.25, zoom0 * pinch0 / dd)); return; }
  const dpp = camera.fov / cssH();   // degrees per CSS pixel (vertical)
  view.tyaw = Math.max(-100, Math.min(100, view.tyaw - dx * dpp)); view.tpitch = Math.max(-35, Math.min(40, view.tpitch + dy * dpp)); });
const endPtr = (e) => { ptr.delete(e.pointerId); if (!ptr.size) sceneEl.classList.remove('drag'); pinch0 = 0; };
sceneEl.addEventListener('pointerup', endPtr); sceneEl.addEventListener('pointercancel', endPtr);
sceneEl.addEventListener('wheel', (e) => { e.preventDefault(); view.tzoom = Math.max(0.5, Math.min(1.25, view.tzoom * Math.exp(e.deltaY * 0.001))); interacted(); }, { passive: false });
$('lang').onclick = () => { lang = lang === 'en' ? 'fr' : 'en'; setText(); save(); };

// ---- time: slider + play (1x = the video) --------------------------------------------------------------------------------------------
let dirty = true, idle = 0;
range.addEventListener('input', () => { t = Number(range.value); dirty = true; if (playing) setPlaying(false); setText(); save(); });
function setPlaying(p) { playing = p; if (p && t >= T_END - 1e-3) { t = 0; range.value = '0'; dirty = true; } setText(); save(); }
$('play').onclick = () => setPlaying(!playing);
function save() { const h = '#t=' + Math.round(t * 10) / 10 + '&l=' + lang + (playing ? '&p=1' : ''); if (h === location.hash) return; try { history.replaceState(null, '', h); } catch (e) { /* ignore */ } }
let rsz = 0; addEventListener('resize', () => { clearTimeout(rsz); rsz = setTimeout(() => { if (Math.abs(cssW() / (RW / ratio) - 1) > 0.12 || Math.abs(cssH() / (RH / ratio) - 1) > 0.3) { save(); location.reload(); } }, 500); });

// ---- frame loop ---------------------------------------------------------------------------------------------------------------------------
let tPrev = performance.now(), nFrame = 0, lastDraw = 0, lastT = -1; const minDt = 1000 / PRESET.fps - 2;
function draw(now) {
  applyCamera(); DB.update(t); const level = DBM.dbWaterY(t);
  if (skyG.userData.setTime) skyG.userData.setTime(t);
  wat.setLevel(level); if (wat.uniforms.uFOn) DBM.dbWaterUniforms(wat.uniforms, t); wat.update(t + idle);
  if (wat.uniforms.uMurk) wat.uniforms.uMurk.value = 0; if (wat.uniforms.uRip) wat.uniforms.uRip.value = 0; if (wat.uniforms.uFogDensity) wat.uniforms.uFogDensity.value = scene.fog.density;
  camera.updateMatrixWorld(true);
  if (t !== lastT) { renderer.shadowMap.needsUpdate = true; lastT = t; }
  wat.prepare(); post.render(nFrame++);
  if (!window.__ready) { window.__ready = true; $('loading').classList.add('done'); }
}
let adaptN = 0; const adaptGaps = [];
function adapt(gap) {   // gap = ms since the previous visible frame; reload one tier lighter if the median of 40 frames is over 40 ms (under 25 fps)
  if (!ADAPT) return; gap = Math.min(gap, 200);   // a stall counts as 200 ms; a hidden tab never gets here (frame() returns first)
  if (++adaptN <= 30) return;   // skip the first frames (shader compile, bed upload)
  adaptGaps.push(gap); if (adaptGaps.length < 40) return;
  adaptGaps.sort((x, y) => x - y); const med = adaptGaps[20]; adaptGaps.length = 0;
  if (med > 40) { try { tierStore.setItem(TIER_KEY, String(TIER + 1)); } catch (err) { return; } save(); location.reload(); }
}
function frame(now) {
  requestAnimationFrame(frame); if (document.hidden) { tPrev = now; return; }
  adapt(now - tPrev);
  const dt = Math.min(0.1, (now - tPrev) / 1000); tPrev = now;
  if (playing) { t = Math.min(T_END, t + dt); range.value = String(t); dirty = true; if (t >= T_END - 1e-3) { playing = false; setText(); save(); } } else idle += dt;
  if (glLost) return; if (now - lastDraw < minDt) return; lastDraw = now;
  if (dirty) { updateHud(); dirty = false; }
  draw(now);
}
requestAnimationFrame(frame);
window.play = { scene, camera, wat, get t() { return t; }, shot: (tt) => { t = tt; range.value = String(tt); setText(); applyCamera(); view.yaw = view.pitch = 0; draw(performance.now()); return t; },
  bench: (n) => new Promise((res) => { const ts = []; let k = 0; const gl = renderer.getContext(), px = new Uint8Array(4); const step = () => { const t0 = performance.now(); lastT = -1; /* re-render the shadow map every frame, as live Play does (t changes each frame) and as the rise bench does */ draw(t0); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ts.push(performance.now() - t0);
    if (++k < n) step(); else { ts.sort((a, b) => a - b); res({ n, median: ts[n >> 1], p90: ts[Math.floor(n * 0.9)], mean: ts.reduce((a, b) => a + b, 0) / n, w: RW, h: RH, preset: PRESET.name }); } }; step(); }) };
