export class CanvasRenderer {
    constructor(canvas, {
        dotColor      = 'rgba(0,180,150,',
        lineColor     = 'rgba(0,160,140,',
        mouseColor    = 'rgba(168,96,14,',
        linkDist      = 130,
        mouseLinkDist = 160,
        colorMap      = {},
        drawParticle  = null, // (ctx, p) => void — custom particle drawing
        drawLink      = null, // (ctx, pi, pj, alpha) => void — custom link drawing
        drawMouseLink = null, // (ctx, p, mouse, alpha) => void
        drawMouseNode = null, // (ctx, mouse) => void
    } = {}) {
        this.canvas        = canvas;
        this.ctx           = canvas.getContext('2d');
        this.dotColor      = dotColor;
        this.lineColor     = lineColor;
        this.mouseColor    = mouseColor;
        this.linkDist      = linkDist;
        this.mouseLinkDist = mouseLinkDist;
        this.colorMap      = colorMap;
        this.drawParticle  = drawParticle;
        this.drawLink      = drawLink;
        this.drawMouseLink = drawMouseLink;
        this.drawMouseNode = drawMouseNode;
    }

    _defaultDrawLink(ctx, pi, pj, alpha) {
        ctx.beginPath();
        ctx.strokeStyle = this.lineColor + alpha + ')';
        ctx.lineWidth   = 0.8;
        ctx.moveTo(pi.x, pi.y);
        ctx.lineTo(pj.x, pj.y);
        ctx.stroke();
    }

    _defaultDrawMouseLink(ctx, p, mouse, alpha) {
        ctx.beginPath();
        ctx.strokeStyle = this.mouseColor + alpha + ')';
        ctx.lineWidth   = 1;
        ctx.moveTo(mouse.x, mouse.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
    }

    _defaultDrawMouseNode(ctx, mouse) {
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = this.mouseColor + '0.85)';
        ctx.fill();
    }

    _defaultDrawParticle(ctx, p) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = (this.colorMap[p.species] ?? this.dotColor) + '0.7)';
        ctx.fill();
    }

    render(particles, mouse = { x: null, y: null }) {
        const { ctx, canvas } = this;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const drawLink      = this.drawLink      ?? ((c, pi, pj, a) => this._defaultDrawLink(c, pi, pj, a));
        const drawMouseLink = this.drawMouseLink ?? ((c, p, m, a)   => this._defaultDrawMouseLink(c, p, m, a));
        const drawMouseNode = this.drawMouseNode ?? ((c, m)          => this._defaultDrawMouseNode(c, m));
        const drawParticle  = this.drawParticle  ?? ((c, p)          => this._defaultDrawParticle(c, p));

        // Inter-particle links
        const linkDist2 = this.linkDist * this.linkDist;
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const d2 = dx * dx + dy * dy;
                if (d2 >= linkDist2) continue;

                const alpha = (1 - Math.sqrt(d2) / this.linkDist) * 0.5;
                drawLink(ctx, particles[i], particles[j], alpha);
            }
        }

        // Mouse links
        if (mouse.x !== null) {
            const mouseLinkDist2 = this.mouseLinkDist * this.mouseLinkDist;
            for (const p of particles) {
                const dx = p.x - mouse.x;
                const dy = p.y - mouse.y;
                const d2 = dx * dx + dy * dy;
                if (d2 >= mouseLinkDist2) continue;

                const alpha = (1 - Math.sqrt(d2) / this.mouseLinkDist) * 0.7;
                drawMouseLink(ctx, p, mouse, alpha);
            }
            drawMouseNode(ctx, mouse);
        }

        // Particles
        for (const p of particles) drawParticle(ctx, p);
    }
}
