import { morseMix, pairKey } from '../utils/mixingRules.js';

// Morse pair potential: softer repulsion than LJ, asymmetric well
// V(r) = De[(1 - e^{-a(r-re)})² - 1],  F = -dV/dr projected along pair vector
export class MorseForce {
    constructor({ species = {}, cutoffMult = 4.0, overrides = {} } = {}) {
        const names = Object.keys(species);
        const n     = names.length;

        this._si = Object.fromEntries(names.map((s, i) => [s, i]));
        this._n  = n;

        this._fp = new Array(n * n).fill(null);
        for (let i = 0; i < n; i++) {
            for (let j = i; j < n; j++) {
                const key = pairKey(names[i], names[j]);
                const raw = key in overrides ? overrides[key] : morseMix(species[names[i]], species[names[j]]);
                const rc  = raw.re * cutoffMult;
                const entry = {
                    De:  raw.De,
                    re:  raw.re,
                    a:   raw.a,
                    rc2: rc * rc,
                    a2De: 2 * raw.a * raw.De,
                };
                this._fp[i * n + j] = entry;
                this._fp[j * n + i] = entry;
            }
        }

        this._typeOf = null;
    }

    apply(particles) {
        const { _si: si, _fp: fp, _n: n } = this;
        const len = particles.length;

        if (!this._typeOf || this._typeOf.length < len) this._typeOf = new Int32Array(len);
        const typeOf = this._typeOf;
        for (let k = 0; k < len; k++) typeOf[k] = si[particles[k].species] ?? -1;

        for (let i = 0; i < len; i++) {
            const ti = typeOf[i];
            if (ti < 0) continue;
            const pi = particles[i];

            for (let j = i + 1; j < len; j++) {
                const tj = typeOf[j];
                if (tj < 0) continue;
                const p = fp[ti * n + tj];
                if (!p) continue;

                const pj = particles[j];
                const dx = pi.x - pj.x;
                const dy = pi.y - pj.y;
                const d2 = dx * dx + dy * dy;
                if (d2 === 0 || d2 >= p.rc2) continue;

                const d     = Math.sqrt(d2);
                const eterm = Math.exp(-p.a * (d - p.re));
                // f > 0 when r < re (repulsive), f < 0 when r > re (attractive)
                const f = -p.a2De * (1 - eterm) * eterm / d;
                pi.fx += f * dx;
                pi.fy += f * dy;
                pj.fx -= f * dx;
                pj.fy -= f * dy;
            }
        }
    }
}
