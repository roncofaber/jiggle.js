export class PeriodicBoundary {
    isPeriodic = true;

    constructor() {
        this._mi = new Float64Array(2);
    }

    applyPosition(store, i, sim) {
        store.x[i] = ((store.x[i] % sim.width)  + sim.width)  % sim.width;
        store.y[i] = ((store.y[i] % sim.height) + sim.height) % sim.height;
    }

    // Returns a reused Float64Array — read immediately, do not store the reference.
    minImage(dx, dy, sim) {
        this._mi[0] = dx - sim.width  * Math.round(dx / sim.width);
        this._mi[1] = dy - sim.height * Math.round(dy / sim.height);
        return this._mi;
    }
}
