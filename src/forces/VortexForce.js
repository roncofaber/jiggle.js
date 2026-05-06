// Tangential (curl) force around a fixed centre — produces swirling without attraction.
// Positive strength = counterclockwise; negative = clockwise.
export class VortexForce {
    constructor({ x = 0, y = 0, strength = 0.05, falloff = 1, minDist = 10 } = {}) {
        this.x        = x;
        this.y        = y;
        this.strength = strength;
        this.falloff  = falloff;
        this.minDist  = minDist;
    }

    apply(store) {
        const { x, y, fx, fy, count } = store;
        const { x: vx, y: vy, strength, falloff, minDist } = this;
        const minD2 = minDist * minDist;

        for (let i = 0; i < count; i++) {
            const dx = x[i] - vx;
            const dy = y[i] - vy;
            const d2 = Math.max(minD2, dx * dx + dy * dy);
            const d  = Math.sqrt(d2);
            // Tangential unit vector perpendicular to radial: (-dy, dx) / d
            const f  = strength * Math.pow(d, -(falloff + 1));
            fx[i] += f * (-dy);
            fy[i] += f * ( dx);
        }
    }
}
