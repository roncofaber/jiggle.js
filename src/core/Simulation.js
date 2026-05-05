import { Particle }          from './Particle.js';
import { PeriodicBoundary }  from '../boundaries/PeriodicBoundary.js';

export class Simulation {
    constructor({ count = 60, width = 800, height = 600, boundary = new PeriodicBoundary() } = {}) {
        this.width    = width;
        this.height   = height;
        this.boundary = boundary;
        this.forces   = [];
        this.particles = Array.from({ length: count }, () => this._mkParticle());
    }

    _mkParticle(species = 'default') {
        const radius = Math.random() * 2 + 1.2;
        return new Particle({
            x:  Math.random() * this.width,
            y:  Math.random() * this.height,
            vx: (Math.random() - 0.5) * 0.56,
            vy: (Math.random() - 0.5) * 0.56,
            radius,
            species,
        });
    }

    static fromMixture(groups, { width = 800, height = 600, boundary } = {}) {
        const sim = new Simulation({ count: 0, width, height, ...(boundary && { boundary }) });
        const total = groups.reduce((s, g) => s + g.count, 0);

        // Jittered grid — prevents LJ blowup from overlapping random starts
        const cols = Math.ceil(Math.sqrt(total * width / height));
        const rows = Math.ceil(total / cols);
        const cellW = width / cols;
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
        // Shuffle so species are spatially mixed rather than block-separated
        for (let i = positions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [positions[i], positions[j]] = [positions[j], positions[i]];
        }

        let idx = 0;
        for (const { species, count, radius, radiusMin, radiusMax } of groups) {
            for (let i = 0; i < count; i++) {
                const r = radius
                    ?? (radiusMin !== undefined
                        ? radiusMin + Math.random() * ((radiusMax ?? radiusMin) - radiusMin)
                        : Math.random() * 2 + 1.2);
                const [x, y] = positions[idx++] ?? [Math.random() * width, Math.random() * height];
                sim.particles.push(new Particle({
                    x, y,
                    vx: (Math.random() - 0.5) * 0.56,
                    vy: (Math.random() - 0.5) * 0.56,
                    radius: r,
                    species,
                }));
            }
        }
        return sim;
    }

    resize(width, height) {
        this.width  = width;
        this.height = height;
    }

    addForce(force) {
        this.forces.push(force);
        return this;
    }

    removeForce(force) {
        this.forces = this.forces.filter(f => f !== force);
        return this;
    }

    step(context = {}) {
        for (const p of this.particles) p.resetForces();

        for (const force of this.forces) {
            force.apply(this.particles, this, context);
        }

        for (const p of this.particles) {
            p.vx += p.fx / p.mass;
            p.vy += p.fy / p.mass;

            p.x += p.vx;
            p.y += p.vy;

            this.boundary.applyPosition(p, this);
        }

        if (this.boundary.filterParticles) {
            this.particles = this.boundary.filterParticles(this.particles, this);
        }
    }
}
