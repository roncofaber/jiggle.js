// Berendsen thermostat — exponential velocity rescaling toward T_target.
// Not a true canonical ensemble (kinetic energy fluctuations are suppressed),
// but smooth and widely used for equilibration. Coupling time tau controls
// how aggressively the thermostat drives the system toward T_target.
//
// Parameters:
//   temperature  — target temperature in Kelvin
//   tau          — coupling time in fs; larger = weaker coupling
import { KB, FORCE_CONV } from '../utils/units.js';

export class BerendsenForce {
    constructor({ temperature = 300, tau = 100 } = {}) {
        this.temperature = temperature; // K
        this.tau         = tau;         // fs
        this.isLangevin  = true;
        this.enabled     = false;
    }

    apply(store, sim) {
        const { vx, vy, mass, count } = store;
        const dt = sim?.dt ?? 1;
        let KE = 0;
        for (let i = 0; i < count; i++) KE += 0.5 * mass[i] * (vx[i] * vx[i] + vy[i] * vy[i]);
        if (KE < 1e-30) return;
        const KE_target = count * KB * this.temperature * FORCE_CONV; // [amu·(Å/fs)²]
        const lam = Math.sqrt(Math.max(0, 1 + (dt / this.tau) * (KE_target / KE - 1)));
        for (let i = 0; i < count; i++) { vx[i] *= lam; vy[i] *= lam; }
    }
}
