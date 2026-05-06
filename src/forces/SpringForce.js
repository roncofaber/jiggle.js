// Harmonic spring between explicitly bonded particle index pairs.
// bonds: [[i, j, restLength?], ...]  — restLength defaults to current distance at construction
// Includes optional velocity damping along the bond axis to prevent oscillation.
export class SpringForce {
    constructor({ bonds = [], stiffness = 0.1, damping = 0.02 } = {}) {
        this.stiffness = stiffness;
        this.damping   = damping;
        // Normalise bond entries to [i, j, rest]
        this.bonds = bonds.map(b => [b[0], b[1], b[2] ?? null]);
    }

    // Convenience: set rest length from current particle positions.
    // Call after particles are placed if rest lengths were omitted.
    calibrate(store) {
        for (const b of this.bonds) {
            if (b[2] !== null) continue;
            if (b[0] >= store.count || b[1] >= store.count) continue;
            const dx = store.x[b[0]] - store.x[b[1]];
            const dy = store.y[b[0]] - store.y[b[1]];
            b[2] = Math.sqrt(dx * dx + dy * dy);
        }
    }

    apply(store) {
        const { x, y, vx, vy, fx, fy, count } = store;
        const { stiffness, damping } = this;

        for (const [i, j, rest] of this.bonds) {
            if (i >= count || j >= count) continue;

            const dx = x[i] - x[j];
            const dy = y[i] - y[j];
            const d2 = dx * dx + dy * dy;
            if (d2 === 0) continue;
            const d = Math.sqrt(d2);

            const r       = rest ?? d;
            const stretch = d - r;
            const fs      = stiffness * stretch / d;

            // Velocity damping along bond axis
            const dvx = vx[i] - vx[j];
            const dvy = vy[i] - vy[j];
            const fd  = damping * (dvx * dx + dvy * dy) / d2;

            const f = fs + fd;
            fx[i] -= f * dx;  fy[i] -= f * dy;
            fx[j] += f * dx;  fy[j] += f * dy;
        }
    }
}
