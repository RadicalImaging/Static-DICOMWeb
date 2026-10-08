import fs from 'fs/promises';
import { execa } from 'execa';

// Adapted from the Cornerstone3D release scripts. The release covers `packages/*`.
const PACKAGES_ROOT = 'packages';

// Every published package carries one version; this package names it.
export const VERSION_SOURCE = `${PACKAGES_ROOT}/create-dicomweb/package.json`;

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
 * True when the registry already holds this exact version.
 *
 * npm answers `E404` for a version or a name that it does not hold. Every other
 * failure (a network fault, a 5xx answer) says nothing about the version, so it
 * throws: an answer of "not published" would turn a short fault into a release
 * that stops halfway.
 */
export async function isPublished(name, version) {
  try {
    await execa('npm', ['view', `${name}@${version}`, 'version']);
    return true;
  } catch (error) {
    const output = `${error.stderr ?? ''}\n${error.stdout ?? ''}`;

    if (/\bE404\b|404 Not Found/.test(output)) {
      return false;
    }

    throw new Error(
      `Cannot read the registry for ${name}@${version}: ` +
        `${error.shortMessage ?? error.message}`
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
