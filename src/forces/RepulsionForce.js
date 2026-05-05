// Pairwise soft repulsion between all particles
export class RepulsionForce {
    constructor({ dist = 45, strength = 0.06 } = {}) {
        this.dist     = dist;
        this.strength = strength;
    }

    apply(particles, sim) {
        const dist2 = this.dist * this.dist;
        const bc    = sim?.boundary;

        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                let dx = particles[i].x - particles[j].x;
                let dy = particles[i].y - particles[j].y;
                if (bc) [dx, dy] = bc.minImage(dx, dy, sim);
                const d2 = dx * dx + dy * dy;
                if (d2 === 0 || d2 >= dist2) continue;

                const d  = Math.sqrt(d2);
                const f  = (1 - d / this.dist) * this.strength / d;
                particles[i].fx += f * dx;
                particles[i].fy += f * dy;
                particles[j].fx -= f * dx;
                particles[j].fy -= f * dy;
            }
        }
    }
}
