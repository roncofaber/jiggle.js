// Cursor interaction: linearly-decaying repulsion, plus an optional
// "stirring" drag that relaxes nearby particles toward the cursor's velocity.
// The drag is an exact exponential relaxation (like the OU thermostat), so it
// is stable at any strength, and a stationary cursor damps local motion the
// way a finger in water does.
export class MouseForce {
    constructor({ dist = 120, strength = 0.06, drag = 0, dragMax = 0.1, dragThreshold = 0.05 } = {}) {
        this.dist     = dist;
        this.strength = strength;
        this.drag     = drag;           // relaxation rate in 1/fs; 0 disables stirring
        this.dragMax  = dragMax;        // cap on the cursor speed used for the drag (A/fs)
        this.dragThreshold = dragThreshold; // stir only above this cursor speed (A/fs)
        this.x        = null;
        this.y        = null;
        this.vx       = 0;              // cursor velocity in A/fs, tracked per step
        this.vy       = 0;
        this._prev    = null;           // cursor position at the previous apply
    }

    setPosition(x, y) { this.x = x; this.y = y; }
    clear() {
        this.x = null; this.y = null;
        this.vx = 0; this.vy = 0;
        this._prev = null;
    }

    apply(store, sim) {
        if (this.x === null) return;
        const { x, y, vx, vy, fx, fy, count } = store;
        const dt   = sim?.dt ?? 1;
        const dist = this.dist, dist2 = dist * dist;
        const str  = this.strength;
        const periodic = sim?.boundary?.isPeriodic ?? false;

        // Cursor velocity from the per-step displacement, capped at dragMax
        let stirring = false;
        if (this.drag > 0) {
            if (this._prev) {
                const dx = this.x - this._prev.x, dy = this.y - this._prev.y;
                const sp = Math.sqrt(dx * dx + dy * dy);
                const cap = this.dragMax * dt;
                if (sp > cap) { this.vx = dx / sp * this.dragMax; this.vy = dy / sp * this.dragMax; }
                else          { this.vx = dx / dt; this.vy = dy / dt; }
            } else {
                this.vx = 0; this.vy = 0;
            }
            this._prev = { x: this.x, y: this.y };
            // Stir only when the cursor moves: a stationary cursor must not
            // damp the repulsion-driven outflow (that traps particles)
            stirring = Math.sqrt(this.vx * this.vx + this.vy * this.vy) > this.dragThreshold;
        }

        for (let i = 0; i < count; i++) {
            let dx = x[i] - this.x;
            let dy = y[i] - this.y;
            if (periodic) {
                const mi = sim.boundary.minImage(dx, dy, sim);
                dx = mi[0]; dy = mi[1];
            }
            const d2 = dx * dx + dy * dy;
            if (d2 === 0 || d2 >= dist2) continue;

            const d = Math.sqrt(d2);
            const w = 1 - d / dist;

            const f = w * str / d;
            fx[i] += f * dx;
            fy[i] += f * dy;

            if (stirring) {
                const k = w * (1 - Math.exp(-this.drag * dt));
                vx[i] += k * (this.vx - vx[i]);
                vy[i] += k * (this.vy - vy[i]);
            }
        }
    }
}
