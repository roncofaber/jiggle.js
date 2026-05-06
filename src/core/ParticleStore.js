// Structure-of-Arrays particle container.
// Each field is a typed Float32Array; string species is a plain Array.
// Removal is O(1) swap-with-last; addition doubles capacity when full.
export class ParticleStore {
    constructor(capacity = 256) {
        this._cap    = capacity;
        this.count   = 0;
        this.x       = new Float32Array(capacity);
        this.y       = new Float32Array(capacity);
        this.vx      = new Float32Array(capacity);
        this.vy      = new Float32Array(capacity);
        this.fx      = new Float32Array(capacity);
        this.fy      = new Float32Array(capacity);
        this.radius  = new Float32Array(capacity);
        this.mass    = new Float32Array(capacity);
        this.species = new Array(capacity).fill('');
    }

    _grow() {
        const cap2 = this._cap * 2;
        const grow = arr => { const n = new Float32Array(cap2); n.set(arr); return n; };
        this.x       = grow(this.x);
        this.y       = grow(this.y);
        this.vx      = grow(this.vx);
        this.vy      = grow(this.vy);
        this.fx      = grow(this.fx);
        this.fy      = grow(this.fy);
        this.radius  = grow(this.radius);
        this.mass    = grow(this.mass);
        this.species.length = cap2;
        this.species.fill('', this._cap);
        this._cap = cap2;
    }

    add({ x, y, vx = 0, vy = 0, radius = 2, mass = 1.0, species = 'default' }) {
        if (this.count >= this._cap) this._grow();
        const i         = this.count++;
        this.x[i]       = x;
        this.y[i]       = y;
        this.vx[i]      = vx;
        this.vy[i]      = vy;
        this.fx[i]      = 0;
        this.fy[i]      = 0;
        this.radius[i]  = radius;
        this.mass[i]    = mass;
        this.species[i] = species;
        return i;
    }

    // O(1) removal: fills slot i with the last particle, then shrinks count.
    remove(i) {
        const last = --this.count;
        if (i === last) return;
        this.x[i]       = this.x[last];
        this.y[i]       = this.y[last];
        this.vx[i]      = this.vx[last];
        this.vy[i]      = this.vy[last];
        this.fx[i]      = this.fx[last];
        this.fy[i]      = this.fy[last];
        this.radius[i]  = this.radius[last];
        this.mass[i]    = this.mass[last];
        this.species[i] = this.species[last];
    }

    resetForces() {
        this.fx.fill(0, 0, this.count);
        this.fy.fill(0, 0, this.count);
    }
}
