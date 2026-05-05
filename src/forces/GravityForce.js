// Constant downward (or directional) gravity
export class GravityForce {
    constructor({ gx = 0, gy = 0.05 } = {}) {
        this.gx = gx;
        this.gy = gy;
    }

    apply(particles) {
        for (const p of particles) {
            p.fx += this.gx * p.mass;
            p.fy += this.gy * p.mass;
        }
    }
}
