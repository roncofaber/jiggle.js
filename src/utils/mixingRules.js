export function pairKey(a, b) {
    return a <= b ? `${a}-${b}` : `${b}-${a}`;
}

// Lorentz-Berthelot: sigma arithmetic, epsilon geometric
export function ljMix(pA, pB) {
    return {
        sigma:   (pA.sigma + pB.sigma) / 2,
        epsilon: Math.sqrt(pA.epsilon * pB.epsilon),
    };
}

// Morse: De geometric, re arithmetic, a geometric
export function morseMix(pA, pB) {
    return {
        De: Math.sqrt(pA.De * pB.De),
        re: (pA.re + pB.re) / 2,
        a:  Math.sqrt(pA.a * pB.a),
    };
}

// Build full pair lookup table; overrides replace computed cross-pair values
export function buildPairTable(speciesParams, mixFn, overrides = {}) {
    const keys = Object.keys(speciesParams);
    const table = {};
    for (let i = 0; i < keys.length; i++) {
        for (let j = i; j < keys.length; j++) {
            const k = pairKey(keys[i], keys[j]);
            table[k] = k in overrides
                ? overrides[k]
                : mixFn(speciesParams[keys[i]], speciesParams[keys[j]]);
        }
    }
    return table;
}
