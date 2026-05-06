// Soft repulsion from the canvas edges — a gentler alternative to ReflectiveBoundary.
// Particles feel no force when further than `margin` from a wall; force grows as a
// power law as they enter the margin zone, reaching `strength` at the wall itself.
export class BoundaryForce {
    constructor({ margin = 60, strength = 0.4, power = 2 } = {}) {
        this.margin   = margin;
        this.strength = strength;
        this.power    = power;
    }

    apply(store, sim) {
        const { x, y, fx, fy, count } = store;
        const { margin, strength, power } = this;
        const { width, height } = sim;
        const invMargin = 1 / margin;

        for (let i = 0; i < count; i++) {
            if (x[i] < margin) {
                fx[i] += strength * Math.pow((margin - x[i]) * invMargin, power);
            } else if (x[i] > width - margin) {
                fx[i] -= strength * Math.pow((x[i] - (width - margin)) * invMargin, power);
            }
            if (y[i] < margin) {
                fy[i] += strength * Math.pow((margin - y[i]) * invMargin, power);
            } else if (y[i] > height - margin) {
                fy[i] -= strength * Math.pow((y[i] - (height - margin)) * invMargin, power);
            }
        }
    }
}
