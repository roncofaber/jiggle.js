export class ReflectiveBoundary {
    applyPosition(p, sim) {
        if (p.x < 0)              { p.x = -p.x;                  p.vx =  Math.abs(p.vx); }
        else if (p.x > sim.width) { p.x = 2 * sim.width  - p.x;  p.vx = -Math.abs(p.vx); }
        if (p.y < 0)              { p.y = -p.y;                   p.vy =  Math.abs(p.vy); }
        else if (p.y > sim.height){ p.y = 2 * sim.height - p.y;  p.vy = -Math.abs(p.vy); }
    }

    minImage(dx, dy) { return [dx, dy]; }
}
