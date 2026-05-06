import { CellGrid } from '../utils/CellGrid.js';

// Pairwise soft repulsion between all particles
export class RepulsionForce {
    constructor({ dist = 45, strength = 0.06, minDistFrac = 0.05 } = {}) {
        this.dist        = dist;
        this.strength    = strength;
        this.minDistFrac = minDistFrac;
        this._grid       = new CellGrid();
    }

    apply(store, sim) {
        const { x, y, fx, fy, count } = store;
        const dist     = this.dist;
        const dist2    = dist * dist;
        const strength = this.strength;
        const minD2    = (dist * this.minDistFrac) ** 2;
        const bc       = sim?.boundary;
        const periodic = bc?.isPeriodic ?? false;

        this._grid.build(store, dist, sim.width, sim.height);

        this._grid.forEachPair(count, (i, j) => {
            let dx = x[i] - x[j];
            let dy = y[i] - y[j];
            if (periodic) {
                const mi = bc.minImage(dx, dy, sim);
                dx = mi[0]; dy = mi[1];
            }
            const d2 = dx * dx + dy * dy;
            if (d2 === 0 || d2 >= dist2) return;

            const d2eff = d2 < minD2 ? minD2 : d2;
            const d     = Math.sqrt(d2eff);
            const f     = (1 - d / dist) * strength / d;
            fx[i] += f * dx;  fy[i] += f * dy;
            fx[j] -= f * dx;  fy[j] -= f * dy;
        }, periodic);
    }
}
