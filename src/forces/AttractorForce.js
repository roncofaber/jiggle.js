// Point gravity well at a fixed (x, y).  All particles are pulled toward it with
// force proportional to mass (so all species accelerate equally, like gravity).
// falloff controls the radial power-law: 1 = inverse-r, 2 = inverse-square.
export class AttractorForce {
    constructor({ x = 0, y = 0, strength = 0.05, falloff = 1, minDist = 10 } = {}) {
        this.x        = x;
        this.y        = y;
        this.strength = strength;
        this.falloff  = falloff;
        this.minDist  = minDist;
    }

    apply(store) {
        const { x, y, fx, fy, mass, count } = store;
        const { x: ax, y: ay, strength, falloff, minDist } = this;
        const minD2 = minDist * minDist;

        for (let i = 0; i < count; i++) {
            const dx = ax - x[i];
            const dy = ay - y[i];
            const d2 = Math.max(minD2, dx * dx + dy * dy);
            const d  = Math.sqrt(d2);
            const f  = strength * mass[i] * Math.pow(d, -(falloff + 1));
            fx[i] += f * dx;
            fy[i] += f * dy;
        }
    }
}
