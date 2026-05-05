# jiggle.js

Composable 2D particle physics for canvas.

```js
import { Simulation, ThermalForce, LJForce, MouseForce, CanvasRenderer } from 'jiggle.js';

const sim = Simulation.fromMixture([
    { species: 'A', count: 40, radius: 3 },
    { species: 'B', count: 20, radius: 2.5 },
], { width: 800, height: 600 });

sim.addForce(new ThermalForce({ friction: 0.004, strength: 0.022 }))
   .addForce(new LJForce({
       species: {
           A: { epsilon: 0.003, sigma: 22 },
           B: { epsilon: 0.002, sigma: 14 },
       },
   }))
   .addForce(new MouseForce({ dist: 120, strength: 0.06 }));

const renderer = new CanvasRenderer(canvas, {
    colorMap: { A: 'rgba(0,212,176,', B: 'rgba(220,100,60,' },
    linkDist: 130,
});

function loop() {
    sim.step();
    renderer.render(sim.particles, mouseForce);
    requestAnimationFrame(loop);
}
loop();
```

## Simulation

```js
// Uniform particles
const sim = new Simulation({ count: 75, width: 800, height: 600 });

// Mixed species
const sim = Simulation.fromMixture([
    { species: 'A', count: 40, radius: 3 },
    { species: 'B', count: 20, radius: 2.5 },
], { width: 800, height: 600 });
```

| Method | Description |
|--------|-------------|
| `sim.addForce(force)` | Add a force; returns `sim` for chaining |
| `sim.removeForce(force)` | Remove a force by reference |
| `sim.step(context?)` | Advance one tick: zero forces → apply all → integrate → reflect |
| `sim.resize(width, height)` | Update boundary dimensions |
| `sim.particles` | Array of `Particle` objects |

### Particle fields

| Field | Description |
|-------|-------------|
| `x`, `y` | Position (pixels) |
| `vx`, `vy` | Velocity |
| `fx`, `fy` | Accumulated force (zeroed each step) |
| `radius` | Visual and physical radius |
| `mass` | Defaults to `radius²` |
| `species` | String label (default `'default'`) |

## Forces

All forces implement `apply(particles, sim, context)`. Add them in any order; they accumulate into `p.fx`/`p.fy` (or directly into `p.vx`/`p.vy` for velocity-space forces).

### ThermalForce

Langevin thermostat — friction damping + Gaussian noise. Drives Brownian motion.

```js
new ThermalForce({ friction: 0.004, strength: 0.022 })
```

| Option | Default | Description |
|--------|---------|-------------|
| `friction` | `0.004` | Velocity damping per step |
| `strength` | `0.022` | Noise amplitude (scaled by `1/√mass`) |

### RepulsionForce

Simple O(n²) pairwise soft repulsion. Use when you don't need attraction or species differentiation.

```js
new RepulsionForce({ dist: 45, strength: 0.06 })
```

| Option | Default | Description |
|--------|---------|-------------|
| `dist` | `45` | Cutoff distance (pixels) |
| `strength` | `0.06` | Force magnitude at contact |

### LJForce

Lennard-Jones 12-6 pair potential. Has both an attractive well and a repulsive core — particles settle at an equilibrium separation of `~1.12σ`. Supports multiple species with Lorentz-Berthelot mixing rules.

```js
new LJForce({
    species: {
        A: { epsilon: 0.003, sigma: 22 },
        B: { epsilon: 0.001, sigma: 14 },
    },
    cutoffMult: 2.5,   // cutoff = cutoffMult × sigma (per pair)
    overrides: {
        'A-B': { epsilon: 0.0005, sigma: 18 }, // override auto-mixed cross params
    },
})
```

| Option | Default | Description |
|--------|---------|-------------|
| `species` | `{}` | Per-species `{ epsilon, sigma }` |
| `cutoffMult` | `2.5` | Cutoff as a multiple of σ |
| `overrides` | `{}` | Manual cross-pair params, keyed `'A-B'` |

**Mixing rules (Lorentz-Berthelot):** `σ_AB = (σ_A + σ_B) / 2`, `ε_AB = √(ε_A × ε_B)`

Typical pixel-space values: `sigma` 10–40 px, `epsilon` 0.001–0.005.

### MorseForce

Morse pair potential. Softer repulsion than LJ, asymmetric well — better for bond-like behavior. Same species/mixing API as `LJForce`.

```js
new MorseForce({
    species: {
        A: { De: 0.8, re: 22, a: 0.15 },
        B: { De: 0.4, re: 14, a: 0.20 },
    },
    cutoffMult: 4.0,
})
```

| Option | Default | Description |
|--------|---------|-------------|
| `species` | `{}` | Per-species `{ De, re, a }` |
| `cutoffMult` | `4.0` | Cutoff as a multiple of `re` |
| `overrides` | `{}` | Manual cross-pair params |

**Params:** `De` — well depth; `re` — equilibrium distance (pixels); `a` — well width (larger = narrower).

**Mixing rules:** `De_AB = √(De_A × De_B)`, `re_AB = (re_A + re_B) / 2`, `a_AB = √(a_A × a_B)`

### MouseForce

Repels particles away from the cursor.

```js
const mouse = new MouseForce({ dist: 120, strength: 0.06 });
canvas.addEventListener('mousemove', e => mouse.setPosition(e.clientX, e.clientY));
canvas.addEventListener('mouseleave', () => mouse.clear());
```

| Method | Description |
|--------|-------------|
| `setPosition(x, y)` | Update cursor position |
| `clear()` | Disable force (mouse left canvas) |

### GravityForce

Constant directional gravity.

```js
new GravityForce({ gx: 0, gy: 0.05 })
```

## CanvasRenderer

```js
const renderer = new CanvasRenderer(canvas, options);
renderer.render(sim.particles, mouseForce); // mouseForce can be null
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `dotColor` | `'rgba(0,180,150,'` | Default particle fill (rgba prefix) |
| `lineColor` | `'rgba(0,160,140,'` | Inter-particle link color (rgba prefix) |
| `mouseColor` | `'rgba(168,96,14,'` | Mouse node and link color (rgba prefix) |
| `linkDist` | `130` | Max distance for drawing links (pixels) |
| `mouseLinkDist` | `160` | Max distance for mouse links (pixels) |
| `colorMap` | `{}` | Per-species color: `{ A: 'rgba(0,212,176,' }` |
| `drawParticle` | `null` | `(ctx, p) => void` — fully custom particle drawing |
| `drawLink` | `null` | `(ctx, pi, pj, alpha) => void` — custom link drawing |
| `drawMouseLink` | `null` | `(ctx, p, mouse, alpha) => void` |
| `drawMouseNode` | `null` | `(ctx, mouse) => void` |

The `alpha` argument passed to link callbacks is already normalized `[0, 1]` (1 at contact, 0 at cutoff). All callbacks fall back to the built-in defaults when omitted.

### Custom renderer example

```js
const renderer = new CanvasRenderer(canvas, {
    linkDist: 130,
    drawParticle(ctx, p) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.species === 'A' ? '#00d4b0' : '#dc6432';
        ctx.fill();
    },
    drawLink(ctx, pi, pj, alpha) {
        ctx.beginPath();
        ctx.strokeStyle = `rgba(200,200,200,${alpha * 0.4})`;
        ctx.lineWidth = 1;
        ctx.moveTo(pi.x, pi.y);
        ctx.lineTo(pj.x, pj.y);
        ctx.stroke();
    },
});
```

### Custom render loop (no CanvasRenderer)

`sim.particles` is plain data — write any render loop you like:

```js
function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of sim.particles) {
        // p.x, p.y, p.radius, p.species
    }
}
```

## Dev

```bash
# Live demo (no build needed — imports from src/ directly)
npx serve .
# open http://localhost:3000/demo/

# Build dist bundles
npm install
npm run build
```
