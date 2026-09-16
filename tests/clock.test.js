import test from 'node:test';
import assert from 'node:assert/strict';
import { SimulationClock } from '../src/index.js';

test('SimulationClock: first tick returns 0', () => {
    const clock = new SimulationClock();
    assert.equal(clock.tick(0), 0);
});

test('SimulationClock: step rate is independent of the frame interval', () => {
    for (const fps of [30, 60, 120, 144, 240]) {
        const clock = new SimulationClock({ stepsPerSecond: 60 });
        let total = 0;
        const frames = fps * 5;
        for (let f = 0; f < frames; f++) total += clock.tick(f * 1000 / fps);
        assert.ok(total >= 5 * 60 - 2 && total <= 5 * 60, `${fps}Hz: ${total} steps in 5s`);
    }
});

test('SimulationClock: caps catch-up after a long stall', () => {
    const clock = new SimulationClock({ stepsPerSecond: 60, maxStepsPerFrame: 5 });
    clock.tick(0);
    assert.equal(clock.tick(1000), 5); // 1 second later: clamped, no spiral
});

test('SimulationClock: reset clears the accumulator', () => {
    const clock = new SimulationClock({ stepsPerSecond: 60 });
    clock.tick(0);
    clock.tick(500);
    clock.reset();
    assert.equal(clock.tick(1000), 0); // starts over, no accumulated debt
});

test('SimulationClock: a throttled tab banks no step backlog', () => {
    const clock = new SimulationClock({ stepsPerSecond: 72, maxStepsPerFrame: 5 });
    clock.tick(0);
    let total = 0;
    // 40 ticks at 1 Hz (hidden/throttled): 5 steps each, debt must NOT accumulate
    for (let f = 1; f <= 40; f++) total += clock.tick(f * 1000);
    assert.equal(total, 200);
    // Back at 60 fps: at most one catch-up frame, then the normal rate
    let burst = 0;
    for (let f = 0; f < 5; f++) burst += clock.tick(40000 + f * 1000 / 60);
    assert.ok(burst <= 10, `return burst = ${burst} steps in 5 frames`);
});
