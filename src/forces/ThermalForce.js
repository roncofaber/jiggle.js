// Langevin thermostat — exact Ornstein-Uhlenbeck integrator for the O step of BAOAB.
// Stationary distribution: <v²> = kBT/m per component (equipartition). ✓
// FDT is enforced automatically: c2 is derived from c1 and temperature, not independent.
//
// Parameters:
//   temperature  — target temperature in Kelvin
//   gamma        — friction coefficient in 1/fs; typical range 0.001–0.1
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

export class ThermalForce {
    constructor({ temperature = 300, gamma = 0.01 } = {}) {
        this.temperature = temperature; // K
        this.gamma       = gamma;       // 1/fs
        this.isLangevin  = true;        // signals BAOAB integrator to place this in the O slot
    }

    apply(store, sim) {
        const { vx, vy, mass, count } = store;
        const kBT  = KB * this.temperature;                        // kcal/mol
        const c1   = Math.exp(-this.gamma * (sim?.dt ?? 1));
        const c2sq = (1 - c1 * c1) * kBT * (sim?._fconv ?? FORCE_CONV); // Å²/fs² (mass-free)
        for (let i = 0; i < count; i++) {
            const c2 = Math.sqrt(c2sq / mass[i]);
            vx[i] = c1 * vx[i] + c2 * randG();
            vy[i] = c1 * vy[i] + c2 * randG();
        }
    }
}
