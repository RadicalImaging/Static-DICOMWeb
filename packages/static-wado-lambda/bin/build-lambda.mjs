#!/usr/bin/env node
// Builds the Lambda zip function directory `dist/lambda` (PRX-IMP-4): one ESM bundle of the
// function URL entry, and a node_modules with the packages that dcmjs-commands loads with a
// runtime `require` (esbuild cannot follow those). `aws cloudformation package` zips the directory.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { buildCloudFrontFunction } from '../lib/edge/cloudfrontFunction.mjs';

const outdir = new URL('../dist/lambda/', import.meta.url);
// The package exports no package.json; its root export is src/index.js.
const fromCommands = createRequire(
  new URL('../package.json', import.meta.resolve('@dcmjs-org/commands'))
);
const RUNTIME = ['dcmjs', '@dcmjs-org/media', '@dcmjs-org/fhir', '@cornerstonejs/dicom-codec'];

/**
 * The exact version that the workspace installs for a dependency of dcmjs-commands, so that the
 * zip runs the versions that the tests ran. An npm alias (`dcmjs`) keeps its alias form.
 */
function installedVersion(name) {
  const dir = fromCommands.resolve
    .paths(name)
    .map(nodeModules => path.join(nodeModules, name))
    .find(candidate => fs.existsSync(path.join(candidate, 'package.json')));
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  return pkg.name === name ? pkg.version : `npm:${pkg.name}@${pkg.version}`;
}

fs.rmSync(outdir, { recursive: true, force: true });
await build({
  entryPoints: [fileURLToPath(new URL('../lib/entries/awsFunctionUrl.mjs', import.meta.url))],
  outfile: fileURLToPath(new URL('index.mjs', outdir)),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  // RUNTIME stays bundled for static imports: Lambda loads an ESM `.js` of a package with no
  // "type" as CommonJS. node_modules serves only the runtime `require` calls.
  external: ['@aws-sdk/*', '@cornerstonejs/dicom-codec'],
  plugins: [
    {
      // shortcut: dataDictionary.js is CommonJS in a "type": "module" package; drop this when
      // static-wado-util renames it to dataDictionary.cjs.
      name: 'data-dictionary-esm',
      setup(b) {
        b.onLoad({ filter: /dataDictionary\.js$/ }, ({ path }) => ({
          contents: fs.readFileSync(path, 'utf8').replace('module.exports =', 'export default'),
          loader: 'js',
        }));
      },
    },
  ],
  // The bundled CommonJS of static-wado-util needs `require` in an ESM output.
  banner: {
    js: "import { createRequire as _cr } from 'node:module'; const require = _cr(import.meta.url);",
  },
});
fs.writeFileSync(
  new URL('package.json', outdir),
  JSON.stringify({
    type: 'module',
    private: true,
    dependencies: Object.fromEntries(RUNTIME.map(name => [name, installedVersion(name)])),
  })
);
const template = fs.readFileSync(new URL('../deploy/proxy-site.yaml', import.meta.url), 'utf8');
const edge = buildCloudFrontFunction({
  root: '/dicomweb',
  variants: [],
  collectionParameter: null,
});
fs.writeFileSync(
  new URL('../dist/proxy-site.yaml', import.meta.url),
  template.replace('__CLOUDFRONT_FUNCTION__', edge.trim().split('\n').join('\n        '))
);
execSync('npm install --omit=dev --no-package-lock --no-audit --no-fund', {
  cwd: outdir,
  stdio: 'inherit',
});
