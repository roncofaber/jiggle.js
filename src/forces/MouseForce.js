// Repels particles away from the mouse cursor
export class MouseForce {
    constructor({ dist = 120, strength = 0.06 } = {}) {
        this.dist     = dist;
        this.strength = strength;
        this.x        = null;
        this.y        = null;
    }

    setPosition(x, y) {
        this.x = x;
        this.y = y;
    }

    clear() {
        this.x = null;
        this.y = null;
    }

    apply(particles) {
        if (this.x === null) return;
        const mx    = this.x, my = this.y;
        const dist2 = this.dist * this.dist;

        for (const p of particles) {
            const dx = p.x - mx;
            const dy = p.y - my;
            const d2 = dx * dx + dy * dy;
            if (d2 === 0 || d2 >= dist2) continue;

            const d = Math.sqrt(d2);
            const f = (1 - d / this.dist) * this.strength / d;
            p.fx += f * dx;
            p.fy += f * dy;
        }
    }
}
