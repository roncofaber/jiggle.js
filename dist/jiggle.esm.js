// Structure-of-Arrays particle container.
// Each field is a typed Float32Array; string species is a plain Array.
// Removal is O(1) swap-with-last; addition doubles capacity when full.
class ParticleStore {
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

class PeriodicBoundary {
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

// Physical constants for LAMMPS "real" unit system.
// Distance: Å  |  Time: fs  |  Energy: kcal/mol  |  Mass: amu  |  Force: kcal/(mol·Å)
const KB         = 0.001987;   // kcal / (mol·K)  — Boltzmann constant
const FORCE_CONV = 4.184e-4;   // (Å/fs)² per (kcal/mol) per amu  (= 1/mvv2e, LAMMPS real)

class Simulation {
    constructor({ count = 60, width = 800, height = 600, boundary = new PeriodicBoundary(), maxSpeed = 50, dt = 1 } = {}) {
        this.width    = width;
        this.height   = height;
        this.boundary = boundary;
        this.maxSpeed = maxSpeed;
        this.dt       = dt;
        this._fconv   = FORCE_CONV;
        this.forces   = [];
        this.store    = new ParticleStore(Math.max(count, 32));
        for (let i = 0; i < count; i++) this.store.add(this._mkDesc());
    }

    _mkDesc(species = 'default') {
        return {
            x:  Math.random() * this.width,
            y:  Math.random() * this.height,
            vx: 0,
            vy: 0,
            radius: 1.7,
            species,
        };
    }

    // ── Structured initialisers ───────────────────────────────────────

    static fromMixture(groups, { width = 800, height = 600, boundary, dt, maxSpeed } = {}) {
        const sim   = new Simulation({ count: 0, width, height, ...(boundary && { boundary }), ...(dt && { dt }), ...(maxSpeed && { maxSpeed }) });
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
        for (const { species, count, radius, radiusMin, radiusMax, radiusSampler, mass = 1.0 } of groups) {
            for (let i = 0; i < count; i++) {
                const r = radiusSampler
                    ? radiusSampler()
                    : (radius
                        ?? (radiusMin !== undefined
                            ? radiusMin + Math.random() * ((radiusMax ?? radiusMin) - radiusMin)
                            : 1.7));
                const [x, y] = positions[idx++] ?? [Math.random() * width, Math.random() * height];
                sim.store.add({ x, y, vx: 0, vy: 0, radius: r, mass, species });
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

    // Instantaneous temperature in Kelvin (2D equipartition: KE = N·kBT).
    // KE is in amu·(Å/fs)²; kB in those units = KB * FORCE_CONV.
    temperature() {
        const n = this.store.count;
        return n ? this.kineticEnergy() / (n * KB * FORCE_CONV) : 0;
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
        const n     = store.count;
        const dt    = this.dt;
        const fconv = this._fconv;

        // ── B: first half-kick ───────────────────────────────────────
        for (let i = 0; i < n; i++) {
            vx[i] += 0.5 * dt * fconv * fx[i] / mass[i];
            vy[i] += 0.5 * dt * fconv * fy[i] / mass[i];
        }

        // ── A: first half-drift ──────────────────────────────────────
        for (let i = 0; i < n; i++) {
            x[i] += 0.5 * dt * vx[i];
            y[i] += 0.5 * dt * vy[i];
        }

        // ── O: Langevin thermostat ───────────────────────────────────
        for (const force of this.forces) {
            if (force.enabled === false || !force.isLangevin) continue;
            force.apply(store, this, context);
        }

        // ── A: second half-drift + boundary ──────────────────────────
        for (let i = 0; i < n; i++) {
            x[i] += 0.5 * dt * vx[i];
            y[i] += 0.5 * dt * vy[i];
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
            vx[i] += 0.5 * dt * fconv * fx[i] / mass[i];
            vy[i] += 0.5 * dt * fconv * fy[i] / mass[i];

            if (!isFinite(vx[i]) || !isFinite(vy[i])) { vx[i] = 0; vy[i] = 0; }

            const s2 = vx[i] * vx[i] + vy[i] * vy[i];
            if (s2 > maxSpeed2) {
                const inv = this.maxSpeed / Math.sqrt(s2);
                vx[i] *= inv; vy[i] *= inv;
            }
        }
    }
}

class Particle {
    constructor({ x, y, vx = 0, vy = 0, radius = 2, mass = null, species = 'default' }) {
        this.x       = x;
        this.y       = y;
        this.vx      = vx;
        this.vy      = vy;
        this.radius  = radius;
        this.mass    = mass ?? radius * radius;
        this.species = species;
        this.fx      = 0;
        this.fy      = 0;
    }

    resetForces() {
        this.fx = 0;
        this.fy = 0;
    }
}

// Langevin thermostat — exact Ornstein-Uhlenbeck integrator for the O step of BAOAB.
// Stationary distribution: <v²> = kBT/m per component (equipartition). ✓
// FDT is enforced automatically: c2 is derived from c1 and temperature, not independent.
//
// Parameters:
//   temperature  — target temperature in Kelvin
//   gamma        — friction coefficient in 1/fs; typical range 0.001–0.1

let _spare$1 = null;
function randG$1() {
    if (_spare$1 !== null) { const s = _spare$1; _spare$1 = null; return s; }
    let u, v;
    do { u = Math.random(); } while (u === 0);
    do { v = Math.random(); } while (v === 0);
    const mag = Math.sqrt(-2 * Math.log(u));
    _spare$1 = mag * Math.sin(2 * Math.PI * v);
    return       mag * Math.cos(2 * Math.PI * v);
}

class ThermalForce {
    constructor({ temperature = 300, gamma = 0.01 } = {}) {
        this.temperature = temperature; // K
        this.gamma       = gamma;       // 1/fs
        this.isLangevin  = true;        // signals BAOAB integrator to place this in the O slot
    }

    apply(store, sim) {
        const { vx, vy, mass, count } = store;
        const kBT  = KB * this.temperature;                        // kcal/mol
        const c1   = Math.exp(-this.gamma * (sim?.dt ?? 1));
        const c2sq = (1 - c1 * c1) * kBT * (sim?._fconv ?? FORCE_CONV); // Å²/fs² (mass-free)
        for (let i = 0; i < count; i++) {
            const c2 = Math.sqrt(c2sq / mass[i]);
            vx[i] = c1 * vx[i] + c2 * randG$1();
            vy[i] = c1 * vy[i] + c2 * randG$1();
        }
    }
}

// Berendsen thermostat — exponential velocity rescaling toward T_target.
// Not a true canonical ensemble (kinetic energy fluctuations are suppressed),
// but smooth and widely used for equilibration. Coupling time tau controls
// how aggressively the thermostat drives the system toward T_target.
//
// Parameters:
//   temperature  — target temperature in Kelvin
//   tau          — coupling time in fs; larger = weaker coupling

class BerendsenForce {
    constructor({ temperature = 300, tau = 100 } = {}) {
        this.temperature = temperature; // K
        this.tau         = tau;         // fs
        this.isLangevin  = true;
        this.enabled     = false;
    }

    apply(store, sim) {
        const { vx, vy, mass, count } = store;
        const dt = sim?.dt ?? 1;
        let KE = 0;
        for (let i = 0; i < count; i++) KE += 0.5 * mass[i] * (vx[i] * vx[i] + vy[i] * vy[i]);
        if (KE < 1e-30) return;
        const KE_target = count * KB * this.temperature * FORCE_CONV; // [amu·(Å/fs)²]
        const lam = Math.sqrt(Math.max(0, 1 + (dt / this.tau) * (KE_target / KE - 1)));
        for (let i = 0; i < count; i++) { vx[i] *= lam; vy[i] *= lam; }
    }
}

// Andersen thermostat — stochastic collision model.
// At rate nu (1/fs), each particle's velocity is redrawn from Maxwell-Boltzmann
// at T_target. Produces the correct canonical ensemble but disrupts velocity
// autocorrelation (not suitable for transport property measurements).
//
// Parameters:
//   temperature  — target temperature in Kelvin
//   nu           — collision frequency in 1/fs; higher = tighter temperature control

let _spare = null;
function randG() {
    if (_spare !== null) { const s = _spare; _spare = null; return s; }
    let u, v;
    do { u = Math.random(); } while (u === 0);
    do { v = Math.random(); } while (v === 0);
    const mag = Math.sqrt(-2 * Math.log(u));
    _spare = mag * Math.sin(2 * Math.PI * v);
    return       mag * Math.cos(2 * Math.PI * v);
}

class AndersenForce {
    constructor({ temperature = 300, nu = 0.01 } = {}) {
        this.temperature = temperature; // K
        this.nu          = nu;          // 1/fs
        this.isLangevin  = true;
        this.enabled     = false;
    }

    apply(store, sim) {
        const { vx, vy, mass, count } = store;
        const dt     = sim?.dt ?? 1;
        const kBT_fc = KB * this.temperature * FORCE_CONV; // [amu·Å²/fs²]
        const p      = Math.min(1, this.nu * dt);
        for (let i = 0; i < count; i++) {
            if (Math.random() < p) {
                const sig = Math.sqrt(kBT_fc / mass[i]);
                vx[i] = sig * randG();
                vy[i] = sig * randG();
            }
        }
    }
}

// Nosé-Hoover thermostat — deterministic extended-system thermostat.
// Adds a heat-bath degree of freedom xi (friction, 1/fs) coupled to the kinetic
// energy. Produces the correct canonical ensemble while preserving deterministic
// dynamics. Parameterised by relaxation time tau (fs);
// thermostat mass Q = N_f · kBT · tau².
//
// Integration: v-NHVE at the O slot of BAOAB —
//   1. scale v by exp(-xi · dt/2)
//   2. recompute KE, then xi += dt · (2·KE − N_f·kBT_amu) / Q
//   3. scale v by exp(-xi · dt/2)
//
// Parameters:
//   temperature  — target temperature in Kelvin
//   tau          — relaxation time in fs; characteristic oscillation period ≈ 2π·tau

class NoseHooverForce {
    constructor({ temperature = 300, tau = 100 } = {}) {
        this.temperature = temperature; // K
        this.tau         = tau;         // fs
        this.xi          = 0;           // thermostat friction, 1/fs
        this.isLangevin  = true;
        this.enabled     = false;
    }

    apply(store, sim) {
        const { vx, vy, mass, count } = store;
        const dt    = sim?.dt ?? 1;
        const Nf    = 2 * count;                           // DOF in 2D
        const kBT_a = KB * this.temperature * FORCE_CONV; // kBT in [amu·Å²/fs²]
        const Q     = Nf * kBT_a * this.tau * this.tau;   // thermostat mass [amu·Å²]

        // first half-friction kick
        const s1 = Math.exp(-this.xi * 0.5 * dt);
        for (let i = 0; i < count; i++) { vx[i] *= s1; vy[i] *= s1; }

        // update xi from current KE
        let KE = 0;
        for (let i = 0; i < count; i++) KE += 0.5 * mass[i] * (vx[i] * vx[i] + vy[i] * vy[i]);
        this.xi += dt * (2 * KE - Nf * kBT_a) / Q;

        // second half-friction kick
        const s2 = Math.exp(-this.xi * 0.5 * dt);
        for (let i = 0; i < count; i++) { vx[i] *= s2; vy[i] *= s2; }
    }
}

// Uniform cell list for O(n) spatial neighbour queries.
// build() assigns particle indices to grid cells; forEachPair() visits each
// unique pair exactly once using the half-space neighbour stencil.
class CellGrid {
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

// Pairwise soft repulsion between all particles
class RepulsionForce {
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

// Repels particles away from the mouse cursor
class MouseForce {
    constructor({ dist = 120, strength = 0.06 } = {}) {
        this.dist     = dist;
        this.strength = strength;
        this.x        = null;
        this.y        = null;
    }

    setPosition(x, y) { this.x = x; this.y = y; }
    clear()            { this.x = null; this.y = null; }

    apply(store) {
        if (this.x === null) return;
        const { x, y, fx, fy, count } = store;
        const mx    = this.x, my = this.y;
        const dist  = this.dist;
        const dist2 = dist * dist;
        const str   = this.strength;

        for (let i = 0; i < count; i++) {
            const dx = x[i] - mx;
            const dy = y[i] - my;
            const d2 = dx * dx + dy * dy;
            if (d2 === 0 || d2 >= dist2) continue;

            const d = Math.sqrt(d2);
            const f = (1 - d / dist) * str / d;
            fx[i] += f * dx;
            fy[i] += f * dy;
        }
    }
}

// LJ interaction between the cursor (virtual particle) and all real particles.
// Particles within sigma*cutoffMult are attracted; those closer than ~1.12*sigma are repelled.
class MouseLJForce {
    constructor({ epsilon = 0.002, sigma = 50, cutoffMult = 2.5 } = {}) {
        this.epsilon    = epsilon;
        this.sigma      = sigma;
        this.cutoffMult = cutoffMult;
        this.x          = null;
        this.y          = null;
    }

    setPosition(x, y) { this.x = x; this.y = y; }
    clear()            { this.x = null; this.y = null; }

    apply(store) {
        if (this.x === null) return;
        const { x, y, fx, fy, count } = store;
        const { epsilon, sigma } = this;
        const cutoff  = sigma * this.cutoffMult;
        const cutoff2 = cutoff * cutoff;
        const mx = this.x, my = this.y;
        const minD2 = (sigma * 0.9) ** 2;

        for (let i = 0; i < count; i++) {
            const dx = x[i] - mx;
            const dy = y[i] - my;
            const d2 = dx * dx + dy * dy;
            if (d2 === 0 || d2 >= cutoff2) continue;

            const d2eff = Math.max(d2, minD2);
            const sr6   = (sigma * sigma / d2eff) ** 3;
            const f     = 24 * epsilon / d2eff * (2 * sr6 * sr6 - sr6);
            fx[i] += f * dx;
            fy[i] += f * dy;
        }
    }
}

// Constant directional gravity. gx/gy are accelerations in Å/fs².
// Internally scales to kcal/(mol·Å) via FORCE_CONV so the BAOAB integrator
// produces the correct acceleration regardless of particle mass.

class GravityForce {
    constructor({ gx = 0, gy = 0 } = {}) {
        this.gx = gx; // Å/fs²
        this.gy = gy; // Å/fs²
    }

    apply(store) {
        const { fx, fy, mass, count } = store;
        const { gx, gy } = this;
        for (let i = 0; i < count; i++) {
            fx[i] += gx * mass[i] / FORCE_CONV;
            fy[i] += gy * mass[i] / FORCE_CONV;
        }
    }
}

function pairKey(a, b) {
    return a <= b ? `${a}-${b}` : `${b}-${a}`;
}

// Lorentz-Berthelot: sigma arithmetic, epsilon geometric
function ljMix(pA, pB) {
    return {
        sigma:   (pA.sigma + pB.sigma) / 2,
        epsilon: Math.sqrt(pA.epsilon * pB.epsilon),
    };
}

// Morse: De geometric, re arithmetic, a geometric
function morseMix(pA, pB) {
    return {
        De: Math.sqrt(pA.De * pB.De),
        re: (pA.re + pB.re) / 2,
        a:  Math.sqrt(pA.a * pB.a),
    };
}

// Lennard-Jones 12-6 pair potential with shifted potential (V(rc) = 0).
// f = 24ε/r² [2(σ/r)¹² − (σ/r)⁶], folding 1/r into the unit vector
class LJForce {
    constructor({ species = {}, cutoffMult = 2.5, cutoff = null, minDistMult = 0.5, overrides = {} } = {}) {
        const names = Object.keys(species);
        const n     = names.length;

        this._si = Object.fromEntries(names.map((s, i) => [s, i]));
        this._n  = n;

        this._fp = new Array(n * n).fill(null);
        let maxRc = 0;
        for (let i = 0; i < n; i++) {
            for (let j = i; j < n; j++) {
                const key = pairKey(names[i], names[j]);
                const raw = key in overrides ? overrides[key] : ljMix(species[names[i]], species[names[j]]);
                const rc  = cutoff ?? cutoffMult * raw.sigma;
                if (rc > maxRc) maxRc = rc;
                const minD = minDistMult * raw.sigma;
                // Shifted potential: subtract V(rc) so energy → 0 continuously at cutoff.
                const src  = raw.sigma / rc;
                const src6 = (src * src * src) * (src * src * src);
                const entry = {
                    sigma2:  raw.sigma * raw.sigma,
                    f24:     24 * raw.epsilon,
                    rc2:     rc * rc,
                    minD2:   minD * minD,
                    V_shift: 4 * raw.epsilon * (src6 * src6 - src6),
                };
                this._fp[i * n + j] = entry;
                this._fp[j * n + i] = entry;
            }
        }

        this._maxRc  = maxRc;
        this._typeOf = null;
        this._grid   = new CellGrid();
    }

    potentialEnergy(store, sim) {
        const { _si: si, _fp: fp, _n: n, _maxRc: maxRc } = this;
        const { x, y, species, count } = store;
        const bc       = sim?.boundary;
        const periodic = bc?.isPeriodic ?? false;
        let   pe       = 0;
        this._grid.build(store, maxRc, sim.width, sim.height);
        this._grid.forEachPair(count, (i, j) => {
            const ti = si[species[i]] ?? -1; if (ti < 0) return;
            const tj = si[species[j]] ?? -1; if (tj < 0) return;
            const p  = fp[ti * n + tj]; if (!p) return;
            let dx = x[i] - x[j];
            let dy = y[i] - y[j];
            if (periodic) { const mi = bc.minImage(dx, dy, sim); dx = mi[0]; dy = mi[1]; }
            const d2 = dx * dx + dy * dy;
            if (d2 === 0 || d2 >= p.rc2) return;
            const d2eff = d2 < p.minD2 ? p.minD2 : d2;
            const sr    = p.sigma2 / d2eff;
            const sr3   = sr * sr * sr;
            const sr6   = sr3 * sr3;
            pe += (p.f24 / 6) * (sr6 - sr3) - p.V_shift; // 4ε[(σ/r)¹²-(σ/r)⁶] - V(rc)
        }, periodic);
        return pe;
    }

    apply(store, sim) {
        const { _si: si, _fp: fp, _n: n, _maxRc: maxRc } = this;
        const { x, y, fx, fy, species, count } = store;
        const bc       = sim?.boundary;
        const periodic = bc?.isPeriodic ?? false;

        if (!this._typeOf || this._typeOf.length < count) this._typeOf = new Int32Array(count);
        const typeOf = this._typeOf;
        for (let k = 0; k < count; k++) typeOf[k] = si[species[k]] ?? -1;

        this._grid.build(store, maxRc, sim.width, sim.height);

        this._grid.forEachPair(count, (i, j) => {
            const ti = typeOf[i]; if (ti < 0) return;
            const tj = typeOf[j]; if (tj < 0) return;
            const p  = fp[ti * n + tj]; if (!p) return;

            let dx = x[i] - x[j];
            let dy = y[i] - y[j];
            if (periodic) {
                const mi = bc.minImage(dx, dy, sim);
                dx = mi[0]; dy = mi[1];
            }
            const d2 = dx * dx + dy * dy;
            if (d2 === 0 || d2 >= p.rc2) return;

            const d2eff = d2 < p.minD2 ? p.minD2 : d2;
            const sr    = p.sigma2 / d2eff;
            const sr3   = sr * sr * sr;
            const sr6   = sr3 * sr3;
            const f     = p.f24 / d2eff * (2 * sr6 - sr3);
            fx[i] += f * dx;  fy[i] += f * dy;
            fx[j] -= f * dx;  fy[j] -= f * dy;
        }, periodic);
    }
}

// Morse pair potential: softer repulsion than LJ, asymmetric well
// V(r) = De[(1 - e^{-a(r-re)})² - 1],  F = -dV/dr projected along pair vector
class MorseForce {
    constructor({ species = {}, cutoffMult = 4.0, minDistMult = 0.3, overrides = {} } = {}) {
        const names = Object.keys(species);
        const n     = names.length;

        this._si = Object.fromEntries(names.map((s, i) => [s, i]));
        this._n  = n;

        this._fp = new Array(n * n).fill(null);
        let maxRc = 0;
        for (let i = 0; i < n; i++) {
            for (let j = i; j < n; j++) {
                const key = pairKey(names[i], names[j]);
                const raw = key in overrides ? overrides[key] : morseMix(species[names[i]], species[names[j]]);
                const rc  = raw.re * cutoffMult;
                if (rc > maxRc) maxRc = rc;
                const minD  = minDistMult * raw.re;
                const entry = {
                    De:    raw.De,
                    re:    raw.re,
                    a:     raw.a,
                    rc2:   rc * rc,
                    minD2: minD * minD,
                    a2De:  2 * raw.a * raw.De,
                };
                this._fp[i * n + j] = entry;
                this._fp[j * n + i] = entry;
            }
        }

        this._maxRc  = maxRc;
        this._typeOf = null;
        this._grid   = new CellGrid();
    }

    apply(store, sim) {
        const { _si: si, _fp: fp, _n: n, _maxRc: maxRc } = this;
        const { x, y, fx, fy, species, count } = store;
        const bc       = sim?.boundary;
        const periodic = bc?.isPeriodic ?? false;

        if (!this._typeOf || this._typeOf.length < count) this._typeOf = new Int32Array(count);
        const typeOf = this._typeOf;
        for (let k = 0; k < count; k++) typeOf[k] = si[species[k]] ?? -1;

        this._grid.build(store, maxRc, sim.width, sim.height);

        this._grid.forEachPair(count, (i, j) => {
            const ti = typeOf[i]; if (ti < 0) return;
            const tj = typeOf[j]; if (tj < 0) return;
            const p  = fp[ti * n + tj]; if (!p) return;

            let dx = x[i] - x[j];
            let dy = y[i] - y[j];
            if (periodic) {
                const mi = bc.minImage(dx, dy, sim);
                dx = mi[0]; dy = mi[1];
            }
            const d2 = dx * dx + dy * dy;
            if (d2 === 0 || d2 >= p.rc2) return;

            const d     = Math.sqrt(d2 < p.minD2 ? p.minD2 : d2);
            const eterm = Math.exp(-p.a * (d - p.re));
            const f     = -p.a2De * (1 - eterm) * eterm / d;
            fx[i] += f * dx;  fy[i] += f * dy;
            fx[j] -= f * dx;  fy[j] -= f * dy;
        }, periodic);
    }
}

// Harmonic spring between explicitly bonded particle index pairs.
// bonds: [[i, j, restLength?], ...]  — restLength defaults to current distance at construction
// Includes optional velocity damping along the bond axis to prevent oscillation.
class SpringForce {
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

// Point gravity well at a fixed (x, y).  All particles are pulled toward it with
// force proportional to mass (so all species accelerate equally, like gravity).
// falloff controls the radial power-law: 1 = inverse-r, 2 = inverse-square.
class AttractorForce {
    constructor({ x = 0, y = 0, strength = 0.05, falloff = 1, minDist = 10 } = {}) {
        this.x        = x;
        this.y        = y;
        this.strength = strength;
        this.falloff  = falloff;
        this.minDist  = minDist;
    }

    apply(store) {
        const { x, y, fx, fy, mass, count } = store;
        const { x: ax, y: ay, strength, falloff, minDist } = this;
        const minD2 = minDist * minDist;

        for (let i = 0; i < count; i++) {
            const dx = ax - x[i];
            const dy = ay - y[i];
            const d2 = Math.max(minD2, dx * dx + dy * dy);
            const d  = Math.sqrt(d2);
            const f  = strength * mass[i] * Math.pow(d, -(falloff + 1));
            fx[i] += f * dx;
            fy[i] += f * dy;
        }
    }
}

// Tangential (curl) force around a fixed centre — produces swirling without attraction.
// Positive strength = counterclockwise; negative = clockwise.
class VortexForce {
    constructor({ x = 0, y = 0, strength = 0.05, falloff = 1, minDist = 10 } = {}) {
        this.x        = x;
        this.y        = y;
        this.strength = strength;
        this.falloff  = falloff;
        this.minDist  = minDist;
    }

    apply(store) {
        const { x, y, fx, fy, count } = store;
        const { x: vx, y: vy, strength, falloff, minDist } = this;
        const minD2 = minDist * minDist;

        for (let i = 0; i < count; i++) {
            const dx = x[i] - vx;
            const dy = y[i] - vy;
            const d2 = Math.max(minD2, dx * dx + dy * dy);
            const d  = Math.sqrt(d2);
            // Tangential unit vector perpendicular to radial: (-dy, dx) / d
            const f  = strength * Math.pow(d, -(falloff + 1));
            fx[i] += f * (-dy);
            fy[i] += f * ( dx);
        }
    }
}

// Soft repulsion from box edges — a gentler alternative to ReflectiveBoundary.
// Particles feel no force beyond `margin` (Å) from a wall; force grows as a
// power law reaching `strength` (Å/fs²) at the wall itself.

class BoundaryForce {
    constructor({ margin = 30, strength = 0.05, power = 2 } = {}) {
        this.margin   = margin;   // Å
        this.strength = strength; // Å/fs² at wall (acceleration)
        this.power    = power;
    }

    apply(store, sim) {
        const { x, y, fx, fy, count } = store;
        const { margin, power } = this;
        const str       = this.strength / FORCE_CONV; // convert to kcal/(mol·Å) equivalent
        const { width, height } = sim;
        const invMargin = 1 / margin;

        for (let i = 0; i < count; i++) {
            if (x[i] < margin) {
                fx[i] += str * Math.pow((margin - x[i]) * invMargin, power);
            } else if (x[i] > width - margin) {
                fx[i] -= str * Math.pow((x[i] - (width - margin)) * invMargin, power);
            }
            if (y[i] < margin) {
                fy[i] += str * Math.pow((margin - y[i]) * invMargin, power);
            } else if (y[i] > height - margin) {
                fy[i] -= str * Math.pow((y[i] - (height - margin)) * invMargin, power);
            }
        }
    }
}

// Boid-style flocking: separation (avoid crowding), alignment (match heading),
// cohesion (steer toward group centre).  Uses CellGrid for O(n) pair detection.
class FlockForce {
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

const LINK_BUCKETS = 5;

class CanvasRenderer {
    constructor(canvas, {
        dotColor      = 'rgba(0,180,150,',
        lineColor     = 'rgba(0,160,140,',
        mouseColor    = 'rgba(168,96,14,',
        linkDist      = 10,           // Å
        mouseLinkDist = 15,           // Å
        scale         = 1,            // pixels / Å
        colorMap      = {},
        boxColor      = null, // stroke color for sim box outline, e.g. 'rgba(255,255,255,0.2)'
        drawParticle  = null, // (ctx, p) => void — custom particle drawing
        drawLink      = null, // (ctx, pi, pj, alpha) => void — custom link drawing
        drawMouseLink = null, // (ctx, p, mouse, alpha) => void  (mouse is pixel {x,y})
        drawMouseNode = null, // (ctx, mouse) => void            (mouse is pixel {x,y})
    } = {}) {
        this.canvas        = canvas;
        this.ctx           = canvas.getContext('2d');
        this.dotColor      = dotColor;
        this.lineColor     = lineColor;
        this.mouseColor    = mouseColor;
        this.linkDist      = linkDist;
        this.mouseLinkDist = mouseLinkDist;
        this.scale         = scale;
        this.viewX         = 0; // Å — viewport left edge in simulation space
        this.viewY         = 0; // Å — viewport top  edge in simulation space
        this.boxColor      = boxColor;
        this.linksEnabled      = true;
        this.mouseLinksEnabled = true;
        this.colorMap      = colorMap;

        this._drawLink        = drawLink      ?? null;
        this._drawMouseLink   = drawMouseLink ?? this._defaultDrawMouseLink.bind(this);
        this._drawMouseNode   = drawMouseNode ?? this._defaultDrawMouseNode.bind(this);
        this._drawParticle    = drawParticle  ?? null;

        this._grid    = new CellGrid();
        this._buckets = Array.from({ length: LINK_BUCKETS }, () => []);

        // Reused view objects for callbacks — avoids per-frame allocations.
        this._viewA = { x: 0, y: 0, radius: 0, species: '', vx: 0, vy: 0 };
        this._viewB = { x: 0, y: 0, radius: 0, species: '', vx: 0, vy: 0 };
    }

    _fillView(v, store, i) {
        v.x       = store.x[i];
        v.y       = store.y[i];
        v.radius  = store.radius[i];
        v.species = store.species[i];
        v.vx      = store.vx[i];
        v.vy      = store.vy[i];
    }

    // Å → pixel helpers accounting for viewport offset
    _px(ax) { return (ax - this.viewX) * this.scale; }
    _py(ay) { return (ay - this.viewY) * this.scale; }

    _defaultDrawMouseLink(ctx, p, mouse, alpha) {
        ctx.beginPath();
        ctx.strokeStyle = this.mouseColor + alpha + ')';
        ctx.lineWidth   = 1;
        ctx.moveTo(mouse.x, mouse.y);                       // mouse is in pixels
        ctx.lineTo(this._px(p.x), this._py(p.y));           // particle in Å → pixels
        ctx.stroke();
    }

    _defaultDrawMouseNode(ctx, mouse) {
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = this.mouseColor + '0.85)';
        ctx.fill();
    }

    _defaultDrawParticle(ctx, store, i) {
        ctx.beginPath();
        ctx.arc(this._px(store.x[i]), this._py(store.y[i]), store.radius[i] * this.scale, 0, Math.PI * 2);
        ctx.fillStyle = (this.colorMap[store.species[i]] ?? this.dotColor) + '0.7)';
        ctx.fill();
    }

    // store: ParticleStore.
    // mouse: { x, y } in PIXELS (or { x: null } when absent).
    // sim: optional Simulation — used for box size and periodic boundary.
    render(store, mouse = { x: null, y: null }, sim = null) {
        const { ctx, canvas } = this;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const scale = this.scale;
        const vX    = this.viewX;
        const vY    = this.viewY;
        const n     = store.count;

        const simW = sim ? sim.width  : canvas.width  / scale;
        const simH = sim ? sim.height : canvas.height / scale;

        // Simulation box outline
        if (this.boxColor) {
            ctx.strokeStyle = this.boxColor;
            ctx.lineWidth   = 1;
            ctx.strokeRect(this._px(0), this._py(0), simW * scale, simH * scale);
        }

        if (n > 1 && this.linksEnabled) {
            const { x, y } = store;
            const linkDist  = this.linkDist;
            const linkDist2 = linkDist * linkDist;
            const bc        = sim?.boundary ?? null;
            const periodic  = bc?.isPeriodic ?? false;

            this._grid.build(store, linkDist, simW, simH);

            if (!this._drawLink) {
                const buckets = this._buckets;
                for (let b = 0; b < LINK_BUCKETS; b++) buckets[b].length = 0;

                this._grid.forEachPair(n, (i, j) => {
                    const dxr = x[i] - x[j];
                    const dyr = y[i] - y[j];
                    let   dx  = dxr, dy = dyr;
                    if (periodic) {
                        const mi = bc.minImage(dxr, dyr, sim);
                        dx = mi[0]; dy = mi[1];
                    }
                    const d2 = dx * dx + dy * dy;
                    if (d2 >= linkDist2) return;

                    const alpha = (1 - Math.sqrt(d2) / linkDist) * 0.5;
                    const b     = Math.min(LINK_BUCKETS - 1, (alpha * LINK_BUCKETS / 0.5) | 0);
                    const bkt   = buckets[b];

                    // Store in Å; offset applied when drawing
                    bkt.push(x[i], y[i], x[i] - dx, y[i] - dy);

                    if (periodic && (Math.abs(dx - dxr) + Math.abs(dy - dyr) > 1e-10)) {
                        bkt.push(x[j] + dx, y[j] + dy, x[j], y[j]);
                    }
                }, periodic);

                ctx.lineWidth = Math.max(0.8, this.scale * 0.5);
                for (let b = 0; b < LINK_BUCKETS; b++) {
                    const bkt = buckets[b];
                    if (!bkt.length) continue;
                    ctx.beginPath();
                    ctx.strokeStyle = this.lineColor + ((b + 1) / LINK_BUCKETS * 0.7) + ')';
                    for (let k = 0; k < bkt.length; k += 4) {
                        ctx.moveTo((bkt[k]     - vX) * scale, (bkt[k + 1] - vY) * scale);
                        ctx.lineTo((bkt[k + 2] - vX) * scale, (bkt[k + 3] - vY) * scale);
                    }
                    ctx.stroke();
                }
            } else {
                const drawLink = this._drawLink;
                const va = this._viewA, vb = this._viewB;
                this._grid.forEachPair(n, (i, j) => {
                    const dxr = x[i] - x[j];
                    const dyr = y[i] - y[j];
                    let   dx  = dxr, dy = dyr;
                    if (periodic) {
                        const mi = bc.minImage(dxr, dyr, sim);
                        dx = mi[0]; dy = mi[1];
                    }
                    const d2 = dx * dx + dy * dy;
                    if (d2 >= linkDist2) return;

                    const alpha = (1 - Math.sqrt(d2) / linkDist) * 0.5;
                    this._fillView(va, store, i);
                    this._fillView(vb, store, j);
                    drawLink(ctx, va, vb, alpha);

                    if (periodic && (Math.abs(dx - dxr) + Math.abs(dy - dyr) > 1e-10)) {
                        vb.x = x[j] + dx; vb.y = y[j] + dy;
                        drawLink(ctx, va, vb, alpha);
                    }
                }, periodic);
            }
        }

        // Mouse links — mouse.x/y are PIXEL coords; convert to Å for distances
        if (this.mouseLinksEnabled && mouse.x !== null) {
            const { x, y } = store;
            const mx = mouse.x / scale + vX;   // pixels → Å
            const my = mouse.y / scale + vY;
            const mouseLinkDist  = this.mouseLinkDist;
            const mouseLinkDist2 = mouseLinkDist * mouseLinkDist;
            const drawMouseLink  = this._drawMouseLink;
            const va = this._viewA;
            for (let k = 0; k < n; k++) {
                const dx = x[k] - mx;
                const dy = y[k] - my;
                const d2 = dx * dx + dy * dy;
                if (d2 >= mouseLinkDist2) continue;

                const alpha = (1 - Math.sqrt(d2) / mouseLinkDist) * 0.7;
                this._fillView(va, store, k);
                drawMouseLink(ctx, va, mouse, alpha);
            }
            this._drawMouseNode(ctx, mouse);
        }

        // Particles
        const drawParticle = this._drawParticle;
        if (!drawParticle) {
            for (let k = 0; k < n; k++) this._defaultDrawParticle(ctx, store, k);
        } else {
            const va = this._viewA;
            for (let k = 0; k < n; k++) {
                this._fillView(va, store, k);
                drawParticle(ctx, va);
            }
        }
    }
}

class ReflectiveBoundary {
    isPeriodic = false;

    applyPosition(store, i, sim) {
        while (store.x[i] < 0)           { store.x[i] = -store.x[i];                  store.vx[i] =  Math.abs(store.vx[i]); }
        while (store.x[i] > sim.width)   { store.x[i] = 2 * sim.width  - store.x[i]; store.vx[i] = -Math.abs(store.vx[i]); }
        while (store.y[i] < 0)           { store.y[i] = -store.y[i];                  store.vy[i] =  Math.abs(store.vy[i]); }
        while (store.y[i] > sim.height)  { store.y[i] = 2 * sim.height - store.y[i]; store.vy[i] = -Math.abs(store.vy[i]); }
    }

    minImage(dx, dy) { return [dx, dy]; }
}

class AbsorbingBoundary {
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

export { AbsorbingBoundary, AndersenForce, AttractorForce, BerendsenForce, BoundaryForce, CanvasRenderer, CellGrid, FORCE_CONV, FlockForce, GravityForce, KB, LJForce, MorseForce, MouseForce, MouseLJForce, NoseHooverForce, Particle, ParticleStore, PeriodicBoundary, ReflectiveBoundary, RepulsionForce, Simulation, SpringForce, ThermalForce, VortexForce };
