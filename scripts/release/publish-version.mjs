import { execa } from 'execa';
import fs from 'fs/promises';
import semver from 'semver';
import {
  DEPENDENCY_TYPES,
  getAllPackages,
  isPublishable,
} from './workspace-packages.mjs';

// Sets every package to the version in version.txt, then commits and tags that
// change locally. The publish workflow pushes the commit and the tag.

// `stdin: 'ignore'` gives a child that asks a question an end of file at once,
// so the command fails instead of holding the release until the job times out.
function runCommand(file, args, options) {
  return execa(file, args, { ...options, stdin: 'ignore' });
}

async function run() {
  const nextVersion = (await fs.readFile('./version.txt', 'utf-8')).trim();

  if (!nextVersion) {
    throw new Error('version.txt is empty. Run version.mjs first.');
  }

  console.log('Next version:', nextVersion);

  // One read, then one filter, so the versions written below reach the same
  // manifest objects that are written to disk.
  const allPackages = await getAllPackages();
  const publishable = allPackages.filter(isPublishable);
  const publishableNames = new Set(publishable.map((entry) => entry.name));

  for (const entry of publishable) {
    entry.manifest.version = nextVersion;
  }

  // Each dependency on a package of this release moves with the release, and
  // keeps its `>=` prefix so consumers still accept later releases. Any other
  // range (`^`, `workspace:`) stops the release, because the rewrite to an
  // exact version would change what consumers accept.
  for (const entry of allPackages) {
    for (const dependencyType of DEPENDENCY_TYPES) {
      const dependencies = entry.manifest[dependencyType];

      if (!dependencies) {
        continue;
      }

      for (const [dependency, range] of Object.entries(dependencies)) {
        if (publishableNames.has(dependency)) {
          const prefix = range.startsWith('>=') ? '>=' : '';

          if (!semver.valid(range.slice(prefix.length))) {
            throw new Error(
              `${entry.name}: ${dependencyType} ${dependency} has the range ` +
                `"${range}". Use ">=<version>" or an exact version.`
            );
          }

          dependencies[dependency] = `${prefix}${nextVersion}`;
          console.log(
            `${entry.name}: ${dependencyType} ${dependency} -> ${dependencies[dependency]}`
          );
        }
      }
    }
  }

  for (const entry of allPackages) {
    await fs.writeFile(
      entry.manifestPath,
      JSON.stringify(entry.manifest, null, 2) + '\n'
    );
  }

  // The lockfile records the version of every workspace package, and CI
  // installs with a frozen lockfile, so the lockfile moves with the versions.
  console.log('Updating the lockfile...');
  await runCommand('pnpm', [
    'install',
    '--lockfile-only',
    '--no-frozen-lockfile',
  ]);

  // Only the files that this script changed. The build and the test ran
  // before, and their output must not reach master without a review.
  await runCommand('git', [
    'add',
    '--',
    'pnpm-lock.yaml',
    ...allPackages.map((entry) => entry.manifestPath),
  ]);
  await runCommand('git', [
    'commit',
    '-m',
    `chore(release): publish v${nextVersion} [skip ci]`,
  ]);
  // A lightweight tag, as every earlier release tag of this repository is.
  await runCommand('git', [
    '-c',
    'tag.gpgsign=false',
    'tag',
    `v${nextVersion}`,
  ]);

  console.log(`Committed and tagged v${nextVersion}`);
}

run().catch((err) => {
  console.error('Error encountered during version bump:', err);
  process.exit(1);
});
