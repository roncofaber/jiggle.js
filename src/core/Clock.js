// Fixed-timestep driver: decouples simulation speed from the display refresh
// rate. Call tick() once per animation frame; it returns how many fixed-dt
// steps to run so the simulation advances stepsPerSecond * dt per real second,
// regardless of whether the display refreshes at 60, 120, or 144 Hz.
export class SimulationClock {
    constructor({ stepsPerSecond = 60, maxStepsPerFrame = 5, maxFrameSeconds = 0.25 } = {}) {
        this.stepsPerSecond   = stepsPerSecond;
        this.maxStepsPerFrame = maxStepsPerFrame;
        this.maxFrameSeconds  = maxFrameSeconds;
        this._last = null;
        this._acc  = 0;
    }

    reset() {
        this._last = null;
        this._acc  = 0;
    }

    tick(now) {
        if (typeof now !== 'number') now = performance.now();
        if (this._last === null) { this._last = now; return 0; }
        let elapsed = (now - this._last) / 1000;
        this._last = now;
        // Hidden tab or throttled rAF: drop the backlog instead of banking it,
        // otherwise the accumulator grows while hidden and the simulation
        // bursts to maxStepsPerFrame per frame on return
        if (elapsed > this.maxFrameSeconds) {
            this._acc = 0;
            elapsed = this.maxFrameSeconds;
        }
        this._acc += elapsed * this.stepsPerSecond;
        const steps = Math.min(this.maxStepsPerFrame, Math.floor(this._acc));
        this._acc -= steps;
        // Never bank more than one frame's worth of steps
        this._acc = Math.min(this._acc, this.maxStepsPerFrame);
        return steps;
    }
}
