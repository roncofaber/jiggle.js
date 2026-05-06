// Soft repulsion from box edges — a gentler alternative to ReflectiveBoundary.
// Particles feel no force beyond `margin` (Å) from a wall; force grows as a
// power law reaching `strength` (Å/fs²) at the wall itself.
import { FORCE_CONV } from '../utils/units.js';

export class BoundaryForce {
    constructor({ margin = 30, strength = 0.05, power = 2 } = {}) {
        this.margin   = margin;   // Å
        this.strength = strength; // Å/fs² at wall (acceleration)
        this.power    = power;
    }

    apply(store, sim) {
        const { x, y, fx, fy, count } = store;
        const { margin, power } = this;
        const str       = this.strength / FORCE_CONV; // convert to kcal/(mol·Å) equivalent
        const { width, height } = sim;
        const invMargin = 1 / margin;

        for (let i = 0; i < count; i++) {
            if (x[i] < margin) {
                fx[i] += str * Math.pow((margin - x[i]) * invMargin, power);
            } else if (x[i] > width - margin) {
                fx[i] -= str * Math.pow((x[i] - (width - margin)) * invMargin, power);
            }
            if (y[i] < margin) {
                fy[i] += str * Math.pow((margin - y[i]) * invMargin, power);
            } else if (y[i] > height - margin) {
                fy[i] -= str * Math.pow((y[i] - (height - margin)) * invMargin, power);
            }
        }
    }
}
