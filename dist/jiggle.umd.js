(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
    typeof define === 'function' && define.amd ? define(['exports'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.Jiggle = {}));
})(this, (function (exports) { 'use strict';

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

    class PeriodicBoundary {
        applyPosition(p, sim) {
            p.x = ((p.x % sim.width)  + sim.width)  % sim.width;
            p.y = ((p.y % sim.height) + sim.height) % sim.height;
        }

        minImage(dx, dy, sim) {
            return [
                dx - sim.width  * Math.round(dx / sim.width),
                dy - sim.height * Math.round(dy / sim.height),
            ];
        }
    }

    class Simulation {
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

    // Langevin thermostat: friction damping + Gaussian noise
    function randG() {
        let u, v;
        do { u = Math.random(); } while (u === 0);
        do { v = Math.random(); } while (v === 0);
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    class ThermalForce {
        constructor({ friction = 0.004, strength = 0.022 } = {}) {
            this.friction = friction;
            this.strength = strength;
        }

        apply(particles) {
            for (const p of particles) {
                const invSqrtM = 1 / Math.sqrt(p.mass);
                p.vx = p.vx * (1 - this.friction) + randG() * this.strength * invSqrtM;
                p.vy = p.vy * (1 - this.friction) + randG() * this.strength * invSqrtM;
            }
        }
    }

    // Pairwise soft repulsion between all particles
    class RepulsionForce {
        constructor({ dist = 45, strength = 0.06 } = {}) {
            this.dist     = dist;
            this.strength = strength;
        }

        apply(particles, sim) {
            const dist2 = this.dist * this.dist;
            const bc    = sim?.boundary;

            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    let dx = particles[i].x - particles[j].x;
                    let dy = particles[i].y - particles[j].y;
                    if (bc) [dx, dy] = bc.minImage(dx, dy, sim);
                    const d2 = dx * dx + dy * dy;
                    if (d2 === 0 || d2 >= dist2) continue;

                    const d  = Math.sqrt(d2);
                    const f  = (1 - d / this.dist) * this.strength / d;
                    particles[i].fx += f * dx;
                    particles[i].fy += f * dy;
                    particles[j].fx -= f * dx;
                    particles[j].fy -= f * dy;
                }
            }
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

        setPosition(x, y) {
            this.x = x;
            this.y = y;
        }

        clear() {
            this.x = null;
            this.y = null;
        }

        apply(particles) {
            if (this.x === null) return;
            const mx    = this.x, my = this.y;
            const dist2 = this.dist * this.dist;

            for (const p of particles) {
                const dx = p.x - mx;
                const dy = p.y - my;
                const d2 = dx * dx + dy * dy;
                if (d2 === 0 || d2 >= dist2) continue;

                const d = Math.sqrt(d2);
                const f = (1 - d / this.dist) * this.strength / d;
                p.fx += f * dx;
                p.fy += f * dy;
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

        apply(particles) {
            if (this.x === null) return;
            const { epsilon, sigma } = this;
            const cutoff  = sigma * this.cutoffMult;
            const cutoff2 = cutoff * cutoff;
            const mx = this.x, my = this.y;

            const minD  = sigma * 0.9;
            const minD2 = minD * minD;

            for (const p of particles) {
                const dx = p.x - mx;
                const dy = p.y - my;
                const d2 = dx * dx + dy * dy;
                if (d2 === 0 || d2 >= cutoff2) continue;

                // Clamp to minD so the r^-12 term can't blow up when cursor teleports
                const d2eff = Math.max(d2, minD2);
                const sr6   = (sigma * sigma / d2eff) ** 3;
                const f     = 24 * epsilon / d2eff * (2 * sr6 * sr6 - sr6);
                p.fx += f * dx;
                p.fy += f * dy;
            }
        }
    }

    // Constant downward (or directional) gravity
    class GravityForce {
        constructor({ gx = 0, gy = 0.05 } = {}) {
            this.gx = gx;
            this.gy = gy;
        }

        apply(particles) {
            for (const p of particles) {
                p.fx += this.gx * p.mass;
                p.fy += this.gy * p.mass;
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

    // Lennard-Jones 12-6 pair potential: attractive well + repulsive core
    // f = 24ε/r² [2(σ/r)¹² − (σ/r)⁶], folding 1/r into the unit vector
    class LJForce {
        constructor({ species = {}, cutoffMult = 2.5, overrides = {} } = {}) {
            const names = Object.keys(species);
            const n     = names.length;

            // species string → integer index
            this._si = Object.fromEntries(names.map((s, i) => [s, i]));
            this._n  = n;

            // flat n×n array of pre-computed pair params
            this._fp = new Array(n * n).fill(null);
            for (let i = 0; i < n; i++) {
                for (let j = i; j < n; j++) {
                    const key = pairKey(names[i], names[j]);
                    const raw = key in overrides ? overrides[key] : ljMix(species[names[i]], species[names[j]]);
                    const rc  = cutoffMult * raw.sigma;
                    const entry = {
                        sigma2: raw.sigma * raw.sigma,
                        f24:    24 * raw.epsilon,
                        rc2:    rc * rc,
                    };
                    this._fp[i * n + j] = entry;
                    this._fp[j * n + i] = entry;
                }
            }

            this._typeOf = null; // Int32Array cache, reused across frames
        }

        apply(particles, sim) {
            const { _si: si, _fp: fp, _n: n } = this;
            const len = particles.length;
            const bc  = sim?.boundary;

            // Build/reuse per-particle type index array (O(n) map lookups once per frame)
            if (!this._typeOf || this._typeOf.length < len) this._typeOf = new Int32Array(len);
            const typeOf = this._typeOf;
            for (let k = 0; k < len; k++) typeOf[k] = si[particles[k].species] ?? -1;

            for (let i = 0; i < len; i++) {
                const ti = typeOf[i];
                if (ti < 0) continue;
                const pi = particles[i];

                for (let j = i + 1; j < len; j++) {
                    const tj = typeOf[j];
                    if (tj < 0) continue;
                    const p = fp[ti * n + tj];
                    if (!p) continue;

                    const pj = particles[j];
                    let dx = pi.x - pj.x;
                    let dy = pi.y - pj.y;
                    if (bc) [dx, dy] = bc.minImage(dx, dy, sim);
                    const d2 = dx * dx + dy * dy;
                    if (d2 === 0 || d2 >= p.rc2) continue;

                    const sr  = p.sigma2 / d2; // (σ/r)²
                    const sr3 = sr * sr * sr;   // (σ/r)⁶
                    const sr6 = sr3 * sr3;      // (σ/r)¹²
                    const f   = p.f24 / d2 * (2 * sr6 - sr3);
                    pi.fx += f * dx;
                    pi.fy += f * dy;
                    pj.fx -= f * dx;
                    pj.fy -= f * dy;
                }
            }
        }
    }

    // Morse pair potential: softer repulsion than LJ, asymmetric well
    // V(r) = De[(1 - e^{-a(r-re)})² - 1],  F = -dV/dr projected along pair vector
    class MorseForce {
        constructor({ species = {}, cutoffMult = 4.0, overrides = {} } = {}) {
            const names = Object.keys(species);
            const n     = names.length;

            this._si = Object.fromEntries(names.map((s, i) => [s, i]));
            this._n  = n;

            this._fp = new Array(n * n).fill(null);
            for (let i = 0; i < n; i++) {
                for (let j = i; j < n; j++) {
                    const key = pairKey(names[i], names[j]);
                    const raw = key in overrides ? overrides[key] : morseMix(species[names[i]], species[names[j]]);
                    const rc  = raw.re * cutoffMult;
                    const entry = {
                        De:  raw.De,
                        re:  raw.re,
                        a:   raw.a,
                        rc2: rc * rc,
                        a2De: 2 * raw.a * raw.De,
                    };
                    this._fp[i * n + j] = entry;
                    this._fp[j * n + i] = entry;
                }
            }

            this._typeOf = null;
        }

        apply(particles) {
            const { _si: si, _fp: fp, _n: n } = this;
            const len = particles.length;

            if (!this._typeOf || this._typeOf.length < len) this._typeOf = new Int32Array(len);
            const typeOf = this._typeOf;
            for (let k = 0; k < len; k++) typeOf[k] = si[particles[k].species] ?? -1;

            for (let i = 0; i < len; i++) {
                const ti = typeOf[i];
                if (ti < 0) continue;
                const pi = particles[i];

                for (let j = i + 1; j < len; j++) {
                    const tj = typeOf[j];
                    if (tj < 0) continue;
                    const p = fp[ti * n + tj];
                    if (!p) continue;

                    const pj = particles[j];
                    const dx = pi.x - pj.x;
                    const dy = pi.y - pj.y;
                    const d2 = dx * dx + dy * dy;
                    if (d2 === 0 || d2 >= p.rc2) continue;

                    const d     = Math.sqrt(d2);
                    const eterm = Math.exp(-p.a * (d - p.re));
                    // f > 0 when r < re (repulsive), f < 0 when r > re (attractive)
                    const f = -p.a2De * (1 - eterm) * eterm / d;
                    pi.fx += f * dx;
                    pi.fy += f * dy;
                    pj.fx -= f * dx;
                    pj.fy -= f * dy;
                }
            }
        }
    }

    class CanvasRenderer {
        constructor(canvas, {
            dotColor      = 'rgba(0,180,150,',
            lineColor     = 'rgba(0,160,140,',
            mouseColor    = 'rgba(168,96,14,',
            linkDist      = 130,
            mouseLinkDist = 160,
            colorMap      = {},
            drawParticle  = null, // (ctx, p) => void — custom particle drawing
            drawLink      = null, // (ctx, pi, pj, alpha) => void — custom link drawing
            drawMouseLink = null, // (ctx, p, mouse, alpha) => void
            drawMouseNode = null, // (ctx, mouse) => void
        } = {}) {
            this.canvas        = canvas;
            this.ctx           = canvas.getContext('2d');
            this.dotColor      = dotColor;
            this.lineColor     = lineColor;
            this.mouseColor    = mouseColor;
            this.linkDist      = linkDist;
            this.mouseLinkDist = mouseLinkDist;
            this.colorMap      = colorMap;
            this.drawParticle  = drawParticle;
            this.drawLink      = drawLink;
            this.drawMouseLink = drawMouseLink;
            this.drawMouseNode = drawMouseNode;
        }

        _defaultDrawLink(ctx, pi, pj, alpha) {
            ctx.beginPath();
            ctx.strokeStyle = this.lineColor + alpha + ')';
            ctx.lineWidth   = 0.8;
            ctx.moveTo(pi.x, pi.y);
            ctx.lineTo(pj.x, pj.y);
            ctx.stroke();
        }

        _defaultDrawMouseLink(ctx, p, mouse, alpha) {
            ctx.beginPath();
            ctx.strokeStyle = this.mouseColor + alpha + ')';
            ctx.lineWidth   = 1;
            ctx.moveTo(mouse.x, mouse.y);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
        }

        _defaultDrawMouseNode(ctx, mouse) {
            ctx.beginPath();
            ctx.arc(mouse.x, mouse.y, 3, 0, Math.PI * 2);
            ctx.fillStyle = this.mouseColor + '0.85)';
            ctx.fill();
        }

        _defaultDrawParticle(ctx, p) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fillStyle = (this.colorMap[p.species] ?? this.dotColor) + '0.7)';
            ctx.fill();
        }

        render(particles, mouse = { x: null, y: null }) {
            const { ctx, canvas } = this;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const drawLink      = this.drawLink      ?? ((c, pi, pj, a) => this._defaultDrawLink(c, pi, pj, a));
            const drawMouseLink = this.drawMouseLink ?? ((c, p, m, a)   => this._defaultDrawMouseLink(c, p, m, a));
            const drawMouseNode = this.drawMouseNode ?? ((c, m)          => this._defaultDrawMouseNode(c, m));
            const drawParticle  = this.drawParticle  ?? ((c, p)          => this._defaultDrawParticle(c, p));

            // Inter-particle links
            const linkDist2 = this.linkDist * this.linkDist;
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const d2 = dx * dx + dy * dy;
                    if (d2 >= linkDist2) continue;

                    const alpha = (1 - Math.sqrt(d2) / this.linkDist) * 0.5;
                    drawLink(ctx, particles[i], particles[j], alpha);
                }
            }

            // Mouse links
            if (mouse.x !== null) {
                const mouseLinkDist2 = this.mouseLinkDist * this.mouseLinkDist;
                for (const p of particles) {
                    const dx = p.x - mouse.x;
                    const dy = p.y - mouse.y;
                    const d2 = dx * dx + dy * dy;
                    if (d2 >= mouseLinkDist2) continue;

                    const alpha = (1 - Math.sqrt(d2) / this.mouseLinkDist) * 0.7;
                    drawMouseLink(ctx, p, mouse, alpha);
                }
                drawMouseNode(ctx, mouse);
            }

            // Particles
            for (const p of particles) drawParticle(ctx, p);
        }
    }

    class ReflectiveBoundary {
        applyPosition(p, sim) {
            if (p.x < 0)              { p.x = -p.x;                  p.vx =  Math.abs(p.vx); }
            else if (p.x > sim.width) { p.x = 2 * sim.width  - p.x;  p.vx = -Math.abs(p.vx); }
            if (p.y < 0)              { p.y = -p.y;                   p.vy =  Math.abs(p.vy); }
            else if (p.y > sim.height){ p.y = 2 * sim.height - p.y;  p.vy = -Math.abs(p.vy); }
        }

        minImage(dx, dy) { return [dx, dy]; }
    }

    class AbsorbingBoundary {
        applyPosition() {}

        minImage(dx, dy) { return [dx, dy]; }

        filterParticles(particles, sim) {
            return particles.filter(p =>
                p.x >= 0 && p.x <= sim.width &&
                p.y >= 0 && p.y <= sim.height
            );
        }
    }

    exports.AbsorbingBoundary = AbsorbingBoundary;
    exports.CanvasRenderer = CanvasRenderer;
    exports.GravityForce = GravityForce;
    exports.LJForce = LJForce;
    exports.MorseForce = MorseForce;
    exports.MouseForce = MouseForce;
    exports.MouseLJForce = MouseLJForce;
    exports.Particle = Particle;
    exports.PeriodicBoundary = PeriodicBoundary;
    exports.ReflectiveBoundary = ReflectiveBoundary;
    exports.RepulsionForce = RepulsionForce;
    exports.Simulation = Simulation;
    exports.ThermalForce = ThermalForce;

}));
