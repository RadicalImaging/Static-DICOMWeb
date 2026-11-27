#!/usr/bin/env node
// Builds the Lambda zip function directory `dist/lambda` (PRX-IMP-4): one ESM bundle of the
// function URL entry, and a node_modules with the packages that dcmjs-commands loads with a
// runtime `require` (esbuild cannot follow those). `aws cloudformation package` zips the directory.
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

/** The directory of the installed package `name`, as `require` of `from` finds it */
function installedDir(name, from) {
  return from.resolve
    .paths(name)
    .map(nodeModules => path.join(nodeModules, name))
    .find(candidate => fs.existsSync(path.join(candidate, 'package.json')));
}

/**
 * Copies the installed package `name` and its dependencies into the zip, so that the zip runs
 * the versions that the tests ran, with no network. A dependency in another version than the
 * one at the top level goes into the node_modules of the package that needs it.
 * @param {string} name - The dependency name (an npm alias keeps its alias name)
 * @param {NodeRequire} from - `require` of the package that depends on `name`
 * @param {string} nodeModules - The node_modules directory below the dependent package
 * @param {Map<string, string>} top - Name to version of the top-level packages of the zip
 * @returns {string|undefined} The version, or undefined for a dependency that is not installed
 */
function copyInstalled(name, from, nodeModules, top) {
  const dir = installedDir(name, from);
  if (!dir) {
    return undefined; // an optional dependency of another platform
  }
  const { version, dependencies, optionalDependencies } = JSON.parse(
    fs.readFileSync(path.join(dir, 'package.json'), 'utf8')
  );
  if (top.get(name) === version) {
    return version;
  }
  const dest = top.has(name) ? path.join(nodeModules, name) : path.join(topModules, name);
  if (fs.existsSync(dest)) {
    return version;
  }
  top.set(name, top.get(name) ?? version);
  fs.cpSync(fs.realpathSync(dir), dest, { recursive: true, dereference: true });
  const own = createRequire(path.join(fs.realpathSync(dir), 'package.json'));
  for (const dependency of Object.keys({ ...dependencies, ...optionalDependencies })) {
    copyInstalled(dependency, own, path.join(dest, 'node_modules'), top);
  }
  return version;
}

fs.rmSync(outdir, { recursive: true, force: true });
const topModules = fileURLToPath(new URL('node_modules/', outdir));
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
const top = new Map();
fs.writeFileSync(
  new URL('package.json', outdir),
  JSON.stringify({
    type: 'module',
    private: true,
    dependencies: Object.fromEntries(
      RUNTIME.map(name => [name, copyInstalled(name, fromCommands, topModules, top)])
    ),
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
