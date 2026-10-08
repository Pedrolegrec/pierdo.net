// Determinism guard, imported FIRST by main.js: no Math.random in the picture. Some three.js addons (GTAOPass noise via
// SimplexNoise, kernels) call Math.random at set-up; this seeded replacement is installed before any of them runs.
let s = 123456789;
Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
