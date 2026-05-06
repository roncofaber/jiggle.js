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

    apply(store) {
        if (this.x === null) return;
        const { x, y, fx, fy, count } = store;
        const mx    = this.x, my = this.y;
        const dist  = this.dist;
        const dist2 = dist * dist;
        const str   = this.strength;

        for (let i = 0; i < count; i++) {
            const dx = x[i] - mx;
            const dy = y[i] - my;
            const d2 = dx * dx + dy * dy;
            if (d2 === 0 || d2 >= dist2) continue;

            const d = Math.sqrt(d2);
            const f = (1 - d / dist) * str / d;
            fx[i] += f * dx;
            fy[i] += f * dy;
        }
    }
}
