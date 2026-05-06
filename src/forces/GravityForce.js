// Constant directional gravity. gx/gy are accelerations in Å/fs².
// Internally scales to kcal/(mol·Å) via FORCE_CONV so the BAOAB integrator
// produces the correct acceleration regardless of particle mass.
import { FORCE_CONV } from '../utils/units.js';

export class GravityForce {
    constructor({ gx = 0, gy = 0 } = {}) {
        this.gx = gx; // Å/fs²
        this.gy = gy; // Å/fs²
    }

    apply(store) {
        const { fx, fy, mass, count } = store;
        const { gx, gy } = this;
        for (let i = 0; i < count; i++) {
            fx[i] += gx * mass[i] / FORCE_CONV;
            fy[i] += gy * mass[i] / FORCE_CONV;
        }
    }
}
