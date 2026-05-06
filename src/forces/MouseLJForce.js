// LJ interaction between the cursor (virtual particle) and all real particles.
// Particles within sigma*cutoffMult are attracted; those closer than ~1.12*sigma are repelled.
export class MouseLJForce {
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
