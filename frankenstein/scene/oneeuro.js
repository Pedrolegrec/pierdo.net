// One Euro filter (Casiez, Roussel, Vogel 2012): a low-pass whose cutoff rises with speed, so slow moves are smooth and fast moves keep up.
const alpha = (cutoff, dt) => { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); };
export class OneEuro {
  constructor(minCutoff = 1.4, beta = 8, dCutoff = 1.0) { this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = dCutoff; this.x = null; this.dx = 0; this.t = 0; }
  reset() { this.x = null; }
  filter(v, t) {
    if (this.x === null) { this.x = v; this.dx = 0; this.t = t; return v; }
    const dt = Math.max(1e-3, t - this.t); this.t = t;
    const d = (v - this.x) / dt; this.dx += alpha(this.dCutoff, dt) * (d - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += alpha(cutoff, dt) * (v - this.x);
    return this.x;
  }
}
