# jiggle.js

Composable 2D particle physics for canvas, in LAMMPS "real" units
(distance Å, time fs, energy kcal/mol, mass amu). BAOAB Langevin
integrator, cell-list neighbour search, pluggable forces, boundaries,
and renderers.

```js
import { Simulation, SimulationClock, ThermalForce, LJForce, MouseForce, CanvasRenderer } from 'jiggle.js';

const sim = Simulation.fromMixture([
    { species: 'A', count: 40, radiusMin: 1.2, radiusMax: 1.8 },
    { species: 'B', count: 20, radius: 2.5 },
], { width: 800, height: 600, dt: 1 });

sim.addForce(new ThermalForce({ temperature: 300, gamma: 0.01 }))
   .addForce(new LJForce({
       species: {
           A: { epsilon: 0.15, sigma: 12 },
           B: { epsilon: 0.10, sigma:  8 },
       },
       cutoffMult: 2.5,
   }))
   .addForce(new MouseForce({ dist: 120, strength: 0.06 }));

const clock = new SimulationClock({ stepsPerSecond: 60 });
const renderer = new CanvasRenderer(canvas, {
    colorMap: { A: 'rgba(0,212,176,', B: 'rgba(220,100,60,' },
    linkDist: 28,
    scale: 3,
});

function loop(now) {
    const steps = clock.tick(now);
    for (let i = 0; i < steps; i++) sim.step();
    renderer.render(sim.store, mousePixels, sim);
    requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
```

## Simulation

```js
const sim  = new Simulation({ count: 75, width: 800, height: 600 });
const mix  = Simulation.fromMixture([{ species: 'A', count: 40, radiusMin: 1, radiusMax: 4 }], { width: 800, height: 600, dt: 1 });
const ring = Simulation.fromRing(24, { radius: 200, particleRadius: 2 });
const grid = Simulation.fromGrid(6, 4, { spacing: 30, particleRadius: 2 });
```

| Member | Description |
|--------|-------------|
| `sim.step(context?)` | Advance one fixed-`dt` tick (BAOAB) |
| `sim.resize(width, height)` | Rescale the box and particle positions |
| `sim.addForce(force)` / `removeForce(force)` | Chainable |
| `sim.addParticle(desc)` / `removeParticle(index)` | O(1) removal |
| `sim.temperature()` | Instantaneous temperature in K (2D equipartition) |
| `sim.kineticEnergy()` | Total kinetic energy |
| `sim.particleCount` | Live particle count |
| `sim.store` | Structure-of-arrays backing store |
| `sim.zeroCOMVelocity` | Subtract COM drift each step (off by default; meaningless with periodic boundaries) |
| `sim.dt` | Timestep in fs (default `1`) |
| `sim.maxSpeed` | Per-step speed guard (default `50` Å/fs) |

### Particle store fields

`sim.store` exposes typed arrays plus `count`. Positions are in Å, velocities
in Å/fs.

| Field | Description |
|-------|-------------|
| `x`, `y` | Position (Å) |
| `vx`, `vy` | Velocity (Å/fs) |
| `fx`, `fy` | Accumulated force (zeroed each step) |
| `radius` | Radius in Å |
| `mass` | Mass in amu |
| `species` | String label (default `'default'`) |

## SimulationClock

Decouples simulation speed from the display refresh rate: the simulation
advances `stepsPerSecond × dt` per real second on a 60, 120, or 144 Hz screen.

```js
const clock = new SimulationClock({ stepsPerSecond: 60, maxStepsPerFrame: 5 });

function loop(now) {
    const steps = clock.tick(now);       // call once per animation frame
    for (let i = 0; i < steps; i++) sim.step();
    requestAnimationFrame(loop);
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `stepsPerSecond` | `60` | Simulation steps per real second |
| `maxStepsPerFrame` | `5` | Catch-up cap after a stall or hidden tab |
| `maxFrameSeconds` | `0.25` | Clamp for a single frame's elapsed time |

## Boundaries

Pass a boundary to the constructor or the `from*` initialisers. Default is
`PeriodicBoundary`.

| Class | Behavior |
|-------|----------|
| `PeriodicBoundary` | Wrap-around with minimum image convention in forces |
| `ReflectiveBoundary` | Elastic bounce off walls |
| `AbsorbingBoundary` | Particles that leave the box are removed |

## Forces

### ThermalForce (Langevin, in the O slot of BAOAB)

Exact Ornstein-Uhlenbeck integrator; fluctuation-dissipation is automatic.

```js
new ThermalForce({ temperature: 300, gamma: 0.01 })
```

| Option | Default | Description |
|--------|---------|-------------|
| `temperature` | `300` | Target temperature in K |
| `gamma` | `0.01` | Friction in 1/fs |

### BerendsenForce / AndersenForce / NoseHooverForce

Alternative thermostats (all disabled by default: set `force.enabled = true`).

```js
const ber = new BerendsenForce({ temperature: 300, tau: 100 }); ber.enabled = true;
const and = new AndersenForce({ temperature: 300, nu: 0.01 });  and.enabled = true;
const nh  = new NoseHooverForce({ temperature: 300, tau: 100 }); nh.enabled = true;
```

Berendsen rescales velocities exponentially (no true canonical ensemble);
Andersen redraws velocities from Maxwell-Boltzmann at collision rate `nu`;
Nosé-Hoover is deterministic with relaxation time `tau`.

### LJForce

Lennard-Jones 12-6 with shifted potential (V → 0 at cutoff). Multiple species
with Lorentz-Berthelot mixing; cell-list neighbour search.

```js
new LJForce({
    species: {
        A: { epsilon: 0.15, sigma: 12 },
        B: { epsilon: 0.10, sigma:  8 },
    },
    cutoffMult: 2.5,
    overrides: { 'A-B': { epsilon: 0.05, sigma: 10 } },
})
```

| Option | Default | Description |
|--------|---------|-------------|
| `species` | `{}` | Per-species `{ epsilon, sigma }` |
| `cutoffMult` | `2.5` | Cutoff as a multiple of σ |
| `overrides` | `{}` | Manual cross-pair params, keyed `'A-B'` |

Mixing: `σ_AB = (σ_A + σ_B) / 2`, `ε_AB = √(ε_A × ε_B)`.

### MorseForce

Morse pair potential, same species/mixing API: `{ De, re, a }` per species.

### MouseForce / MouseLJForce

Cursor interaction; both support periodic minimum-image distances. MouseForce
repels particles from the cursor and can additionally **stir** them: an
optional drag relaxes nearby particle velocities toward the cursor's velocity
(exact exponential relaxation, stable at any strength - a stationary cursor
damps local motion the way a finger in water does).

```js
const mouse = new MouseForce({ dist: 27, strength: 3.0, drag: 2, dragMax: 10 });
canvas.addEventListener('mousemove', e => mouse.setPosition(px, py));   // sim units
```

| Option | Default | Description |
|--------|---------|-------------|
| `dist` | `120` | Interaction radius (Å) |
| `strength` | `0.06` | Repulsion strength at the cursor |
| `drag` | `0` | Stirring relaxation rate (1/fs); `0` disables it |
| `dragMax` | `10` | Cap on the cursor speed used for the drag (Å/fs) |

### Others

`GravityForce({ gx, gy })`, `AttractorForce`, `VortexForce`, `SpringForce`,
`RepulsionForce`, `BoundaryForce`, `FlockForce`.

## CanvasRenderer

```js
const renderer = new CanvasRenderer(canvas, options);
renderer.render(sim.store, mousePixels, sim);   // mousePixels: { x, y } in canvas pixels
```

| Option | Default | Description |
|--------|---------|-------------|
| `dotColor` | `'rgba(0,180,150,'` | Default particle fill (rgba prefix) |
| `lineColor` | `'rgba(0,160,140,'` | Inter-particle link color |
| `mouseColor` | `'rgba(168,96,14,'` | Mouse node and link color |
| `linkDist` | `10` | Max distance for particle links (Å) |
| `mouseLinkDist` | `15` | Max distance for mouse links (Å) |
| `scale` | `1` | Canvas pixels per Å |
| `dpr` | `1` | Device pixel ratio: set `canvas.width = cssWidth × dpr` for sharp HiDPI rendering |
| `colorMap` | `{}` | Per-species color: `{ A: 'rgba(0,212,176,' }` |
| `boxColor` | `null` | Simulation box outline stroke |
| `viewX`, `viewY` | `0` | Viewport offset in Å (pan) |
| `linksEnabled`, `mouseLinksEnabled` | `true` | Toggle link drawing |
| `drawParticle` | `null` | `(ctx, p) => void` |
| `drawLink` | `null` | `(ctx, pi, pj, alpha) => void` — PBC-aware stubs |
| `drawMouseLink` / `drawMouseNode` | `null` | Custom cursor drawing |

`alpha` is normalized `[0, 1]` (1 at contact, 0 at cutoff). With `dpr > 1`, set
the canvas backing store to `cssWidth × dpr` — the renderer applies the
transform internally, so all callbacks keep working in CSS pixels.

## Units

LAMMPS "real": distance Å, time fs, energy kcal/mol, mass amu, force
kcal/(mol·Å).

| Constant | Value | Description |
|----------|-------|-------------|
| `KB` | `0.001987` | Boltzmann constant, kcal/(mol·K) |
| `FORCE_CONV` | `4.184e-4` | (Å/fs)² per (kcal/mol)/amu |

## Demo

Open `demo/index.html` (served) for the playground and five presets:
binary mixture, crystal, flocking, ideal gas, and a full playground with
live energy graphs and every force/thermostat wired to sliders.

## Development

```bash
npm install
npm test          # node:test — physics invariants (cell list, energy drift, thermostats, units)
npm run build     # rollup → dist/jiggle.esm.js + dist/jiggle.umd.js
npm run dev       # watch mode
npm run demo      # serve the demos on :3000
```

CI (GitHub Actions) runs the test suite and the build on every push and PR.
