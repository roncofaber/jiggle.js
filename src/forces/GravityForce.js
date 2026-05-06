// Constant downward (or directional) gravity
export class GravityForce {
    constructor({ gx = 0, gy = 0.05 } = {}) {
        this.gx = gx;
        this.gy = gy;
    }

    apply(store) {
        const { fx, fy, mass, count } = store;
        const { gx, gy } = this;
        for (let i = 0; i < count; i++) {
            fx[i] += gx * mass[i];
            fy[i] += gy * mass[i];
        }
    }
}
