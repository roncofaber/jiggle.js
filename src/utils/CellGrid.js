// Uniform cell list for O(n) spatial neighbour queries.
// build() assigns particle indices to grid cells; forEachPair() visits each
// unique pair exactly once using the half-space neighbour stencil.
export class CellGrid {
    constructor() {
        this._cells = null;
        this._nx    = 0;
        this._ny    = 0;
        this._cellW = 0;
        this._cellH = 0;
    }

    // store: ParticleStore
    build(store, cutoff, width, height) {
        const nx = Math.max(1, Math.floor(width  / cutoff));
        const ny = Math.max(1, Math.floor(height / cutoff));
        this._nx    = nx;
        this._ny    = ny;
        this._cellW = width  / nx;
        this._cellH = height / ny;

        const total = nx * ny;
        if (!this._cells || this._cells.length !== total) {
            this._cells = new Array(total);
            for (let i = 0; i < total; i++) this._cells[i] = [];
        } else {
            for (let i = 0; i < total; i++) this._cells[i].length = 0;
        }

        const { x, y, count } = store;
        for (let k = 0; k < count; k++) {
            const ci = Math.max(0, Math.min(nx - 1, (x[k] / this._cellW) | 0));
            const cj = Math.max(0, Math.min(ny - 1, (y[k] / this._cellH) | 0));
            this._cells[cj * nx + ci].push(k);
        }
    }

    // Calls cb(i, j) for each unique unordered pair of particle indices whose
    // cells are within one cell of each other.  Requires nx >= 3 && ny >= 3
    // when periodic to guarantee no pair is visited twice.
    forEachPair(count, cb, periodic = false) {
        const { _nx: nx, _ny: ny, _cells: cells } = this;

        // Tiny periodic box: half-space stencil would double-count pairs — fall back.
        if (periodic && (nx < 3 || ny < 3)) {
            for (let a = 0; a < count; a++)
                for (let b = a + 1; b < count; b++) cb(a, b);
            return;
        }

        // Half-space stencil: each unordered cell pair visited exactly once.
        for (let cy = 0; cy < ny; cy++) {
            for (let cx = 0; cx < nx; cx++) {
                const cellA = cells[cy * nx + cx];
                if (!cellA.length) continue;

                // (0,0) — same cell, upper triangle only
                for (let a = 0; a < cellA.length; a++)
                    for (let b = a + 1; b < cellA.length; b++)
                        cb(cellA[a], cellA[b]);

                // Cross-cell neighbours
                const neighbours = [
                    [cx + 1, cy    ],
                    [cx - 1, cy + 1],
                    [cx,     cy + 1],
                    [cx + 1, cy + 1],
                ];

                for (let d = 0; d < 4; d++) {
                    let ncx = neighbours[d][0];
                    let ncy = neighbours[d][1];

                    if (periodic) {
                        ncx = ((ncx % nx) + nx) % nx;
                        ncy = ((ncy % ny) + ny) % ny;
                    } else if (ncx < 0 || ncx >= nx || ncy < 0 || ncy >= ny) {
                        continue;
                    }

                    const cellB = cells[ncy * nx + ncx];
                    if (!cellB.length) continue;

                    for (let a = 0; a < cellA.length; a++)
                        for (let b = 0; b < cellB.length; b++)
                            cb(cellA[a], cellB[b]);
                }
            }
        }
    }
}
