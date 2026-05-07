// Nosé-Hoover thermostat — deterministic extended-system thermostat.
// Adds a heat-bath degree of freedom xi (friction, 1/fs) coupled to the kinetic
// energy. Produces the correct canonical ensemble while preserving deterministic
// dynamics. Parameterised by relaxation time tau (fs);
// thermostat mass Q = N_f · kBT · tau².
//
// Integration: v-NHVE at the O slot of BAOAB —
//   1. scale v by exp(-xi · dt/2)
//   2. recompute KE, then xi += dt · (2·KE − N_f·kBT_amu) / Q
//   3. scale v by exp(-xi · dt/2)
//
// Parameters:
//   temperature  — target temperature in Kelvin
//   tau          — relaxation time in fs; characteristic oscillation period ≈ 2π·tau
import { KB, FORCE_CONV } from '../utils/units.js';

export class NoseHooverForce {
    constructor({ temperature = 300, tau = 100 } = {}) {
        this.temperature = temperature; // K
        this.tau         = tau;         // fs
        this.xi          = 0;           // thermostat friction, 1/fs
        this.isLangevin  = true;
        this.enabled     = false;
    }

    apply(store, sim) {
        const { vx, vy, mass, count } = store;
        const dt    = sim?.dt ?? 1;
        const Nf    = 2 * count;                           // DOF in 2D
        const kBT_a = KB * this.temperature * FORCE_CONV; // kBT in [amu·Å²/fs²]
        const Q     = Nf * kBT_a * this.tau * this.tau;   // thermostat mass [amu·Å²]

        // first half-friction kick
        const s1 = Math.exp(-this.xi * 0.5 * dt);
        for (let i = 0; i < count; i++) { vx[i] *= s1; vy[i] *= s1; }

        // update xi from current KE
        let KE = 0;
        for (let i = 0; i < count; i++) KE += 0.5 * mass[i] * (vx[i] * vx[i] + vy[i] * vy[i]);
        this.xi += dt * (2 * KE - Nf * kBT_a) / Q;

        // second half-friction kick
        const s2 = Math.exp(-this.xi * 0.5 * dt);
        for (let i = 0; i < count; i++) { vx[i] *= s2; vy[i] *= s2; }
    }
}
