// build the sc-detect esbuild bundle
import esbuild from 'esbuild';
import { exec } from 'child_process';

// we want to build both a minified dist version and a non-minified version meant for importing in other projects
esbuild.build({
    entryPoints: ['js/index.ts'],
    bundle: true,
    minify: false,
    outfile: 'dist/sc-detect.js',
    platform: 'neutral',
    sourcemap: true,
}).catch(() => process.exit(1));

esbuild.build({
    entryPoints: ['js/index.ts'],
    bundle: true,
    minify: false,
    outfile: 'dist/sc-detect.browser.js',
    platform: 'browser',
    sourcemap: true,
}).catch(() => process.exit(1));

esbuild.build({
    entryPoints: ['js/index.ts'],
    bundle: true,
    minify: true,
    outfile: 'dist/sc-detect.browser.min.js',
    platform: 'browser',
    sourcemap: false,
}).catch(() => process.exit(1));

// typescript nonsense to generate .d.ts files
exec('npx tsc --declaration --emitDeclarationOnly --outDir types', (error) => {
    if (error) process.exit(1);
});