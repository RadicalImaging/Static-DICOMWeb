import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { pathToFileURL } from 'url';
import { isDeepStrictEqual } from 'util';
import {
  getPublishablePackages,
  isPublished,
  runText,
  sortByDependencies,
} from './workspace-packages.mjs';

// Publishes the tarballs of release/ that npm does not already hold.
//
//   node publish-package.mjs <directory of the tarballs>
//
// The checkout of the tag decides the set and the order: the package.json of
// each tarball must agree with one publishable package of the tag in each field
// that changes what an install or a publish does. The packages go to npm in
// dependency order, and the first failure stops the publish, so npm never holds
// a package without the packages that it needs. The check cannot see the other
// files of a tarball, for example a build output that a dependency script of
// the build job changed.
//
// The npm CLI does the publish, because the CLI exchanges the GitHub Actions
// OIDC token for npm credentials. npm trusted publishing needs npm 11.5.1 or later.
// Only Node built-ins here: this job does not install the dependencies.

const INSTALL_FIELDS = [
  'name',
  'version',
  'main',
  'module',
  'types',
  'exports',
  'imports',
  'bin',
  'directories',
  'files',
  'scripts',
  'gypfile',
  'publishConfig',
  'dependencies',
  'peerDependencies',
  'optionalDependencies',
  'bundleDependencies',
  'bundledDependencies',
];

/**
 * The problems of the entries of a tarball; an empty list accepts them.
 *
 * npm drops the first directory of each entry, and keeps the last entry for a
 * path, so a second top-level directory, or a second spelling of a path
 * (`package/./package.json`, `package//package.json`), could replace the
 * package.json that this check reads. So each entry must be a file or a
 * directory, in its normal spelling, under `package/`, and occur once. A
 * `binding.gyp` makes npm run node-gyp at install, so it must come from the tag.
 *
 * - `entries`: `{ name, type }` for each entry, with the type character of
 *   `tar -tv` (`-` for a file, `d` for a directory).
 */
export function findEntryProblems(entries, bindingGypInTag) {
  const problems = [];
  const names = entries.map(({ name }) => name);

  for (const { name, type } of entries) {
    if (!name.startsWith('package/') || path.posix.normalize(name) !== name) {
      problems.push(`the entry ${name} is not a normal path under package/`);
    }
    if (type !== '-' && type !== 'd') {
      problems.push(`the entry ${name} is not a file or a directory`);
    }
  }
  if (new Set(names).size !== names.length) {
    problems.push('an entry occurs more than once');
  }
  if (names.includes('package/binding.gyp') && !bindingGypInTag) {
    problems.push('the tarball holds a binding.gyp that the tag does not hold');
  }

  return problems;
}

async function readTarballManifest(file, dir) {
  const names = (await runText('tar', ['-tzf', file])).split('\n');
  const types = (await runText('tar', ['-tvzf', file])).split('\n').map((line) => line[0]);
  if (names.length !== types.length) {
    throw new Error(`${file}: the listing of the entries is not readable.`);
  }

  const bindingGypInTag = await fs
    .access(path.join(dir, 'binding.gyp'))
    .then(() => true, () => false);
  const problems = findEntryProblems(
    names.map((name, index) => ({ name, type: types[index] })),
    bindingGypInTag
  );
  if (problems.length) {
    throw new Error(`${file}: ${problems.join('; ')}.`);
  }

  return JSON.parse(await runText('tar', ['-xOzf', file, 'package/package.json']));
}

/** Runs a command with its output in the job log, and rejects on a non-zero exit. */
function runInherit(file, args) {
  return new Promise((resolve, reject) => {
    spawn(file, args, { stdio: 'inherit' })
      .on('error', reject)
      .on('exit', (code) =>
        code === 0 ? resolve() : reject(new Error(`${file} exited with ${code}`))
      );
  });
}

async function run() {
  const dir = path.resolve(process.argv[2] ?? 'release');
  const packed = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf-8'));
  const fileOf = new Map(packed.map((entry) => [`${entry.name}@${entry.version}`, entry.file]));
  const packages = sortByDependencies(await getPublishablePackages());

  const expected = packages.map(({ name, manifest }) => `${name}@${manifest.version}`);
  const extra = [...fileOf.keys()].filter((key) => !expected.includes(key));
  const absent = expected.filter((key) => !fileOf.has(key));
  if (extra.length || absent.length) {
    throw new Error(
      `The tarballs do not match the packages of the checkout. ` +
        `Extra: ${extra.join(', ') || 'none'}. Absent: ${absent.join(', ') || 'none'}.`
    );
  }

  const published = [];
  const skipped = [];

  for (const { name, dir: packageDir, manifest } of packages) {
    const { version } = manifest;
    const id = `${name}@${version}`;

    if (await isPublished(name, version)) {
      console.log(`Skipping ${id}: the registry holds it already`);
      skipped.push(id);
      continue;
    }

    const file = path.join(dir, path.basename(fileOf.get(id)));
    const inside = await readTarballManifest(file, packageDir);
    const changed = INSTALL_FIELDS.filter(
      (field) => !isDeepStrictEqual(inside[field], manifest[field])
    );
    if (changed.length) {
      throw new Error(
        `The package.json of ${file} differs from ${id} of the tag in: ${changed.join(', ')}.`
      );
    }

    console.log(`Publishing ${id}...`);
    try {
      await runInherit('npm', [
        'publish', file, '--provenance', '--access', 'public', '--tag', 'latest',
      ]);
    } catch (error) {
      // A `recover` run publishes the packages that npm still lacks.
      console.error(`Failed to publish ${id}:`, error.message);
      console.log(`Published: ${published.join(', ') || 'none'}`);
      console.error(
        `::error::The publish stopped at ${id}, after ${published.length} of ` +
          `${packages.length} packages. The packages after ${id} wait, because ` +
          `they can need it. Use "Re-run failed jobs", which keeps the version ` +
          `of this run. After 30 days, start a manual run on the version tag.`
      );
      throw new Error(`Failed to publish ${id}`);
    }
    published.push(id);
  }

  console.log(`Published: ${published.join(', ') || 'none'}`);
  console.log(`Skipped: ${skipped.join(', ') || 'none'}`);
  console.log('Finished');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((err) => {
    console.error('Error encountered during package publish:', err.message);
    process.exit(1);
  });
}
