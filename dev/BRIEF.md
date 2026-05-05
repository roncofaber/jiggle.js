# jiggle.js — Agent Brief

## What this is

`jiggle.js` is a composable 2D particle physics library for HTML canvas. It was extracted from a Langevin dynamics animation running on a personal academic website (roncofaber.com) and is intended to grow into a general-purpose plugin usable across projects.

The core design is **composable forces**: a `Simulation` holds particles and a list of force objects. Each force implements a single `apply(particles, sim, context)` method. Forces are mixed in, not hardcoded.

## Current state

Scaffolded but not yet validated end-to-end. All files exist, no build has been run.

```
src/
  core/
    Particle.js        — particle state (x, y, vx, vy, radius, mass, fx, fy)
    Simulation.js      — holds particles + forces, runs step(), reflective boundaries
  forces/
    ThermalForce.js    — Langevin thermostat (friction + Gaussian noise via Box-Muller)
    RepulsionForce.js  — O(n²) pairwise soft repulsion
    MouseForce.js      — repels particles from cursor; call .setPosition(x,y) / .clear()
    GravityForce.js    — constant directional gravity (gx, gy)
  renderers/
    CanvasRenderer.js  — draws links between nearby particles + dots + mouse node
  index.js             — re-exports everything
demo/
  index.html           — standalone testbed, imports from src/ directly (no build needed)
                         has live sliders for thermal, friction, repulsion, linkDist, gravity
```

## What needs to be built next

### High priority
- **`SpringForce`** — attraction between explicitly bonded particle pairs (define bonds as `[[i,j], ...]`). Needed for molecular-looking structures (rings, chains).
- **`AttractorForce`** — point gravity well at a fixed (x,y). Useful for vortex / orbit effects.
- **`BoundaryForce`** — soft repulsion from canvas edges instead of hard reflection, so particles bounce more naturally.

### Medium priority
- **Collision response** — currently particles overlap; proper elastic collision on contact would make it feel more physical.
- **`WindForce`** — spatially uniform or noise-field driven push in one direction.
- **Particle factory helpers** — `Simulation.fromGrid()`, `Simulation.fromRing()` etc. for structured initial conditions.

### Longer term
- **WebGL renderer** — canvas2d gets slow past ~500 particles; a simple points+lines WebGL renderer would allow 5000+.
- **npm publish** — currently no versioning/publishing setup.

## Design rules to preserve

1. Every force is a class with an `apply(particles, sim, context)` method. No exceptions.
2. `Simulation.step()` zeroes forces, calls all forces in order, then integrates. Forces must only write to `p.fx` / `p.fy` (or directly to `p.vx`/`p.vy` for velocity-space forces like `ThermalForce`).
3. No DOM dependencies in `src/` — renderers live in `src/renderers/`, everything else is pure data/math.
4. No external dependencies. Vanilla JS only.

## Running the demo

No build needed — the demo imports directly from `src/` via ES modules:

```bash
npx serve /path/to/jiggle.js
# then open http://localhost:3000/demo/
```

## Building

```bash
npm install
npm run build   # outputs dist/jiggle.esm.js and dist/jiggle.umd.js
```
