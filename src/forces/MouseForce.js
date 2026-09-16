// Repels particles away from the mouse cursor
export class MouseForce {
    constructor({ dist = 120, strength = 0.06 } = {}) {
        this.dist     = dist;
        this.strength = strength;
        this.x        = null;
        this.y        = null;
    }

    setPosition(x, y) { this.x = x; this.y = y; }
    clear()            { this.x = null; this.y = null; }

    apply(store, sim) {
        if (this.x === null) return;
        const { x, y, fx, fy, count } = store;
        const mx    = this.x, my = this.y;
        const dist  = this.dist;
        const dist2 = dist * dist;
        const str   = this.strength;
        const periodic = sim?.boundary?.isPeriodic ?? false;

        for (let i = 0; i < count; i++) {
            let dx = x[i] - mx;
            let dy = y[i] - my;
            if (periodic) {
                const mi = sim.boundary.minImage(dx, dy, sim);
                dx = mi[0]; dy = mi[1];
            }
            const d2 = dx * dx + dy * dy;
            if (d2 === 0 || d2 >= dist2) continue;

            const d = Math.sqrt(d2);
            const f = (1 - d / dist) * str / d;
            fx[i] += f * dx;
            fy[i] += f * dy;
        }
    }
}
