import fs from 'fs/promises';
import path from 'path';
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
// The checkout of the tag decides the set and the order: each tarball must
// carry the name and the version of one publishable package of the tag. The
// packages go to npm in dependency order, and the first failure stops the
// publish, so npm never holds a package without the packages that it needs.
//
// The npm CLI does the publish, because the CLI exchanges the GitHub Actions
// OIDC token for npm credentials. npm trusted publishing needs npm 11.5.1 or later.
// Only Node built-ins here: this job does not install the dependencies.

async function readTarballManifest(file) {
  return JSON.parse(await runText('tar', ['-xOzf', file, 'package/package.json']));
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

  for (const { name, manifest: { version } } of packages) {
    const id = `${name}@${version}`;

    if (await isPublished(name, version)) {
      console.log(`Skipping ${id}: the registry holds it already`);
      skipped.push(id);
      continue;
    }

    const file = path.join(dir, path.basename(fileOf.get(id)));
    const inside = await readTarballManifest(file);
    if (inside.name !== name || inside.version !== version) {
      throw new Error(`${file} holds ${inside.name}@${inside.version}, not ${id}.`);
    }

    console.log(`Publishing ${id}...`);
    try {
      await runText('npm', [
        'publish', file, '--provenance', '--access', 'public', '--tag', 'latest',
      ]);
    } catch (error) {
      // A `recover` run publishes the packages that npm still lacks.
      console.error(`Failed to publish ${id}:`, error.stderr || error.message);
      console.log(`Published: ${published.join(', ') || 'none'}`);
      console.error(
        `::error::The publish stopped at ${id}, after ${published.length} of ` +
          `${packages.length} packages. The packages after ${id} wait, because ` +
          `they can need it. Re-run this workflow. If a change landed on master ` +
          `since, start a manual run on the version tag.`
      );
      throw new Error(`Failed to publish ${id}`);
    }
    published.push(id);
  }

  console.log(`Published: ${published.join(', ') || 'none'}`);
  console.log(`Skipped: ${skipped.join(', ') || 'none'}`);
  console.log('Finished');
}

run().catch((err) => {
  console.error('Error encountered during package publish:', err.message);
  process.exit(1);
});
