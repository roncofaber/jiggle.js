import { CellGrid } from '../utils/CellGrid.js';

const LINK_BUCKETS = 5;

export class CanvasRenderer {
    constructor(canvas, {
        dotColor      = 'rgba(0,180,150,',
        lineColor     = 'rgba(0,160,140,',
        mouseColor    = 'rgba(168,96,14,',
        linkDist      = 10,           // Å
        mouseLinkDist = 15,           // Å
        scale         = 1,            // pixels / Å
        colorMap      = {},
        drawParticle  = null, // (ctx, p) => void — custom particle drawing
        drawLink      = null, // (ctx, pi, pj, alpha) => void — custom link drawing
        drawMouseLink = null, // (ctx, p, mouse, alpha) => void  (mouse is pixel {x,y})
        drawMouseNode = null, // (ctx, mouse) => void            (mouse is pixel {x,y})
    } = {}) {
        this.canvas        = canvas;
        this.ctx           = canvas.getContext('2d');
        this.dotColor      = dotColor;
        this.lineColor     = lineColor;
        this.mouseColor    = mouseColor;
        this.linkDist      = linkDist;
        this.mouseLinkDist = mouseLinkDist;
        this.scale         = scale;
        this.viewX         = 0; // Å — viewport left edge in simulation space
        this.viewY         = 0; // Å — viewport top  edge in simulation space
        this.linksEnabled      = true;
        this.mouseLinksEnabled = true;
        this.colorMap      = colorMap;

        this._drawLink        = drawLink      ?? null;
        this._drawMouseLink   = drawMouseLink ?? this._defaultDrawMouseLink.bind(this);
        this._drawMouseNode   = drawMouseNode ?? this._defaultDrawMouseNode.bind(this);
        this._drawParticle    = drawParticle  ?? null;

        this._grid    = new CellGrid();
        this._buckets = Array.from({ length: LINK_BUCKETS }, () => []);

        // Reused view objects for callbacks — avoids per-frame allocations.
        this._viewA = { x: 0, y: 0, radius: 0, species: '', vx: 0, vy: 0 };
        this._viewB = { x: 0, y: 0, radius: 0, species: '', vx: 0, vy: 0 };
    }

    _fillView(v, store, i) {
        v.x       = store.x[i];
        v.y       = store.y[i];
        v.radius  = store.radius[i];
        v.species = store.species[i];
        v.vx      = store.vx[i];
        v.vy      = store.vy[i];
    }

    // Å → pixel helpers accounting for viewport offset
    _px(ax) { return (ax - this.viewX) * this.scale; }
    _py(ay) { return (ay - this.viewY) * this.scale; }

    _defaultDrawMouseLink(ctx, p, mouse, alpha) {
        ctx.beginPath();
        ctx.strokeStyle = this.mouseColor + alpha + ')';
        ctx.lineWidth   = 1;
        ctx.moveTo(mouse.x, mouse.y);                       // mouse is in pixels
        ctx.lineTo(this._px(p.x), this._py(p.y));           // particle in Å → pixels
        ctx.stroke();
    }

    _defaultDrawMouseNode(ctx, mouse) {
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = this.mouseColor + '0.85)';
        ctx.fill();
    }

    _defaultDrawParticle(ctx, store, i) {
        ctx.beginPath();
        ctx.arc(this._px(store.x[i]), this._py(store.y[i]), store.radius[i] * this.scale, 0, Math.PI * 2);
        ctx.fillStyle = (this.colorMap[store.species[i]] ?? this.dotColor) + '0.7)';
        ctx.fill();
    }

    // store: ParticleStore.
    // mouse: { x, y } in PIXELS (or { x: null } when absent).
    // sim: optional Simulation — used for box size and periodic boundary.
    render(store, mouse = { x: null, y: null }, sim = null) {
        const { ctx, canvas } = this;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const scale = this.scale;
        const vX    = this.viewX;
        const vY    = this.viewY;
        const n     = store.count;

        const simW = sim ? sim.width  : canvas.width  / scale;
        const simH = sim ? sim.height : canvas.height / scale;

        if (n > 1 && this.linksEnabled) {
            const { x, y } = store;
            const linkDist  = this.linkDist;
            const linkDist2 = linkDist * linkDist;
            const bc        = sim?.boundary ?? null;
            const periodic  = bc?.isPeriodic ?? false;

            this._grid.build(store, linkDist, simW, simH);

            if (!this._drawLink) {
                const buckets = this._buckets;
                for (let b = 0; b < LINK_BUCKETS; b++) buckets[b].length = 0;

                this._grid.forEachPair(n, (i, j) => {
                    const dxr = x[i] - x[j];
                    const dyr = y[i] - y[j];
                    let   dx  = dxr, dy = dyr;
                    if (periodic) {
                        const mi = bc.minImage(dxr, dyr, sim);
                        dx = mi[0]; dy = mi[1];
                    }
                    const d2 = dx * dx + dy * dy;
                    if (d2 >= linkDist2) return;

                    const alpha = (1 - Math.sqrt(d2) / linkDist) * 0.5;
                    const b     = Math.min(LINK_BUCKETS - 1, (alpha * LINK_BUCKETS / 0.5) | 0);
                    const bkt   = buckets[b];

                    // Store in Å; offset applied when drawing
                    bkt.push(x[i], y[i], x[i] - dx, y[i] - dy);

                    if (periodic && (Math.abs(dx - dxr) + Math.abs(dy - dyr) > 1e-10)) {
                        bkt.push(x[j] + dx, y[j] + dy, x[j], y[j]);
                    }
                }, periodic);

                ctx.lineWidth = 0.8;
                for (let b = 0; b < LINK_BUCKETS; b++) {
                    const bkt = buckets[b];
                    if (!bkt.length) continue;
                    ctx.beginPath();
                    ctx.strokeStyle = this.lineColor + ((b + 1) / LINK_BUCKETS * 0.5) + ')';
                    for (let k = 0; k < bkt.length; k += 4) {
                        ctx.moveTo((bkt[k]     - vX) * scale, (bkt[k + 1] - vY) * scale);
                        ctx.lineTo((bkt[k + 2] - vX) * scale, (bkt[k + 3] - vY) * scale);
                    }
                    ctx.stroke();
                }
            } else {
                const drawLink = this._drawLink;
                const va = this._viewA, vb = this._viewB;
                this._grid.forEachPair(n, (i, j) => {
                    const dxr = x[i] - x[j];
                    const dyr = y[i] - y[j];
                    let   dx  = dxr, dy = dyr;
                    if (periodic) {
                        const mi = bc.minImage(dxr, dyr, sim);
                        dx = mi[0]; dy = mi[1];
                    }
                    const d2 = dx * dx + dy * dy;
                    if (d2 >= linkDist2) return;

                    const alpha = (1 - Math.sqrt(d2) / linkDist) * 0.5;
                    this._fillView(va, store, i);
                    this._fillView(vb, store, j);
                    drawLink(ctx, va, vb, alpha);

                    if (periodic && (Math.abs(dx - dxr) + Math.abs(dy - dyr) > 1e-10)) {
                        vb.x = x[j] + dx; vb.y = y[j] + dy;
                        drawLink(ctx, va, vb, alpha);
                    }
                }, periodic);
            }
        }

        // Mouse links — mouse.x/y are PIXEL coords; convert to Å for distances
        if (this.mouseLinksEnabled && mouse.x !== null) {
            const { x, y } = store;
            const mx = mouse.x / scale + vX;   // pixels → Å
            const my = mouse.y / scale + vY;
            const mouseLinkDist  = this.mouseLinkDist;
            const mouseLinkDist2 = mouseLinkDist * mouseLinkDist;
            const drawMouseLink  = this._drawMouseLink;
            const va = this._viewA;
            for (let k = 0; k < n; k++) {
                const dx = x[k] - mx;
                const dy = y[k] - my;
                const d2 = dx * dx + dy * dy;
                if (d2 >= mouseLinkDist2) continue;

                const alpha = (1 - Math.sqrt(d2) / mouseLinkDist) * 0.7;
                this._fillView(va, store, k);
                drawMouseLink(ctx, va, mouse, alpha);
            }
            this._drawMouseNode(ctx, mouse);
        }

        // Particles
        const drawParticle = this._drawParticle;
        if (!drawParticle) {
            for (let k = 0; k < n; k++) this._defaultDrawParticle(ctx, store, k);
        } else {
            const va = this._viewA;
            for (let k = 0; k < n; k++) {
                this._fillView(va, store, k);
                drawParticle(ctx, va);
            }
        }
    }
}
