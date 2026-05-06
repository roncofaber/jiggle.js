import { morseMix, pairKey } from '../utils/mixingRules.js';
import { CellGrid }          from '../utils/CellGrid.js';

// Morse pair potential: softer repulsion than LJ, asymmetric well
// V(r) = De[(1 - e^{-a(r-re)})² - 1],  F = -dV/dr projected along pair vector
export class MorseForce {
    constructor({ species = {}, cutoffMult = 4.0, minDistMult = 0.3, overrides = {} } = {}) {
        const names = Object.keys(species);
        const n     = names.length;

        this._si = Object.fromEntries(names.map((s, i) => [s, i]));
        this._n  = n;

        this._fp = new Array(n * n).fill(null);
        let maxRc = 0;
        for (let i = 0; i < n; i++) {
            for (let j = i; j < n; j++) {
                const key = pairKey(names[i], names[j]);
                const raw = key in overrides ? overrides[key] : morseMix(species[names[i]], species[names[j]]);
                const rc  = raw.re * cutoffMult;
                if (rc > maxRc) maxRc = rc;
                const minD  = minDistMult * raw.re;
                const entry = {
                    De:    raw.De,
                    re:    raw.re,
                    a:     raw.a,
                    rc2:   rc * rc,
                    minD2: minD * minD,
                    a2De:  2 * raw.a * raw.De,
                };
                this._fp[i * n + j] = entry;
                this._fp[j * n + i] = entry;
            }
        }

        this._maxRc  = maxRc;
        this._typeOf = null;
        this._grid   = new CellGrid();
    }

    apply(store, sim) {
        const { _si: si, _fp: fp, _n: n, _maxRc: maxRc } = this;
        const { x, y, fx, fy, species, count } = store;
        const bc       = sim?.boundary;
        const periodic = bc?.isPeriodic ?? false;

        if (!this._typeOf || this._typeOf.length < count) this._typeOf = new Int32Array(count);
        const typeOf = this._typeOf;
        for (let k = 0; k < count; k++) typeOf[k] = si[species[k]] ?? -1;

        this._grid.build(store, maxRc, sim.width, sim.height);

        this._grid.forEachPair(count, (i, j) => {
            const ti = typeOf[i]; if (ti < 0) return;
            const tj = typeOf[j]; if (tj < 0) return;
            const p  = fp[ti * n + tj]; if (!p) return;

            let dx = x[i] - x[j];
            let dy = y[i] - y[j];
            if (periodic) {
                const mi = bc.minImage(dx, dy, sim);
                dx = mi[0]; dy = mi[1];
            }
            const d2 = dx * dx + dy * dy;
            if (d2 === 0 || d2 >= p.rc2) return;

            const d     = Math.sqrt(d2 < p.minD2 ? p.minD2 : d2);
            const eterm = Math.exp(-p.a * (d - p.re));
            const f     = -p.a2De * (1 - eterm) * eterm / d;
            fx[i] += f * dx;  fy[i] += f * dy;
            fx[j] -= f * dx;  fy[j] -= f * dy;
        }, periodic);
    }
}
