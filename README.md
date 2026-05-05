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
const sim = new Simulation({ count: 75, width: 800, height: 600 });

const sim = Simulation.fromMixture([
    { species: 'A', count: 40, radius: 3 },
    { species: 'B', count: 20, radiusMin: 1, radiusMax: 4 },
], { width: 800, height: 600 });
```

| Method | Description |
|--------|-------------|
| `sim.addForce(force)` | Add a force; returns `sim` for chaining |
| `sim.removeForce(force)` | Remove a force by reference |
| `sim.step(context?)` | Advance one tick |
| `sim.resize(width, height)` | Update boundary dimensions |
| `sim.particles` | Array of `Particle` objects |

### Particle fields

| Field | Description |
|-------|-------------|
| `x`, `y` | Position (pixels) |
| `vx`, `vy` | Velocity |
| `fx`, `fy` | Accumulated force (zeroed each step) |
| `radius` | Radius in pixels |
| `mass` | Defaults to `radius²` |
| `species` | String label (default `'default'`) |

## Boundaries

Pass a boundary to the simulation constructor or `fromMixture`. Default is `PeriodicBoundary`.

```js
import { Simulation, ReflectiveBoundary } from 'jiggle.js';

const sim = new Simulation({ width: 800, height: 600, boundary: new ReflectiveBoundary() });
```

| Class | Behavior |
|-------|----------|
| `PeriodicBoundary` | Wrap-around with minimum image convention in forces |
| `ReflectiveBoundary` | Elastic bounce off walls |
| `AbsorbingBoundary` | Particles that leave the box are removed |

## Forces

### ThermalForce

Langevin thermostat — friction damping + Gaussian noise.

```js
new ThermalForce({ friction: 0.004, strength: 0.022 })
```

| Option | Default | Description |
|--------|---------|-------------|
| `friction` | `0.004` | Velocity damping per step |
| `strength` | `0.022` | Noise amplitude (scaled by `1/√mass`) |

### RepulsionForce

Pairwise soft repulsion.

```js
new RepulsionForce({ dist: 45, strength: 0.06 })
```

| Option | Default | Description |
|--------|---------|-------------|
| `dist` | `45` | Cutoff distance (pixels) |
| `strength` | `0.06` | Force magnitude at contact |

### LJForce

Lennard-Jones 12-6 pair potential. Equilibrium separation at `~1.12σ`. Supports multiple species with Lorentz-Berthelot mixing rules.

```js
new LJForce({
    species: {
        A: { epsilon: 0.003, sigma: 22 },
        B: { epsilon: 0.001, sigma: 14 },
    },
    cutoffMult: 2.5,
    overrides: {
        'A-B': { epsilon: 0.0005, sigma: 18 },
    },
})
```

| Option | Default | Description |
|--------|---------|-------------|
| `species` | `{}` | Per-species `{ epsilon, sigma }` |
| `cutoffMult` | `2.5` | Cutoff as a multiple of σ |
| `overrides` | `{}` | Manual cross-pair params, keyed `'A-B'` |

Mixing rules: `σ_AB = (σ_A + σ_B) / 2`, `ε_AB = √(ε_A × ε_B)`. Typical values: `sigma` 10–40 px, `epsilon` 0.001–0.005.

### MorseForce

Morse pair potential. Same species/mixing API as `LJForce`.

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

`De` — well depth; `re` — equilibrium distance (pixels); `a` — well width.

### MouseForce

Repels particles from the cursor.

```js
const mouse = new MouseForce({ dist: 120, strength: 0.06 });
canvas.addEventListener('mousemove', e => mouse.setPosition(e.clientX, e.clientY));
canvas.addEventListener('mouseleave', () => mouse.clear());
```

### GravityForce

```js
new GravityForce({ gx: 0, gy: 0.05 })
```

## CanvasRenderer

```js
const renderer = new CanvasRenderer(canvas, options);
renderer.render(sim.particles, mouseForce);
```

| Option | Default | Description |
|--------|---------|-------------|
| `dotColor` | `'rgba(0,180,150,'` | Default particle fill (rgba prefix) |
| `lineColor` | `'rgba(0,160,140,'` | Inter-particle link color |
| `mouseColor` | `'rgba(168,96,14,'` | Mouse node and link color |
| `linkDist` | `130` | Max distance for particle links (pixels) |
| `mouseLinkDist` | `160` | Max distance for mouse links (pixels) |
| `colorMap` | `{}` | Per-species color: `{ A: 'rgba(0,212,176,' }` |
| `drawParticle` | `null` | `(ctx, p) => void` |
| `drawLink` | `null` | `(ctx, pi, pj, alpha) => void` |
| `drawMouseLink` | `null` | `(ctx, p, mouse, alpha) => void` |
| `drawMouseNode` | `null` | `(ctx, mouse) => void` |

`alpha` is normalized `[0, 1]` (1 at contact, 0 at cutoff).

## Build

```bash
npm install && npm run build
```
