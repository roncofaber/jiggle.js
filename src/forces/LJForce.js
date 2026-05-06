import { ljMix, pairKey }  from '../utils/mixingRules.js';
import { CellGrid }        from '../utils/CellGrid.js';

// Lennard-Jones 12-6 pair potential with shifted potential (V(rc) = 0).
// f = 24ε/r² [2(σ/r)¹² − (σ/r)⁶], folding 1/r into the unit vector
export class LJForce {
    constructor({ species = {}, cutoffMult = 2.5, cutoff = null, minDistMult = 0.5, overrides = {} } = {}) {
        const names = Object.keys(species);
        const n     = names.length;

        this._si = Object.fromEntries(names.map((s, i) => [s, i]));
        this._n  = n;

        this._fp = new Array(n * n).fill(null);
        let maxRc = 0;
        for (let i = 0; i < n; i++) {
            for (let j = i; j < n; j++) {
                const key = pairKey(names[i], names[j]);
                const raw = key in overrides ? overrides[key] : ljMix(species[names[i]], species[names[j]]);
                const rc  = cutoff ?? cutoffMult * raw.sigma;
                if (rc > maxRc) maxRc = rc;
                const minD = minDistMult * raw.sigma;
                // Shifted potential: subtract V(rc) so energy → 0 continuously at cutoff.
                const src  = raw.sigma / rc;
                const src6 = (src * src * src) * (src * src * src);
                const entry = {
                    sigma2:  raw.sigma * raw.sigma,
                    f24:     24 * raw.epsilon,
                    rc2:     rc * rc,
                    minD2:   minD * minD,
                    V_shift: 4 * raw.epsilon * (src6 * src6 - src6),
                };
                this._fp[i * n + j] = entry;
                this._fp[j * n + i] = entry;
            }
        }

        this._maxRc  = maxRc;
        this._typeOf = null;
        this._grid   = new CellGrid();
    }

    potentialEnergy(store, sim) {
        const { _si: si, _fp: fp, _n: n, _maxRc: maxRc } = this;
        const { x, y, species, count } = store;
        const bc       = sim?.boundary;
        const periodic = bc?.isPeriodic ?? false;
        let   pe       = 0;
        this._grid.build(store, maxRc, sim.width, sim.height);
        this._grid.forEachPair(count, (i, j) => {
            const ti = si[species[i]] ?? -1; if (ti < 0) return;
            const tj = si[species[j]] ?? -1; if (tj < 0) return;
            const p  = fp[ti * n + tj]; if (!p) return;
            let dx = x[i] - x[j];
            let dy = y[i] - y[j];
            if (periodic) { const mi = bc.minImage(dx, dy, sim); dx = mi[0]; dy = mi[1]; }
            const d2 = dx * dx + dy * dy;
            if (d2 === 0 || d2 >= p.rc2) return;
            const d2eff = d2 < p.minD2 ? p.minD2 : d2;
            const sr    = p.sigma2 / d2eff;
            const sr3   = sr * sr * sr;
            const sr6   = sr3 * sr3;
            pe += (p.f24 / 6) * (sr6 - sr3) - p.V_shift; // 4ε[(σ/r)¹²-(σ/r)⁶] - V(rc)
        }, periodic);
        return pe;
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

            const d2eff = d2 < p.minD2 ? p.minD2 : d2;
            const sr    = p.sigma2 / d2eff;
            const sr3   = sr * sr * sr;
            const sr6   = sr3 * sr3;
            const f     = p.f24 / d2eff * (2 * sr6 - sr3);
            fx[i] += f * dx;  fy[i] += f * dy;
            fx[j] -= f * dx;  fy[j] -= f * dy;
        }, periodic);
    }
}
