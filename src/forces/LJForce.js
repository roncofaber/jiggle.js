import { ljMix, pairKey } from '../utils/mixingRules.js';

// Lennard-Jones 12-6 pair potential: attractive well + repulsive core
// f = 24ε/r² [2(σ/r)¹² − (σ/r)⁶], folding 1/r into the unit vector
export class LJForce {
    constructor({ species = {}, cutoffMult = 2.5, overrides = {} } = {}) {
        const names = Object.keys(species);
        const n     = names.length;

        // species string → integer index
        this._si = Object.fromEntries(names.map((s, i) => [s, i]));
        this._n  = n;

        // flat n×n array of pre-computed pair params
        this._fp = new Array(n * n).fill(null);
        for (let i = 0; i < n; i++) {
            for (let j = i; j < n; j++) {
                const key = pairKey(names[i], names[j]);
                const raw = key in overrides ? overrides[key] : ljMix(species[names[i]], species[names[j]]);
                const rc  = cutoffMult * raw.sigma;
                const entry = {
                    sigma2: raw.sigma * raw.sigma,
                    f24:    24 * raw.epsilon,
                    rc2:    rc * rc,
                };
                this._fp[i * n + j] = entry;
                this._fp[j * n + i] = entry;
            }
        }

        this._typeOf = null; // Int32Array cache, reused across frames
    }

    apply(particles, sim) {
        const { _si: si, _fp: fp, _n: n } = this;
        const len = particles.length;
        const bc  = sim?.boundary;

        // Build/reuse per-particle type index array (O(n) map lookups once per frame)
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
                let dx = pi.x - pj.x;
                let dy = pi.y - pj.y;
                if (bc) [dx, dy] = bc.minImage(dx, dy, sim);
                const d2 = dx * dx + dy * dy;
                if (d2 === 0 || d2 >= p.rc2) continue;

                const sr  = p.sigma2 / d2; // (σ/r)²
                const sr3 = sr * sr * sr;   // (σ/r)⁶
                const sr6 = sr3 * sr3;      // (σ/r)¹²
                const f   = p.f24 / d2 * (2 * sr6 - sr3);
                pi.fx += f * dx;
                pi.fy += f * dy;
                pj.fx -= f * dx;
                pj.fy -= f * dy;
            }
        }
    }
}
