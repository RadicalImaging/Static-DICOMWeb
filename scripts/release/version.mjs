import fs from 'fs/promises';
import { computeNextVersion } from './release-type.mjs';
import {
  getPublishablePackages,
  isPublished,
  readCurrentVersion,
  runText,
} from './workspace-packages.mjs';

// Computes the next version and writes it to version.txt.
//
// The run stops here, before the push, when the next version exists already:
// as a tag, the atomic push fails; on npm, the publish would skip every package
// and the run would end without an error and without a release.

async function run() {
  const currentVersion = await readCurrentVersion();
  console.log('Current version:', currentVersion);

  const { nextVersion, releaseType, commitCount } = await computeNextVersion(
    currentVersion,
    'HEAD',
    (message) => console.warn(message)
  );
  console.log(`Next version (${releaseType}, from ${commitCount} commits):`, nextVersion);

  const tagExists = await runText('git', [
    'rev-parse', '--verify', '--quiet', `refs/tags/v${nextVersion}`,
  ]).then(() => true, () => false);
  if (tagExists) {
    throw new Error(`The tag v${nextVersion} exists already.`);
  }

  const packages = await getPublishablePackages();
  const held = [];
  for (const { name } of packages) {
    if (await isPublished(name, nextVersion)) {
      held.push(`${name}@${nextVersion}`);
    }
  }
  if (held.length) {
    throw new Error(`npm holds the next version already: ${held.join(', ')}.`);
  }

  await fs.writeFile('./version.txt', nextVersion);
}

run().catch((err) => {
  console.error('Error encountered while computing the next version:', err.message);
  process.exit(1);
});
