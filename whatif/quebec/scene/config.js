// Shared constants + the timeline. Everything in the picture is a pure function of the frame number:
// t = frame / FPS. No clock, no Math.random (a seeded RNG is used at build time).
export const FPS = 30;
export const W = 1080;
export const H = 1920;
export const DURATION = 10.0;          // seconds in the proof clip
export const END_CARD_START = 8.5;     // 1.5 s dark end card
export const SEED = 20261006;

// World (metres, y up). The plaza runs along z; the sea is at -z; the camera looks toward -z.
export const QUAY_Z = -16;             // quay edge (street level 0 here)
export const SLOPE = 0.10;             // street rises toward the camera: ground(z) = SLOPE * (z - QUAY_Z)
export const PLAZA_HALF = 10.0;        // plaza |x| < PLAZA_HALF, buildings beyond
export const PLAZA_NEAR_Z = 40;        // plaza texture/mesh extent toward the camera

export const groundH = (z) => (z >= QUAY_Z ? SLOPE * (z - QUAY_Z) : -8);

// Water: starts 1.0 m below the street at the quay (DAY 1), rises 1 m per "day": +2.5 m at the end (day 4).
export const WATER_START = -1.0;
export const WATER_END = 2.5;
export const WATER_T_END = END_CARD_START;       // linear rise over the whole picture part
export const waterLevel = (t) => WATER_START + (WATER_END - WATER_START) * Math.min(1, t / WATER_T_END);
export const dayAt = (t) => Math.floor(1 + (waterLevel(t) - WATER_START) + 1e-9);

// Camera: fixed high position with a slow push along the view direction.
export const CAM_FOV = 64;
export const CAM_START = [0, 13.5, 27];
export const CAM_TARGET = [0, 0.5, -22];
export const CAM_PUSH_M = 3.2;         // metres travelled along the view direction over DURATION

export const TITLE = 'What if the sea rose one metre a day?';
export const CAPTION = { text: 'By day three, the street is gone.', in: 5.0, out: 7.8 };   // day 3 starts at t = 4.86 s (water at +1 m)
export const END_FACT = 'Sea level today: about 4 mm a year (placeholder fact, verify)';
export const TITLE_FADE = { hold: 3.4, out: 3.9 };

export const clamp01 = (x) => Math.max(0, Math.min(1, x));
export const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;

// Seeded RNG (mulberry32)
export function rng(seed) {
  let a = seed >>> 0;
  const f = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.range = (lo, hi) => lo + (hi - lo) * f();
  f.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  return f;
}

// wifscene7: Quebec timeline (?tl=quebec). 20 s at 30 fps; level L (m above mean river, 1 m per day) from today (0) to Day 56 (56 m, the
// Dufferin Terrace deck is at about 55 m). Keyframes (t s, day): slow start, Days 5-20 (Lower Town goes under) get 6 s, fast through the
// 20-50 m cliff, slow again for the last metre onto the deck (hold at Day 56). Cubic Hermite through the keys (monotone data, clamped).
export const Q_DURATION = 20.0;
// wifscene8: after the Lower Town (Day ~20, t 10.5) the camera pans along the rail and the cliff below it while the water climbs
// fast (20 -> 52.5 m in 4.8 s); hard cut at Q_CUT (water ~3 m below the deck) to the flood pose with the deck ALREADY under water
// (a time jump across the cut, Q_POST: 0.18 -> 0.36 m over the deck), held 4.7 s. The key past Q_CUT only keeps the climb moving at the cut.
// wifscene10: the water reaches the deck lip (54.5) at the cut instead of 52.5, so the climb shot ends with the river at the rail
export const Q_KEYS = [[0, 0], [2.5, 2], [4.5, 5], [10.5, 20], [13.0, 38], [15.3, 54.5], [16.5, 56]];
export const Q_CUT = 15.3, Q_POST = [55.82, 56.0];
const QS = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');
// wifscene8: pan along the rail (az 78 -> 150) with a small tilt down (9 -> 16) while the water climbs: the cliff-slope tree crowns and the
// deck edge along the curving rail go under one after the other (a straight tilt-down only showed the bench and rail: out/scene8/mac/a.png)
// wifscene9: the climb (t Q_CLIMB.t0 -> Q_CUT) is its own shot: a camera hovering over the river, looking back at the cliff under the
// terrace, so the water visibly climbs the cliff face (Lower Town roofs, then the slope, then the terrace wall) toward the railing, kiosks and
// the Chateau at the top. Slow push-in (dz m along the view). Query overrides: qcx qcy qcz qcaz qcp qcf qct (start time, 99 = off).
const qn = (k, d) => (QS.get(k) !== null && QS.get(k) !== '' ? Number(QS.get(k)) : d);
export const Q_CLIMB = { t0: qn('qct', 10.5), x: qn('qcx', 250), y: qn('qcy', 62), z: qn('qcz', -150), az: qn('qcaz', 278), pitch: qn('qcp', 9), fov: qn('qcf', 30), dz: qn('qcd', 20) };
// wifscene10: from t1 to the cut the climb camera moves to an end pose (x2 y2 z2, az2, pitch2 < 0 = looking up, fov2) that frames the
// rail, the kiosk (z -102) and the Chateau on the cliff top as the water reaches the deck, so the cut to the flood pose is the next step.
// Query overrides qcx2 qcy2 qcz2 qcaz2 qcp2 qcf2 qct1. Dissolve from the terrace view into the climb: Q_DISSOLVE s after t0 (qdis, 0 = cut).
export const Q_CLIMB2 = { t1: qn('qct1', 12.6), x: qn('qcx2', 110), y: qn('qcy2', 57), z: qn('qcz2', -140), az: qn('qcaz2', 255), pitch: qn('qcp2', -1.0), fov: qn('qcf2', 20) };   // wifscene11: pitch 0.5 -> -1.0 (frame 458 was half flat water; not re-previewed)
export const Q_DISSOLVE = qn('qdis', 0.6);
// wifscene10: haze factor in the flood pose (Levis ~1 km away was a faint line at 1.0); qfogF overrides
export const Q_FOG_FLOOD = qn('qfogF', 0.2);
// wifscene9: river turns murky green-grey from Day 30 (0) to Day 54 (1), so the cut to the flood has no colour jump
export const Q_MURK = [30, 54];
export const Q_TILT = { t0: 9.8, t1: 14.6, p0: 9, p1: Number(QS.get('qtilt') || 16), a1: Number(QS.get('qpan') || 150) };
export function qDayAt(t) {
  if (t >= Q_CUT) return Q_POST[0] + (Q_POST[1] - Q_POST[0]) * smooth(Q_CUT, Q_DURATION, t);
  const K = Q_KEYS, n = K.length; if (t <= K[0][0]) return K[0][1]; if (t >= K[n - 1][0]) return K[n - 1][1];
  let i = 0; while (t > K[i + 1][0]) i++;
  const sl = (j) => (j <= 0 || j >= n - 1 ? 0 : (K[j + 1][1] - K[j - 1][1]) / (K[j + 1][0] - K[j - 1][0]));
  const [t0, y0] = K[i], [t1, y1] = K[i + 1], h = t1 - t0, u = (t - t0) / h, m0 = Math.min(sl(i), 3 * (y1 - y0) / h), m1 = Math.min(sl(i + 1), 3 * (y1 - y0) / h);
  const y = (2 * u ** 3 - 3 * u ** 2 + 1) * y0 + (u ** 3 - 2 * u ** 2 + u) * h * m0 + (-2 * u ** 3 + 3 * u ** 2) * y1 + (u ** 3 - u ** 2) * h * m1;
  return Math.max(y0, Math.min(y1, y));
}
export const Q_PUSH_FOV = [44, 39];   // slow push on the held terrace camera: fov 44 -> 39 over the dry part
