// Andersen thermostat — stochastic collision model.
// At rate nu (1/fs), each particle's velocity is redrawn from Maxwell-Boltzmann
// at T_target. Produces the correct canonical ensemble but disrupts velocity
// autocorrelation (not suitable for transport property measurements).
//
// Parameters:
//   temperature  — target temperature in Kelvin
//   nu           — collision frequency in 1/fs; higher = tighter temperature control
import { KB, FORCE_CONV } from '../utils/units.js';

let _spare = null;
function randG() {
    if (_spare !== null) { const s = _spare; _spare = null; return s; }
    let u, v;
    do { u = Math.random(); } while (u === 0);
    do { v = Math.random(); } while (v === 0);
    const mag = Math.sqrt(-2 * Math.log(u));
    _spare = mag * Math.sin(2 * Math.PI * v);
    return       mag * Math.cos(2 * Math.PI * v);
}

export class AndersenForce {
    constructor({ temperature = 300, nu = 0.01 } = {}) {
        this.temperature = temperature; // K
        this.nu          = nu;          // 1/fs
        this.isLangevin  = true;
        this.enabled     = false;
    }

    apply(store, sim) {
        const { vx, vy, mass, count } = store;
        const dt     = sim?.dt ?? 1;
        const kBT_fc = KB * this.temperature * FORCE_CONV; // [amu·Å²/fs²]
        const p      = Math.min(1, this.nu * dt);
        for (let i = 0; i < count; i++) {
            if (Math.random() < p) {
                const sig = Math.sqrt(kBT_fc / mass[i]);
                vx[i] = sig * randG();
                vy[i] = sig * randG();
            }
        }
    }
}
