import { ParticleStore }     from './ParticleStore.js';
import { PeriodicBoundary }  from '../boundaries/PeriodicBoundary.js';

export class Simulation {
    constructor({ count = 60, width = 800, height = 600, boundary = new PeriodicBoundary(), maxSpeed = 50 } = {}) {
        this.width    = width;
        this.height   = height;
        this.boundary = boundary;
        this.maxSpeed = maxSpeed;
        this.forces   = [];
        this.store    = new ParticleStore(Math.max(count, 32));
        for (let i = 0; i < count; i++) this.store.add(this._mkDesc());
    }

    _mkDesc(species = 'default') {
        const radius = Math.random() * 2 + 1.2;
        return {
            x:  Math.random() * this.width,
            y:  Math.random() * this.height,
            vx: (Math.random() - 0.5) * 0.56,
            vy: (Math.random() - 0.5) * 0.56,
            radius,
            species,
        };
    }

    // ── Structured initialisers ───────────────────────────────────────

    static fromMixture(groups, { width = 800, height = 600, boundary } = {}) {
        const sim   = new Simulation({ count: 0, width, height, ...(boundary && { boundary }) });
        const total = groups.reduce((s, g) => s + g.count, 0);

        // Jittered grid — prevents LJ blowup from overlapping random starts
        const cols  = Math.ceil(Math.sqrt(total * width / height));
        const rows  = Math.ceil(total / cols);
        const cellW = width  / cols;
        const cellH = height / rows;
        const positions = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (positions.length >= total) break;
                positions.push([
                    (c + 0.5 + (Math.random() - 0.5) * 0.6) * cellW,
                    (r + 0.5 + (Math.random() - 0.5) * 0.6) * cellH,
                ]);
            }
        }
        for (let i = positions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [positions[i], positions[j]] = [positions[j], positions[i]];
        }

        let idx = 0;
        for (const { species, count, radius, radiusMin, radiusMax, radiusSampler } of groups) {
            for (let i = 0; i < count; i++) {
                const r = radiusSampler
                    ? radiusSampler()
                    : (radius
                        ?? (radiusMin !== undefined
                            ? radiusMin + Math.random() * ((radiusMax ?? radiusMin) - radiusMin)
                            : Math.random() * 2 + 1.2));
                const [x, y] = positions[idx++] ?? [Math.random() * width, Math.random() * height];
                sim.store.add({
                    x, y,
                    vx: (Math.random() - 0.5) * 0.56,
                    vy: (Math.random() - 0.5) * 0.56,
                    radius: r,
                    species,
                });
            }
        }
        return sim;
    }

    // Particles evenly spaced on a circle.
    static fromRing(count, {
        radius = 200, cx, cy, species = 'default',
        particleRadius = 2, width = 800, height = 600, boundary,
    } = {}) {
        const sim = new Simulation({ count: 0, width, height, ...(boundary && { boundary }) });
        const ox  = cx ?? width  / 2;
        const oy  = cy ?? height / 2;
        for (let i = 0; i < count; i++) {
            const angle = (2 * Math.PI * i) / count;
            sim.store.add({
                x: ox + radius * Math.cos(angle),
                y: oy + radius * Math.sin(angle),
                species,
                radius: particleRadius,
            });
        }
        return sim;
    }

    // Particles on a regular lattice.
    static fromGrid(cols, rows, {
        spacing = 30, ox, oy, species = 'default',
        particleRadius = 2, width = 800, height = 600, boundary,
    } = {}) {
        const sim = new Simulation({ count: 0, width, height, ...(boundary && { boundary }) });
        const x0  = ox ?? (width  - (cols - 1) * spacing) / 2;
        const y0  = oy ?? (height - (rows - 1) * spacing) / 2;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                sim.store.add({
                    x: x0 + c * spacing,
                    y: y0 + r * spacing,
                    species,
                    radius: particleRadius,
                });
            }
        }
        return sim;
    }

    // ── Particle management ───────────────────────────────────────────

    addParticle(descriptor) {
        this.store.add(descriptor);
        return this;
    }

    // Remove by index (O(1) swap-with-last).
    removeParticle(index) {
        this.store.remove(index);
        return this;
    }

    // ── Force management ──────────────────────────────────────────────

    addForce(force) {
        this.forces.push(force);
        return this;
    }

    removeForce(force) {
        this.forces = this.forces.filter(f => f !== force);
        return this;
    }

    // ── Queries ───────────────────────────────────────────────────────

    get particleCount() { return this.store.count; }

    kineticEnergy() {
        const { vx, vy, mass, count } = this.store;
        let ke = 0;
        for (let i = 0; i < count; i++) ke += 0.5 * mass[i] * (vx[i] * vx[i] + vy[i] * vy[i]);
        return ke;
    }

    // Mean kinetic energy per particle (= kBT in 2D by equipartition: KE = N·kBT).
    temperature() {
        return this.store.count ? this.kineticEnergy() / this.store.count : 0;
    }

    // ── Resize ────────────────────────────────────────────────────────

    resize(width, height) {
        const sx = width  / this.width;
        const sy = height / this.height;
        this.width  = width;
        this.height = height;
        const { x, y, count } = this.store;
        for (let i = 0; i < count; i++) { x[i] *= sx; y[i] *= sy; }
    }

    // ── Step (BAOAB Langevin integrator) ─────────────────────────────
    //
    // B  v += ½ F/m            (half-kick, forces carried from previous step)
    // A  x += ½ v              (half-drift)
    // O  Ornstein-Uhlenbeck    (ThermalForce; isLangevin = true)
    // A  x += ½ v  + boundary  (half-drift)
    // [recompute conservative forces at new positions]
    // B  v += ½ F/m            (half-kick)
    //
    // Forces p.fx/fy are initialised to 0 by ParticleStore and reset before
    // each force evaluation, so the first step correctly uses F=0 for the first B.

    step(context = {}) {
        const store = this.store;
        const { x, y, vx, vy, fx, fy, mass } = store;
        const n = store.count;

        // ── B: first half-kick ───────────────────────────────────────
        for (let i = 0; i < n; i++) {
            vx[i] += 0.5 * fx[i] / mass[i];
            vy[i] += 0.5 * fy[i] / mass[i];
        }

        // ── A: first half-drift ──────────────────────────────────────
        for (let i = 0; i < n; i++) {
            x[i] += 0.5 * vx[i];
            y[i] += 0.5 * vy[i];
        }

        // ── O: Langevin thermostat ───────────────────────────────────
        for (const force of this.forces) {
            if (force.enabled === false || !force.isLangevin) continue;
            force.apply(store, this, context);
        }

        // ── A: second half-drift + boundary ──────────────────────────
        for (let i = 0; i < n; i++) {
            x[i] += 0.5 * vx[i];
            y[i] += 0.5 * vy[i];
            this.boundary.applyPosition(store, i, this);
        }

        if (this.boundary.filterParticles) {
            this.boundary.filterParticles(store, this);
        }

        // ── Recompute conservative forces at new positions ────────────
        store.resetForces();
        for (const force of this.forces) {
            if (force.enabled === false || force.isLangevin) continue;
            force.apply(store, this, context);
        }

        // ── B: second half-kick + guards ─────────────────────────────
        const maxSpeed2 = this.maxSpeed * this.maxSpeed;
        const n2 = store.count; // may differ after filterParticles
        for (let i = 0; i < n2; i++) {
            vx[i] += 0.5 * fx[i] / mass[i];
            vy[i] += 0.5 * fy[i] / mass[i];

            if (!isFinite(vx[i]) || !isFinite(vy[i])) { vx[i] = 0; vy[i] = 0; }

            const s2 = vx[i] * vx[i] + vy[i] * vy[i];
            if (s2 > maxSpeed2) {
                const inv = this.maxSpeed / Math.sqrt(s2);
                vx[i] *= inv; vy[i] *= inv;
            }
        }
    }
}
