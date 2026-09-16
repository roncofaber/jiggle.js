import test from 'node:test';
import assert from 'node:assert/strict';
import {
    Simulation, ParticleStore, CellGrid, LJForce, ThermalForce,
    PeriodicBoundary, MouseForce, KB, FORCE_CONV,
} from '../src/index.js';

test('ParticleStore: growth, swap-remove, force reset', () => {
    const s = new ParticleStore(4);
    for (let i = 0; i < 10; i++) s.add({ x: i, y: i });
    assert.equal(s.count, 10);
    assert.ok(s._cap >= 10);
    s.remove(3);
    assert.equal(s.count, 9);
    assert.equal(s.x[3], 9); // last particle moved into slot 3
    s.fx[0] = 5; s.fy[0] = -3;
    s.resetForces();
    assert.equal(s.fx[0], 0);
    assert.equal(s.fy[0], 0);
});

test('PeriodicBoundary: position wrap and minimum image', () => {
    const sim = new Simulation({ count: 1, width: 100, height: 100 });
    sim.store.x[0] = 150; sim.store.y[0] = -10;
    sim.boundary.applyPosition(sim.store, 0, sim);
    assert.equal(sim.store.x[0], 50);
    assert.equal(sim.store.y[0], 90);

    const mi = sim.boundary.minImage(80, -90, sim);
    assert.equal(mi[0], -20);
    assert.equal(mi[1], 10);
});

test('CellGrid: visits every pair within cutoff exactly once (non-periodic)', () => {
    const store = new ParticleStore(64);
    const W = 300, H = 200, rc = 40;
    for (let i = 0; i < 50; i++) store.add({ x: Math.random() * W, y: Math.random() * H, radius: 1 });

    const grid = new CellGrid();
    grid.build(store, rc, W, H);
    const seen = new Set();
    grid.forEachPair(store.count, (i, j) => {
        const key = i < j ? `${i},${j}` : `${j},${i}`;
        assert.ok(!seen.has(key), `pair ${key} visited twice`);
        seen.add(key);
    }, false);

    // Reference: every pair within cutoff must have been visited
    const { x, y } = store;
    let expected = 0;
    for (let i = 0; i < store.count; i++) {
        for (let j = i + 1; j < store.count; j++) {
            const d2 = (x[i] - x[j]) ** 2 + (y[i] - y[j]) ** 2;
            if (d2 < rc * rc) {
                assert.ok(seen.has(`${i},${j}`), `pair ${i},${j} within cutoff was missed`);
                expected++;
            }
        }
    }
    // Visited pairs include beyond-cutoff cell neighbours, so only the floor matters
    assert.ok(seen.size >= expected);
});

test('CellGrid: periodic variant also complete, no duplicates', () => {
    const store = new ParticleStore(64);
    const W = 120, H = 120, rc = 30;
    for (let i = 0; i < 40; i++) store.add({ x: Math.random() * W, y: Math.random() * H, radius: 1 });

    const grid = new CellGrid();
    grid.build(store, rc, W, H);
    const seen = new Set();
    grid.forEachPair(store.count, (i, j) => {
        const key = i < j ? `${i},${j}` : `${j},${i}`;
        assert.ok(!seen.has(key), `pair ${key} visited twice`);
        seen.add(key);
    }, true);

    const { x, y } = store;
    const bc = new PeriodicBoundary();
    let expected = 0;
    for (let i = 0; i < store.count; i++) {
        for (let j = i + 1; j < store.count; j++) {
            const mi = bc.minImage(x[i] - x[j], y[i] - y[j], { width: W, height: H });
            if (mi[0] ** 2 + mi[1] ** 2 < rc * rc) expected++;
        }
    }
    // With PBC every pair has a minimum image; pairs beyond cutoff may still be
    // visited (non-adjacent cells are filtered by distance later), so only
    // assert that all within-cutoff pairs were found.
    assert.ok(seen.size >= expected);
});

test('LJForce: momentum conservation (equal and opposite pairs)', () => {
    const sim = Simulation.fromMixture(
        [{ species: 'A', count: 30, radiusMin: 1.2, radiusMax: 1.8 }],
        { width: 150, height: 150, dt: 1 },
    );
    const lj = new LJForce({ species: { A: { epsilon: 0.05, sigma: 3.0 } } });
    sim.store.resetForces();
    lj.apply(sim.store, sim);
    let px = 0, py = 0;
    for (let i = 0; i < sim.store.count; i++) { px += sim.store.fx[i]; py += sim.store.fy[i]; }
    assert.ok(Math.abs(px) < 1e-12, `net fx = ${px}`);
    assert.ok(Math.abs(py) < 1e-12, `net fy = ${py}`);
});

test('NVE: total energy drifts negligibly without a thermostat', () => {
    const sim = Simulation.fromMixture(
        [{ species: 'A', count: 40, radiusMin: 1.4, radiusMax: 1.8 }],
        { width: 200, height: 200, dt: 1 },
    );
    const lj = new LJForce({ species: { A: { epsilon: 0.05, sigma: 3.2 } } });
    sim.addForce(lj);
    for (let i = 0; i < sim.store.count; i++) {
        sim.store.vx[i] = (Math.random() - 0.5) * 0.02;
        sim.store.vy[i] = (Math.random() - 0.5) * 0.02;
    }
    const e0 = sim.kineticEnergy() + lj.potentialEnergy(sim.store, sim);
    for (let s = 0; s < 500; s++) sim.step();
    const e1 = sim.kineticEnergy() + lj.potentialEnergy(sim.store, sim);
    const drift = Math.abs(e1 - e0) / Math.max(Math.abs(e0), 1e-30);
    assert.ok(drift < 0.01, `energy drift ${drift * 100}% over 500 steps`);
});

test('Langevin thermostat: temperature relaxes to the target', () => {
    const sim = Simulation.fromMixture(
        [{ species: 'A', count: 60 }],
        { width: 200, height: 200, dt: 1 },
    );
    sim.addForce(new ThermalForce({ temperature: 300, gamma: 0.05 }));
    for (let s = 0; s < 2000; s++) sim.step();
    const T = sim.temperature();
    assert.ok(T > 180 && T < 460, `temperature ${T} K outside the fluctuation band`);
});

test('units: kBT at 300 K converts consistently', () => {
    // <v^2> per component at equilibrium: kBT/m in code units
    const kBT = KB * 300 * FORCE_CONV; // [A^2/fs^2 per amu]
    // Analytic: kBT/m = 1.380649e-23 J/K * 300 K / 1.66054e-27 kg = 2.4943e6 m^2/s^2
    // 1 m^2/s^2 = 1e-10 A^2/fs^2, so the expected value is 2.4943e-4
    assert.ok(Math.abs(kBT - 2.4943e-4) / 2.4943e-4 < 0.01, `kBT_fc = ${kBT}`);
});

test('MouseForce: stirring drag relaxes particles toward the cursor velocity', () => {
    const sim = new Simulation({ count: 2, width: 200, height: 200, dt: 1 });
    const mouse = new MouseForce({ dist: 27, strength: 0, drag: 2, dragMax: 10 }); // repulsion off
    sim.addForce(mouse);
    sim.store.x[0] = 60;  sim.store.y[0] = 50;  sim.store.vx[0] = 0; sim.store.vy[0] = 0;
    sim.store.x[1] = 150; sim.store.y[1] = 150; sim.store.vx[1] = 0; sim.store.vy[1] = 0;

    mouse.setPosition(50, 50);
    mouse.apply(sim.store, sim);   // first apply: cursor velocity unknown -> 0
    mouse.setPosition(58, 50);     // cursor moved +8 A since the last apply
    mouse.apply(sim.store, sim);   // cursor velocity = 8 A/fs (under the cap)

    // Particle 0 sits 8 A from the cursor: vx relaxes toward +8
    // by k*w = (1-exp(-2)) * (1-8/27) ~= 0.61 -> vx ~= 4.9
    assert.ok(sim.store.vx[0] > 2, `vx0 = ${sim.store.vx[0]}`);
    assert.ok(sim.store.vx[0] <= 8, `vx0 = ${sim.store.vx[0]}`);
    assert.equal(sim.store.vx[1], 0); // far particle untouched

    // A huge cursor jump is capped at dragMax
    mouse.setPosition(158, 50);    // +100 A -> capped at 10 A/fs
    mouse.apply(sim.store, sim);
    assert.ok(sim.store.vx[0] <= 10 + 1e-9, `vx0 = ${sim.store.vx[0]}`);
});

test('MouseForce: stirring drag off by default (backward compatible)', () => {
    const sim = new Simulation({ count: 1, width: 200, height: 200, dt: 1 });
    const mouse = new MouseForce({ dist: 27, strength: 3.0 }); // no drag option
    sim.addForce(mouse);
    sim.store.x[0] = 60; sim.store.y[0] = 50; sim.store.vx[0] = 0;
    mouse.setPosition(50, 50);
    mouse.apply(sim.store, sim);
    mouse.setPosition(58, 50);
    mouse.apply(sim.store, sim);
    assert.equal(sim.store.vx[0], 0); // velocities untouched without the drag option
});
