export class AbsorbingBoundary {
    isPeriodic = false;

    constructor({ onRemove = null } = {}) {
        this.onRemove = onRemove;
    }

    applyPosition() {}

    minImage(dx, dy) { return [dx, dy]; }

    // Modifies store in-place (O(1) swap-remove per absorbed particle).
    // Iterates backwards so swap-removal never skips an unprocessed index.
    filterParticles(store, sim) {
        const { width, height } = sim;
        for (let i = store.count - 1; i >= 0; i--) {
            if (store.x[i] < 0 || store.x[i] > width || store.y[i] < 0 || store.y[i] > height) {
                if (this.onRemove) this.onRemove(store, i);
                store.remove(i);
            }
        }
    }
}
