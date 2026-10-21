import { build, context } from 'esbuild';

const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ['src/widget.ts'],
  bundle: true,
  format: 'iife',
  // Browsers that salon customers realistically use. The widget ships on third
  // party sites, so a small, dependency-free bundle matters more than features.
  target: ['es2018', 'chrome80', 'firefox78', 'safari13'],
  minify: true,
  sourcemap: true,
  outfile: 'dist/widget.js',
  legalComments: 'none',
  banner: {
    js: '/* GlamBot widget — https://glambot.io. Loaded per tenant via ?key=... */',
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('[widget] watching for changes…');
} else {
  await build(options);
  console.log('[widget] built dist/widget.js');
}
