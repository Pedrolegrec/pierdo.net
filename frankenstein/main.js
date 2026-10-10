// Dance with the creature: a Halloween toy for pierdo.net. Everything runs in this page; nothing is sent anywhere.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { loadDance, lerpJ10 } from './scene/dance.js';
import { createCharacter } from './scene/character.js';
import { buildStage } from './scene/stage.js';
import { LiveRig } from './scene/live.js';
import { Music, BEAT } from './scene/music.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const sstep = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const scene3 = $('scene'), canvas = $('gl'), video = $('cam');
const say = (m) => { $('status').textContent = m; };

// ---- renderer, camera, stage, creature ----
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 80);
const small = Math.min(innerWidth, innerHeight) < 700 || matchMedia('(pointer: coarse)').matches;
const stage = buildStage(scene, small ? 1024 : 2048);
const monster = createCharacter();
monster.root.traverse((o) => { if (o.isMesh && o.material.side !== THREE.BackSide) o.castShadow = true; });
scene.add(monster.root);

// ---- quality tiers: start high, step down once if the frame time says the device cannot hold ~30 fps ----
const TIERS = [{ pr: 0.7, bloom: false, shadow: false }, { pr: 1, bloom: false, shadow: true }, { pr: Math.min(devicePixelRatio || 1, small ? 1.5 : 2), bloom: true, shadow: true }];
let tier = params.has('q') ? Math.min(2, Math.max(0, +params.get('q'))) : 2, composer = null, bloom = null, W = 1, H = 1;
function applyTier() {
  const T = TIERS[tier]; renderer.setPixelRatio(T.pr); renderer.setSize(W, H, false); stage.key.castShadow = T.shadow;
  if (T.bloom) {
    if (!composer) {
      const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
      composer = new EffectComposer(renderer, rt); composer.addPass(new RenderPass(scene, camera));
      bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.45, 0.6, 1.2); composer.addPass(bloom); composer.addPass(new OutputPass());
    }
    composer.setPixelRatio(T.pr); composer.setSize(W, H);
  }
}
function resize() {
  W = Math.max(2, scene3.clientWidth); H = Math.max(2, scene3.clientHeight); camera.aspect = W / H; camera.updateProjectionMatrix(); applyTier();
}
new ResizeObserver(resize).observe(scene3);

// ---- camera: drag to turn, wheel / pinch to come closer, double tap to reset ----
const view = { az: 0, el: 0.06, zoom: 1, lastDrag: -99 };
const pts = new Map(); let pinch0 = 0;
scene3.addEventListener('pointerdown', (e) => { scene3.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); scene3.classList.add('drag'); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
scene3.addEventListener('pointermove', (e) => {
  const p = pts.get(e.pointerId); if (!p) return;
  if (pts.size === 2) { pts.set(e.pointerId, [e.clientX, e.clientY]); const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch0) view.zoom = Math.min(1.4, Math.max(0.6, view.zoom * (pinch0 / d))); pinch0 = d; return; }
  view.az = Math.max(-1.45, Math.min(1.45, view.az - (e.clientX - p[0]) * 0.006)); view.el = Math.max(-0.05, Math.min(0.55, view.el + (e.clientY - p[1]) * 0.003)); p[0] = e.clientX; p[1] = e.clientY; view.lastDrag = performance.now(); $('hint').style.opacity = 0;
});
const up = (e) => { pts.delete(e.pointerId); if (!pts.size) scene3.classList.remove('drag'); pinch0 = 0; };
scene3.addEventListener('pointerup', up); scene3.addEventListener('pointercancel', up);
scene3.addEventListener('dblclick', () => resetView());
scene3.addEventListener('wheel', (e) => { e.preventDefault(); view.zoom = Math.min(1.4, Math.max(0.6, view.zoom * (1 + Math.sign(e.deltaY) * 0.08))); }, { passive: false });
scene3.addEventListener('keydown', (e) => { const k = { ArrowLeft: [-0.12, 0], ArrowRight: [0.12, 0], ArrowUp: [0, -0.05], ArrowDown: [0, 0.05] }[e.key]; if (k) { e.preventDefault(); view.az = Math.max(-1.45, Math.min(1.45, view.az + k[0])); view.el = Math.max(-0.05, Math.min(0.55, view.el + k[1])); view.lastDrag = performance.now(); } });
function resetView() { view.az = 0; view.el = 0.06; view.zoom = 1; }
function placeCamera(t) {
  const asp = camera.aspect, D = (asp < 0.9 ? 9.0 : 9.0 - 2.2 * Math.min(1, (asp - 0.9) / 0.8)) * view.zoom;
  const idle = performance.now() - view.lastDrag > 4000 ? 1 : 0, az = view.az + idle * 0.05 * Math.sin(t * 0.5), el = view.el + idle * 0.01 * Math.sin(t * 0.37);
  const tx = 0.1, ty = 1.15;
  camera.position.set(tx + D * Math.sin(az) * Math.cos(el), ty + D * Math.sin(el) + 0.15, D * Math.cos(az) * Math.cos(el)); camera.up.set(0, 1, 0); camera.lookAt(tx, ty, 0);
}

// ---- the dance (the trend dance's motion, tracked from a reference clip), looped on the 132.5 BPM beat grid ----
const BEAT0 = 0.221, LD = 48 * BEAT, TS = BEAT0, TE = BEAT0 + LD, BL = 0.45;
let dance = null;
function frameJ(td) { const f = Math.min(dance.N - 1.001, Math.max(0, td * 30)), a = Math.floor(f), fr = f - a; return fr < 0.02 ? dance.J[a] : lerpJ10(dance.J[a], dance.J[a + 1], fr); }
function danceAt(tl) {
  const td = TS + (((tl % LD) + LD) % LD); let J = frameJ(td);
  if (td > TE - BL) J = lerpJ10(J, frameJ(TS), sstep((td - (TE - BL)) / BL));
  return J;
}

// ---- state, music, camera mode ----
const state = { mode: 'watch', moon: true, pumpkins: true, picture: true };
const music = new Music(); const rig = new LiveRig({ mirror: params.get('mirror') !== '0' });
let freeT0 = performance.now() / 1000, fade = null, stream = null, landmarker = null, lastVT = -1, lastDet = 0, lastTs = 0, detMs = 0, pending;
const log = []; window.__log = log;
function crossfade(from, dur = 0.35) { if (from) fade = { from, t0: performance.now() / 1000, dur }; }
let curJ = null;

const toggle = (btn, on) => { btn.setAttribute('aria-pressed', on ? 'true' : 'false'); };
$('btnMoon').addEventListener('click', () => { state.moon = !state.moon; stage.setMoon(state.moon); toggle($('btnMoon'), state.moon); });
$('btnPumpkin').addEventListener('click', () => { state.pumpkins = !state.pumpkins; stage.setPumpkins(state.pumpkins); toggle($('btnPumpkin'), state.pumpkins); });
$('btnReset').addEventListener('click', resetView);
$('btnMusic').addEventListener('click', () => {
  crossfade(curJ, 0.3);
  if (music.on) { music.stop(); freeT0 = performance.now() / 1000; $('btnMusic').textContent = 'Music: off'; toggle($('btnMusic'), false); }
  else { music.start(); $('btnMusic').textContent = 'Music: on'; toggle($('btnMusic'), true); }
});
$('btnPip').addEventListener('click', () => { state.picture = !state.picture; $('pip').hidden = !state.picture || state.mode !== 'live'; $('btnPip').textContent = state.picture ? 'Hide camera picture' : 'Show camera picture'; toggle($('btnPip'), state.picture); });

async function createLandmarker() {
  const { FilesetResolver, PoseLandmarker } = await import('./vendor/mediapipe/vision_bundle.mjs');
  const fileset = await FilesetResolver.forVisionTasks(new URL('./vendor/mediapipe/wasm', location.href).href);
  const opts = (delegate) => ({ baseOptions: { modelAssetPath: new URL('./vendor/mediapipe/models/pose_landmarker_lite.task', location.href).href, delegate }, runningMode: 'VIDEO', numPoses: 1, minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5 });
  if (params.get('delegate') === 'cpu') return PoseLandmarker.createFromOptions(fileset, opts('CPU'));
  try { return await PoseLandmarker.createFromOptions(fileset, opts('GPU')); } catch (e) { return PoseLandmarker.createFromOptions(fileset, opts('CPU')); }
}
function stopLive(msg) {
  if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
  video.srcObject = null; crossfade(curJ); state.mode = 'watch'; $('pip').hidden = true; $('btnPip').hidden = true;
  $('btnLive').textContent = 'Dance with him'; $('btnLive').setAttribute('aria-pressed', 'false'); say(msg || 'He is dancing his dance. Tap Dance with him and he will try to copy you.');
}
async function startLive() {
  if (state.mode === 'live' || $('btnLive').disabled) { stopLive(); return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { say('This browser cannot open the camera on this page. You can still watch him dance.'); return; }
  $('btnLive').disabled = true; say('Asking for your camera…');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
  } catch (e) {
    $('btnLive').disabled = false; const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError' || e.name === 'PermissionDeniedError');
    say(denied ? 'The camera is blocked, so he keeps dancing on his own. To dance with him, allow the camera for this site in your browser, then tap the button again.' : (e && e.name === 'NotFoundError' ? 'No camera found, so he keeps dancing on his own.' : 'The camera could not start, so he keeps dancing on his own.'));
    return;
  }
  try {
    video.srcObject = stream; await video.play(); say('Loading the body tracker (6 MB, once)…');
    if (!landmarker) landmarker = await createLandmarker();
  } catch (e) {
    console.warn('live mode failed', e); stopLive('The body tracker could not start in this browser, so he keeps dancing on his own.'); $('btnLive').disabled = false; return;
  }
  $('btnLive').disabled = false; crossfade(curJ); state.mode = 'live'; lastVT = -1;
  $('btnLive').textContent = 'Stop camera'; $('btnLive').setAttribute('aria-pressed', 'true'); $('btnPip').hidden = false; $('pip').hidden = !state.picture;
  say('Step back until he can see you, and move. He tries to copy you, like a mirror.');
}
$('btnLive').addEventListener('click', startLive);

// ---- frame loop ----
const stamps = []; let simAcc = 0, prevSim = null, last = performance.now() / 1000, frames = 0, govT = 0, govN = 0, govSum = 0, started = false;
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now() / 1000, dt = Math.min(0.1, now - last); last = now; stamps.push(now); while (stamps.length > 90) stamps.shift();
  let J, tl;
  if (state.mode === 'live' && landmarker && video.readyState >= 2 && video.currentTime !== lastVT && (now - lastDet) > 1 / 30) {
    lastVT = video.currentTime; lastDet = now; const ts = Math.max(lastTs + 1, Math.round(performance.now())); lastTs = ts;
    const t0 = performance.now(); let r = null; try { r = landmarker.detectForVideo(video, ts); } catch (e) { console.warn(e); }
    detMs += (performance.now() - t0 - detMs) * 0.1; pending = r || null;
  } else pending = undefined;
  const mc = music.clock();
  tl = mc !== null ? mc : now - freeT0;
  if (state.mode === 'live') {
    J = rig.update(pending, now);
    if (pending !== undefined && params.has('log')) { const nv = (a, b) => b.clone().sub(a).normalize().toArray().map((v) => +v.toFixed(4)); log.push({ t: performance.now(), seen: !!(pending && pending.worldLandmarks && pending.worldLandmarks.length), lUA: nv(J.lSho, J.lElb), lFA: nv(J.lElb, J.lWri), rUA: nv(J.rSho, J.rElb), rFA: nv(J.rElb, J.rWri) }); }
  } else J = danceAt(tl);
  if (fade) { const a = (now - fade.t0) / fade.dur; if (a >= 1) fade = null; else J = lerpJ10(fade.from, J, sstep(a)); }
  curJ = J;
  if (!started) { monster.live.begin(J); prevSim = J; started = true; }
  simAcc = Math.min(simAcc + dt, 0.1); const sim = simAcc >= 1 / 30; if (sim) simAcc -= 1 / 30;
  monster.live.frame(J, prevSim, sim); if (sim) prevSim = J;
  const ph = ((tl / BEAT) % 1 + 1) % 1;
  stage.update(now, ph, J, monster.scale); placeCamera(now);
  if (TIERS[tier].bloom && composer) composer.render(); else renderer.render(scene, camera);
  // quality governor: after a 1.5 s warm-up, if the last 60 frames averaged slower than ~30 fps, drop one tier (never back up)
  frames++; if (frames > 90) { govN++; govSum += dt; if (govN >= 60) { if (govSum / govN > 0.036 && tier > 0 && !params.has('q')) { tier--; applyTier(); } govN = 0; govSum = 0; } }
  if (frames === 3) { $('loading').classList.add('done'); document.body.dataset.ready = '1'; }
}
window.__toy = {
  fps() { if (stamps.length < 10) return 0; return (stamps.length - 1) / (stamps[stamps.length - 1] - stamps[0]); },
  tier() { return tier; }, setTier(n) { tier = n; applyTier(); }, mode() { return state.mode; }, detMs() { return detMs; }, info() { return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }; },
  gl() { const gl = renderer.getContext(); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); },
  loadMs: 0,
};
(async () => {
  const t0 = performance.now();
  try {
    if (!renderer.getContext()) throw new Error('no webgl');
    dance = await loadDance('./scene/pose-v10.json'); window.__toy.loadMs = Math.round(performance.now() - t0);
  } catch (e) { console.warn(e); $('nogl').style.display = 'flex'; $('loading').classList.add('done'); $('btnLive').disabled = true; $('btnMusic').disabled = true; return; }
  resize(); say('He is dancing his dance. Tap Dance with him and he will try to copy you.'); requestAnimationFrame(frame);
})();
