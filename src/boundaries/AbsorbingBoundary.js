export class AbsorbingBoundary {
    applyPosition() {}

    minImage(dx, dy) { return [dx, dy]; }

    filterParticles(particles, sim) {
        return particles.filter(p =>
            p.x >= 0 && p.x <= sim.width &&
            p.y >= 0 && p.y <= sim.height
        );
    }
}
