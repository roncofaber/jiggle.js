export class ReflectiveBoundary {
    isPeriodic = false;

    applyPosition(store, i, sim) {
        while (store.x[i] < 0)           { store.x[i] = -store.x[i];                  store.vx[i] =  Math.abs(store.vx[i]); }
        while (store.x[i] > sim.width)   { store.x[i] = 2 * sim.width  - store.x[i]; store.vx[i] = -Math.abs(store.vx[i]); }
        while (store.y[i] < 0)           { store.y[i] = -store.y[i];                  store.vy[i] =  Math.abs(store.vy[i]); }
        while (store.y[i] > sim.height)  { store.y[i] = 2 * sim.height - store.y[i]; store.vy[i] = -Math.abs(store.vy[i]); }
    }

    minImage(dx, dy) { return [dx, dy]; }
}
