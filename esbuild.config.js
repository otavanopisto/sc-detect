// build the sc-detect esbuild bundle
import esbuild from 'esbuild';

// we want to build both a minified dist version and a non-minified version meant for importing in other projects
esbuild.build({
    entryPoints: ['js/index.ts'],
    bundle: true,
    minify: false,
    outfile: 'dist/sc-detect.js',
    platform: 'browser',
    sourcemap: true,
}).catch(() => process.exit(1));

esbuild.build({
    entryPoints: ['js/index.ts'],
    bundle: true,
    minify: true,
    outfile: 'dist/sc-detect.min.js',
    platform: 'browser',
    sourcemap: true,
}).catch(() => process.exit(1));

// we want to add the tslinting types as well
esbuild.build({
    entryPoints: ['js/index.ts'],
    bundle: false,
    outfile: 'dist/sc-detect.d.ts',
    platform: 'browser',
    sourcemap: false,
}).catch(() => process.exit(1));