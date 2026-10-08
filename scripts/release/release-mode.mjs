import fs from 'fs/promises';
import {
  VERSION_SOURCE,
  findUnpublished,
  getPublishablePackages,
  runText,
} from './workspace-packages.mjs';

// Writes `recover` or `release` to stdout.
//
// `release` takes a new version. `recover` publishes the version that master
// already carries. While npm lacks that version, a new version on top would
// leave the first one as a tag that npm never receives, so the run heals first.

/**
 * The packages that the release of the current version holds: publishable at
 * its tag, and at that version. A package added or made public after the tag,
 * or one at another version, is not part of that release, so npm does not
 * need it and the next release publishes it.
 */
async function packagesOfCurrentRelease() {
  const { version } = JSON.parse(await fs.readFile(VERSION_SOURCE, 'utf-8'));
  const tag = `v${version}`;
  const packages = await getPublishablePackages();
  const atTag = await Promise.all(
    packages.map(({ manifestPath }) =>
      runText('git', ['show', `${tag}:${manifestPath}`])
        .then((text) => JSON.parse(text))
        .catch(() => undefined)
    )
  );

  return packages.filter((entry, index) => {
    const tagged = atTag[index];
    return (
      entry.manifest.version === version &&
      tagged &&
      !tagged.private &&
      tagged.version === version
    );
  });
}

async function run() {
  const packages = await packagesOfCurrentRelease();
  const missing = await findUnpublished(packages);

  if (missing.length) {
    console.error(
      `npm lacks ${missing.length} of ${packages.length} packages of the ` +
        `version that master carries: ${missing.join(', ')}`
    );
    console.log('recover');
    return;
  }

  console.log('release');
}

run().catch((err) => {
  console.error('Error encountered while choosing the release mode:', err);
  process.exit(1);
});
