// Shared scaffolding for the demo pages.

// Fullscreen dpr-aware canvas: keeps the backing store at device resolution.
// Returns { canvas, dpr }.
export function fullscreenCanvas(id = 'c') {
    const canvas = document.getElementById(id);
    const dpr = window.devicePixelRatio || 1;
    const apply = () => {
        canvas.width  = Math.round(window.innerWidth * dpr);
        canvas.height = Math.round(window.innerHeight * dpr);
    };
    apply();
    window.addEventListener('resize', apply);
    return { canvas, dpr };
}

// FPS (+ optional temperature) readout, updated once per second.
export function statsOverlay({ fpsEl, tempEl } = {}) {
    let lastT = performance.now(), frames = 0;
    return {
        frame(now, sim) {
            frames++;
            if (now - lastT >= 1000) {
                if (fpsEl) fpsEl.textContent = Math.round(frames * 1000 / (now - lastT)) + ' fps';
                if (tempEl && sim) tempEl.textContent = Math.round(sim.temperature());
                frames = 0; lastT = now;
            }
        },
    };
}
