// Type definitions for jiggle.js — 2D particle physics in LAMMPS real units
// (distance Å, time fs, energy kcal/mol, mass amu).

export interface ParticleDescriptor {
    x: number;
    y: number;
    vx?: number;
    vy?: number;
    radius?: number;
    mass?: number;
    species?: string;
}

export interface SpeciesParams {
    epsilon: number;
    sigma: number;
}

export interface MorseParams {
    De: number;
    re: number;
    a: number;
}

export interface ParticleStore {
    count: number;
    x: Float32Array;
    y: Float32Array;
    vx: Float32Array;
    vy: Float32Array;
    fx: Float32Array;
    fy: Float32Array;
    radius: Float32Array;
    mass: Float32Array;
    species: string[];
    add(descriptor: ParticleDescriptor): number;
    remove(index: number): void;
    resetForces(): void;
}

export interface SimulationOptions {
    count?: number;
    width?: number;
    height?: number;
    boundary?: PeriodicBoundary | ReflectiveBoundary | AbsorbingBoundary;
    maxSpeed?: number;
    dt?: number;
}

export interface MixtureGroup {
    species: string;
    count: number;
    radius?: number;
    radiusMin?: number;
    radiusMax?: number;
    radiusSampler?: () => number;
    mass?: number;
}

export class Simulation {
    width: number;
    height: number;
    dt: number;
    maxSpeed: number;
    zeroCOMVelocity: boolean;
    store: ParticleStore;
    forces: object[];
    boundary: PeriodicBoundary | ReflectiveBoundary | AbsorbingBoundary;

    constructor(options?: SimulationOptions);
    static fromMixture(groups: MixtureGroup[], options?: SimulationOptions): Simulation;
    static fromRing(count: number, options?: {
        radius?: number; cx?: number; cy?: number; species?: string;
        particleRadius?: number; width?: number; height?: number;
        boundary?: SimulationOptions['boundary']; dt?: number; maxSpeed?: number;
    }): Simulation;
    static fromGrid(cols: number, rows: number, options?: {
        spacing?: number; ox?: number; oy?: number; species?: string;
        particleRadius?: number; width?: number; height?: number;
        boundary?: SimulationOptions['boundary']; dt?: number; maxSpeed?: number;
    }): Simulation;

    step(context?: object): void;
    resize(width: number, height: number): void;
    addForce(force: object): this;
    removeForce(force: object): this;
    addParticle(descriptor: ParticleDescriptor): this;
    removeParticle(index: number): this;
    temperature(): number;
    kineticEnergy(): number;
    readonly particleCount: number;
}

export class Particle {
    constructor(descriptor: ParticleDescriptor & { mass?: number });
    x: number;
    y: number;
    vx: number;
    vy: number;
    fx: number;
    fy: number;
    radius: number;
    mass: number;
    species: string;
    resetForces(): void;
}

export interface SimulationClockOptions {
    stepsPerSecond?: number;
    maxStepsPerFrame?: number;
    maxFrameSeconds?: number;
}

/** Fixed-timestep driver: decouples simulation speed from the display refresh rate. */
export class SimulationClock {
    stepsPerSecond: number;
    maxStepsPerFrame: number;
    maxFrameSeconds: number;
    constructor(options?: SimulationClockOptions);
    /** Call once per animation frame; returns how many fixed-dt steps to run. */
    tick(now?: number): number;
    reset(): void;
}

export class ThermalForce {
    temperature: number;
    gamma: number;
    isLangevin: boolean;
    constructor(options?: { temperature?: number; gamma?: number });
    apply(store: ParticleStore, sim: Simulation, context?: object): void;
}

export class BerendsenForce {
    temperature: number;
    tau: number;
    isLangevin: boolean;
    enabled: boolean;
    constructor(options?: { temperature?: number; tau?: number });
    apply(store: ParticleStore, sim: Simulation, context?: object): void;
}

export class AndersenForce {
    temperature: number;
    nu: number;
    isLangevin: boolean;
    enabled: boolean;
    constructor(options?: { temperature?: number; nu?: number });
    apply(store: ParticleStore, sim: Simulation, context?: object): void;
}

export class NoseHooverForce {
    temperature: number;
    tau: number;
    isLangevin: boolean;
    enabled: boolean;
    xi: number;
    constructor(options?: { temperature?: number; tau?: number });
    apply(store: ParticleStore, sim: Simulation, context?: object): void;
}

export interface LJForceOptions {
    species?: Record<string, SpeciesParams>;
    cutoffMult?: number;
    cutoff?: number | null;
    minDistMult?: number;
    overrides?: Record<string, SpeciesParams>;
}

export class LJForce {
    constructor(options?: LJForceOptions);
    apply(store: ParticleStore, sim: Simulation, context?: object): void;
    potentialEnergy(store: ParticleStore, sim: Simulation): number;
}

export interface MorseForceOptions {
    species?: Record<string, MorseParams>;
    cutoffMult?: number;
    overrides?: Record<string, MorseParams>;
}

export class MorseForce {
    constructor(options?: MorseForceOptions);
    apply(store: ParticleStore, sim: Simulation, context?: object): void;
}

export class MouseForce {
    x: number | null;
    y: number | null;
    dist: number;
    strength: number;
    constructor(options?: { dist?: number; strength?: number });
    setPosition(x: number, y: number): void;
    clear(): void;
    apply(store: ParticleStore, sim?: Simulation, context?: object): void;
}

export class MouseLJForce {
    x: number | null;
    y: number | null;
    epsilon: number;
    sigma: number;
    cutoffMult: number;
    constructor(options?: { epsilon?: number; sigma?: number; cutoffMult?: number });
    setPosition(x: number, y: number): void;
    clear(): void;
    apply(store: ParticleStore, sim?: Simulation, context?: object): void;
}

export class GravityForce {
    gx: number;
    gy: number;
    constructor(options?: { gx?: number; gy?: number });
    apply(store: ParticleStore, sim?: Simulation, context?: object): void;
}

export class AttractorForce {
    x: number;
    y: number;
    strength: number;
    falloff: number;
    minDist: number;
    constructor(options?: { x?: number; y?: number; strength?: number; falloff?: number; minDist?: number });
    apply(store: ParticleStore, sim?: Simulation, context?: object): void;
}

export class VortexForce {
    x: number;
    y: number;
    strength: number;
    falloff: number;
    minDist: number;
    constructor(options?: { x?: number; y?: number; strength?: number; falloff?: number; minDist?: number });
    apply(store: ParticleStore, sim?: Simulation, context?: object): void;
}

export interface SpringBond {
    a: number;
    b: number;
    restLength?: number;
}

export class SpringForce {
    bonds: SpringBond[];
    stiffness: number;
    damping: number;
    constructor(options?: { bonds?: SpringBond[]; stiffness?: number; damping?: number });
    apply(store: ParticleStore, sim?: Simulation, context?: object): void;
}

export class RepulsionForce {
    dist: number;
    strength: number;
    minDistFrac: number;
    constructor(options?: { dist?: number; strength?: number; minDistFrac?: number });
    apply(store: ParticleStore, sim: Simulation, context?: object): void;
}

export class BoundaryForce {
    margin: number;
    strength: number;
    power: number;
    constructor(options?: { margin?: number; strength?: number; power?: number });
    apply(store: ParticleStore, sim: Simulation, context?: object): void;
}

export class FlockForce {
    perceptionRadius: number;
    separationRadius: number;
    separationWeight: number;
    alignmentWeight: number;
    cohesionWeight: number;
    constructor(options?: {
        perceptionRadius?: number;
        separationRadius?: number;
        separationWeight?: number;
        alignmentWeight?: number;
        cohesionWeight?: number;
    });
    apply(store: ParticleStore, sim: Simulation, context?: object): void;
}

export class PeriodicBoundary {
    isPeriodic: boolean;
    applyPosition(store: ParticleStore, index: number, sim: Simulation): void;
    minImage(dx: number, dy: number, sim: Simulation): Float64Array;
}

export class ReflectiveBoundary {
    isPeriodic: boolean;
    applyPosition(store: ParticleStore, index: number, sim: Simulation): void;
}

export class AbsorbingBoundary {
    isPeriodic: boolean;
    applyPosition(store: ParticleStore, index: number, sim: Simulation): void;
    filterParticles?(store: ParticleStore, sim: Simulation): void;
}

export interface CanvasRendererOptions {
    dotColor?: string;
    lineColor?: string;
    mouseColor?: string;
    linkDist?: number;
    mouseLinkDist?: number;
    scale?: number;
    dpr?: number;
    colorMap?: Record<string, string>;
    boxColor?: string | null;
    viewX?: number;
    viewY?: number;
    linksEnabled?: boolean;
    mouseLinksEnabled?: boolean;
    drawParticle?: ((ctx: CanvasRenderingContext2D, p: { x: number; y: number; vx: number; vy: number; radius: number; species: string }) => void) | null;
    drawLink?: ((ctx: CanvasRenderingContext2D, pi: { x: number; y: number; radius: number; species: string }, pj: { x: number; y: number; radius: number; species: string }, alpha: number) => void) | null;
    drawMouseLink?: ((ctx: CanvasRenderingContext2D, p: { x: number; y: number; radius: number; species: string }, mouse: { x: number; y: number }, alpha: number) => void) | null;
    drawMouseNode?: ((ctx: CanvasRenderingContext2D, mouse: { x: number; y: number }) => void) | null;
}

export class CanvasRenderer {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    scale: number;
    dpr: number;
    viewX: number;
    viewY: number;
    linksEnabled: boolean;
    mouseLinksEnabled: boolean;
    constructor(canvas: HTMLCanvasElement, options?: CanvasRendererOptions);
    render(store: ParticleStore, mouse?: { x: number | null; y: number | null }, sim?: Simulation | null): void;
}
