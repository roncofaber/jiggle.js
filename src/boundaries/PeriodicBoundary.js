export class PeriodicBoundary {
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
