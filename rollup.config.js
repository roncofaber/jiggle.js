export default [
    {
        input: 'src/index.js',
        output: {
            file: 'dist/jiggle.esm.js',
            format: 'esm',
        },
    },
    {
        input: 'src/index.js',
        output: {
            file: 'dist/jiggle.umd.js',
            format: 'umd',
            name: 'Jiggle',
        },
    },
];
