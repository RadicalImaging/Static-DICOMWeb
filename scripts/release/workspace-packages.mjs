import fs from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';

// Adapted from the Cornerstone3D release scripts. The release covers `packages/*`.
//
// Only Node built-ins here: the push and publish jobs run this module without
// installing the dependencies of the repository.
const PACKAGES_ROOT = 'packages';

// Every published package carries one version; this package names it.
export const VERSION_SOURCE = `${PACKAGES_ROOT}/create-dicomweb/package.json`;

// The dependency types whose ranges on a package of the release move with the release.
export const DEPENDENCY_TYPES = [
  'peerDependencies',
  'dependencies',
  'optionalDependencies',
  'devDependencies',
];

// The dependency types that a consumer installs, so the types that set the order of the publish.
const RUNTIME_DEPENDENCY_TYPES = DEPENDENCY_TYPES.filter(
  (type) => type !== 'devDependencies'
);

const execFileAsync = promisify(execFile);

/** Runs a command and answers its stdout. A failure rejects with `stdout` and `stderr` on the error. */
export async function runText(file, args, options = {}) {
  const { stdout } = await execFileAsync(file, args, {
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  return stdout.trim();
}

/** The version that the checkout carries, from VERSION_SOURCE. */
export async function readCurrentVersion() {
  return JSON.parse(await fs.readFile(VERSION_SOURCE, 'utf-8')).version;
}

async function readPackage(name) {
  const dir = `${PACKAGES_ROOT}/${name}`;
  const manifestPath = `${dir}/package.json`;

  try {
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
    return { dir, manifestPath, manifest, name: manifest.name };
  } catch {
    // A directory without a package.json is not a package.
    return undefined;
  }
}

/** Every package of the release, published or not. */
export async function getAllPackages() {
  const entries = await fs.readdir(PACKAGES_ROOT, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const packages = await Promise.all(directories.map(readPackage));

  return packages.filter(Boolean);
}

/**
 * True for a package that goes to npm.
 *
 * Use this to filter the result of one `getAllPackages` call when you also
 * change the manifests. Two calls answer two sets of objects, and a change to
 * one set does not reach the other.
 */
export function isPublishable(entry) {
  return !entry.manifest.private;
}

/** The packages that go to npm, in alphabetical order. */
export async function getPublishablePackages() {
  const packages = await getAllPackages();

  return packages.filter(isPublishable);
}

/**
 * The packages in the order of the publish: each package after the packages of
 * the set that it needs at run time, so that npm never holds a package whose
 * dependency is not there yet. The order is alphabetical where no dependency
 * decides it. A cycle throws, because no order satisfies it.
 */
export function sortByDependencies(packages) {
  const byName = new Map(packages.map((entry) => [entry.name, entry]));
  const sorted = [];
  const state = new Map();

  const visit = (entry, path) => {
    if (state.get(entry.name) === 'done') {
      return;
    }
    if (state.get(entry.name) === 'visiting') {
      throw new Error(`Dependency cycle: ${[...path, entry.name].join(' -> ')}`);
    }

    state.set(entry.name, 'visiting');
    const dependencies = RUNTIME_DEPENDENCY_TYPES.flatMap((type) =>
      Object.keys(entry.manifest[type] ?? {})
    ).sort();
    for (const dependency of dependencies) {
      if (byName.has(dependency)) {
        visit(byName.get(dependency), [...path, entry.name]);
      }
    }
    state.set(entry.name, 'done');
    sorted.push(entry);
  };

  [...packages]
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((entry) => visit(entry, []));

  return sorted;
}

/**
 * True when the registry already holds this exact version.
 *
 * npm answers `E404` for a version or a name that it does not hold. Every other
 * failure (a network fault, a 5xx answer) says nothing about the version, so it
 * throws: an answer of "not published" would turn a short fault into a release
 * that stops halfway.
 */
export async function isPublished(name, version) {
  try {
    await runText('npm', ['view', `${name}@${version}`, 'version']);
    return true;
  } catch (error) {
    const output = `${error.stderr ?? ''}\n${error.stdout ?? ''}`;

    if (/\bE404\b|404 Not Found/.test(output)) {
      return false;
    }

    throw new Error(
      `Cannot read the registry for ${name}@${version}: ${error.message}`
    );
  }
}

/** The packages of the given set that npm does not hold at their version. */
export async function findUnpublished(packages) {
  const published = await Promise.all(
    packages.map((entry) => isPublished(entry.name, entry.manifest.version))
  );

  return packages
    .filter((_, index) => !published[index])
    .map((entry) => `${entry.name}@${entry.manifest.version}`);
}
