# Website Integration — roncofaber-web

## Context

The website at `/home/roncofaber/software/roncofaber-web` is a static site served directly
from `public/` with no bundler (`python3 -m http.server 8000`).

The hero section currently has a self-contained Langevin animation in
`public/js/script.js` lines 1–199 (an IIFE). This needs to be replaced with jiggle.js.

---

## Step 1 — Build jiggle.js

```bash
cd /home/roncofaber/software/jiggle.js
npm install
npm run build
```

Produces `dist/jiggle.esm.js` and `dist/jiggle.umd.js`.

## Step 2 — Copy (or symlink) the bundle into the website

```bash
# Copy (repeat after each jiggle.js update):
cp /home/roncofaber/software/jiggle.js/dist/jiggle.esm.js \
   /home/roncofaber/software/roncofaber-web/public/js/jiggle.esm.js

# Or symlink for local dev:
ln -sf /home/roncofaber/software/jiggle.js/dist/jiggle.esm.js \
       /home/roncofaber/software/roncofaber-web/public/js/jiggle.esm.js
```

## Step 3 — Convert script.js to an ES module

In `public/index.html`, change:
```html
<script src="js/script.js"></script>
```
to:
```html
<script type="module" src="js/script.js"></script>
```

`<script type="module">` is deferred by default — fine here since the animation is already
guarded by an `IntersectionObserver`.

## Step 4 — Replace the animation IIFE in script.js

Remove lines 1–199 of `public/js/script.js` (the `(function(){ ... })()` block) and replace
with the following. Everything below line 199 (publications, dark mode, nav, Pi stats) stays
unchanged — it has no imports and works fine in a module context.

```js
import {
    Simulation,
    ThermalForce,
    RepulsionForce,
    MouseForce,
    CanvasRenderer,
} from './jiggle.esm.js';

(function () {
    const canvas = document.getElementById('hero-canvas');
    if (!canvas) return;

    let animId, running = false;

    function resize() {
        const hero = canvas.parentElement;
        canvas.width  = hero.offsetWidth;
        canvas.height = hero.offsetHeight;
    }
    resize();

    const sim = new Simulation({ count: 75, width: canvas.width, height: canvas.height });

    const thermal   = new ThermalForce({ friction: 0.004, strength: 0.022 });
    const repulsion = new RepulsionForce({ dist: 45, strength: 0.06 });
    const mouse     = new MouseForce({ dist: 120, strength: 0.06 });

    sim.addForce(thermal).addForce(repulsion).addForce(mouse);

    // Rebuild renderer when dark mode toggles
    function makeRenderer() {
        const dark = document.body.classList.contains('dark-mode');
        return new CanvasRenderer(canvas, {
            dotColor:      dark ? 'rgba(0,212,176,'  : 'rgba(0,180,150,',
            lineColor:     dark ? 'rgba(0,212,176,'  : 'rgba(0,160,140,',
            mouseColor:    dark ? 'rgba(240,176,64,' : 'rgba(168,96,14,',
            linkDist:      130,
            mouseLinkDist: 160,
        });
    }
    let renderer = makeRenderer();
    new MutationObserver(() => { renderer = makeRenderer(); })
        .observe(document.body, { attributeFilter: ['class'] });

    function draw() {
        sim.step();
        renderer.render(sim.particles, mouse);
        animId = requestAnimationFrame(draw);
    }

    new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
            if (!running) { running = true; draw(); }
        } else {
            running = false;
            cancelAnimationFrame(animId);
        }
    }, { threshold: 0.01 }).observe(canvas);

    const hero = canvas.parentElement;
    hero.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mouse.setPosition(e.clientX - rect.left, e.clientY - rect.top);
    });
    hero.addEventListener('mouseleave', () => mouse.clear());

    hero.addEventListener('touchmove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const t = e.touches[0];
        mouse.setPosition(t.clientX - rect.left, t.clientY - rect.top);
    }, { passive: true });
    hero.addEventListener('touchend', () => mouse.clear());

    window.addEventListener('resize', () => {
        resize();
        sim.resize(canvas.width, canvas.height);
    });
})();
```

### Parameters matching the current site

| Parameter | Value |
|-----------|-------|
| Particle count | 75 |
| Link distance | 130 px |
| Mouse link distance | 160 px |
| Mouse repel distance | 120 px |
| Pair repel distance | 45 px |
| Repel strength | 0.06 |
| Thermal strength | 0.022 |
| Friction | 0.004 |

---

## Alternative: physics-richer version with LJForce

If you want particles to cluster and attract instead of just repelling, swap `RepulsionForce`
for `LJForce`. LJ has both a repulsive core and an attractive well — particles settle at an
equilibrium separation of ~1.12σ.

```js
import {
    Simulation,
    ThermalForce,
    LJForce,
    MouseForce,
    CanvasRenderer,
} from './jiggle.esm.js';

// ...same setup as above, then:

const lj = new LJForce({
    species: { default: { epsilon: 0.002, sigma: 22 } },
});
sim.addForce(thermal).addForce(lj).addForce(mouse);
```

`Simulation` (without `fromMixture`) assigns `species: 'default'` to all particles, so a
single-species LJForce config is enough.

---

## Alternative: custom visual style via draw callbacks

`CanvasRenderer` accepts four optional callbacks to fully replace the default drawing. The
simulation engine (positions, forces) is untouched — only visuals change.

```js
const renderer = new CanvasRenderer(canvas, {
    linkDist: 130,
    drawParticle(ctx, p) {
        // p.x, p.y, p.radius, p.species available
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#00d4b0';
        ctx.fill();
    },
    drawLink(ctx, pi, pj, alpha) {
        // alpha: 0 at cutoff, 1 at contact
        ctx.beginPath();
        ctx.strokeStyle = `rgba(0,212,176,${alpha * 0.4})`;
        ctx.lineWidth = 0.8;
        ctx.moveTo(pi.x, pi.y);
        ctx.lineTo(pj.x, pj.y);
        ctx.stroke();
    },
    // drawMouseLink and drawMouseNode omitted → use built-in defaults
});
```

Or bypass `CanvasRenderer` entirely and read `sim.particles` directly in your own draw loop:

```js
function draw() {
    sim.step();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of sim.particles) {
        // draw p.x, p.y however you like
    }
    requestAnimationFrame(draw);
}
```

---

## Notes

- `script.js` does not need to become a full ES module file — only the animation block at the
  top imports from jiggle.js. Everything below it uses no imports and stays unchanged.
- For production deployment (Raspberry Pi), copy `dist/jiggle.esm.js` into `public/js/`
  alongside the rest of the site files before pushing.
- The full jiggle.js API is documented in `README.md` at the repo root.
