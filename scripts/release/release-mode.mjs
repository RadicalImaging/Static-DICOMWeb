import { findUnpublished, getPublishablePackages } from './workspace-packages.mjs';

// Writes `recover` or `release` to stdout.
//
// `release` takes a new version. `recover` publishes the version that master
// already carries. While npm lacks that version, a new version on top would
// leave the first one as a tag that npm never receives, so the run heals first.

async function run() {
  const packages = await getPublishablePackages();
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
