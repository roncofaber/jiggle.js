export class Particle {
    constructor({ x, y, vx = 0, vy = 0, radius = 2, mass = null, species = 'default' }) {
        this.x       = x;
        this.y       = y;
        this.vx      = vx;
        this.vy      = vy;
        this.radius  = radius;
        this.mass    = mass ?? radius * radius;
        this.species = species;
        this.fx      = 0;
        this.fy      = 0;
    }

    resetForces() {
        this.fx = 0;
        this.fy = 0;
    }
}
