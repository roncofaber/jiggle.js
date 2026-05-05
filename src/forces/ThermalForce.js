// Langevin thermostat: friction damping + Gaussian noise
function randG() {
    let u, v;
    do { u = Math.random(); } while (u === 0);
    do { v = Math.random(); } while (v === 0);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export class ThermalForce {
    constructor({ friction = 0.004, strength = 0.022 } = {}) {
        this.friction = friction;
        this.strength = strength;
    }

    apply(particles) {
        for (const p of particles) {
            const invSqrtM = 1 / Math.sqrt(p.mass);
            p.vx = p.vx * (1 - this.friction) + randG() * this.strength * invSqrtM;
            p.vy = p.vy * (1 - this.friction) + randG() * this.strength * invSqrtM;
        }
    }
}
