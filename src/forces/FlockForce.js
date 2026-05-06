import { CellGrid } from '../utils/CellGrid.js';

// Boid-style flocking: separation (avoid crowding), alignment (match heading),
// cohesion (steer toward group centre).  Uses CellGrid for O(n) pair detection.
export class FlockForce {
    constructor({
        perceptionRadius = 80,
        separationRadius = 25,
        separationWeight = 0.25,
        alignmentWeight  = 0.08,
        cohesionWeight   = 0.04,
    } = {}) {
        this.perceptionRadius = perceptionRadius;
        this.separationRadius = separationRadius;
        this.separationWeight = separationWeight;
        this.alignmentWeight  = alignmentWeight;
        this.cohesionWeight   = cohesionWeight;
        this._grid = new CellGrid();
    }

    apply(store, sim) {
        const { x, y, vx, vy, fx, fy, count } = store;
        if (count < 2) return;

        const { perceptionRadius: pr, separationRadius: sr,
                separationWeight: sw, alignmentWeight: aw, cohesionWeight: cw } = this;
        const pr2 = pr * pr;
        const sr2 = sr * sr;
        const bc       = sim?.boundary;
        const periodic = bc?.isPeriodic ?? false;

        this._grid.build(store, pr, sim.width, sim.height);

        if (!this._buf || this._buf.length < count * 7) this._buf = new Float32Array(count * 7);
        const buf = this._buf;
        buf.fill(0, 0, count * 7);
        // Layout per particle i: [sepX, sepY, aliX, aliY, cohX, cohY, count]
        //                         i*7+0  +1    +2    +3    +4    +5    +6

        this._grid.forEachPair(count, (i, j) => {
            let dx = x[i] - x[j];
            let dy = y[i] - y[j];
            if (periodic) {
                const mi = bc.minImage(dx, dy, sim);
                dx = mi[0]; dy = mi[1];
            }
            const d2 = dx * dx + dy * dy;
            if (d2 === 0 || d2 >= pr2) return;

            const bi = i * 7, bj = j * 7;

            buf[bi + 4] -= dx;  buf[bi + 5] -= dy;
            buf[bj + 4] += dx;  buf[bj + 5] += dy;

            buf[bi + 2] += vx[j];  buf[bi + 3] += vy[j];
            buf[bj + 2] += vx[i];  buf[bj + 3] += vy[i];

            buf[bi + 6]++;  buf[bj + 6]++;

            if (d2 < sr2) {
                const d = Math.sqrt(d2);
                const s = (sr - d) / (d * sr);
                buf[bi    ] += s * dx;  buf[bi + 1] += s * dy;
                buf[bj    ] -= s * dx;  buf[bj + 1] -= s * dy;
            }
        }, periodic);

        for (let i = 0; i < count; i++) {
            const bi = i * 7;
            const nb = buf[bi + 6];

            fx[i] += sw * buf[bi    ];
            fy[i] += sw * buf[bi + 1];

            if (nb > 0) {
                const invNb = 1 / nb;
                fx[i] += cw * buf[bi + 4] * invNb;
                fy[i] += cw * buf[bi + 5] * invNb;
                fx[i] += aw * (buf[bi + 2] * invNb - vx[i]);
                fy[i] += aw * (buf[bi + 3] * invNb - vy[i]);
            }
        }
    }
}
