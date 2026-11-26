// Frontend-ийг public/ руу build хийнэ:  npm run build   (эсвэл node client/build.js --watch)
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const out = path.join(root, 'public');
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(path.join(__dirname, 'public'))) fs.copyFileSync(path.join(__dirname, 'public', f), path.join(out, f));
fs.copyFileSync(path.join(__dirname, 'index.html'), path.join(out, 'index.html'));

const opts = {
  entryPoints: { app: path.join(__dirname, 'src', 'main.jsx') },
  bundle: true,
  outdir: out,
  minify: !process.argv.includes('--watch'),
  sourcemap: process.argv.includes('--watch'),
  target: ['es2020', 'safari15'],
  jsx: 'automatic',
  loader: { '.js': 'jsx' },
  define: { 'process.env.NODE_ENV': '"production"' },
  nodePaths: (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean),
  logLevel: 'info',
};

if (process.argv.includes('--watch')) esbuild.context(opts).then((c) => c.watch());
else esbuild.build(opts).catch(() => process.exit(1));
