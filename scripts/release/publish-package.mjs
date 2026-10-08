import { execa } from 'execa';
import { getPublishablePackages, isPublished } from './workspace-packages.mjs';

// Publishes each package that npm does not already hold at its current version.
//
// The npm CLI does the publish, because the CLI exchanges the GitHub Actions
// OIDC token for npm credentials. npm trusted publishing needs npm 11.5.1 or later.

async function run() {
  const packages = await getPublishablePackages();
  const published = [];
  const skipped = [];
  const failures = [];

  for (const { name, dir, manifest } of packages) {
    const { version } = manifest;

    if (await isPublished(name, version)) {
      console.log(`Skipping ${name}@${version}: the registry holds it already`);
      skipped.push(`${name}@${version}`);
      continue;
    }

    console.log(`Publishing ${name}@${version}...`);

    try {
      await execa(
        'npm',
        ['publish', '--provenance', '--access', 'public', '--tag', 'latest'],
        { cwd: dir, stdio: 'inherit' }
      );
      published.push(`${name}@${version}`);
    } catch (error) {
      // Every package is reported, so one broken package does not hide the others.
      console.error(
        `Failed to publish ${name}@${version}:`,
        error.shortMessage ?? error
      );
      failures.push(`${name}@${version}`);
    }
  }

  console.log(`Published: ${published.length ? published.join(', ') : 'none'}`);
  console.log(`Skipped: ${skipped.length ? skipped.join(', ') : 'none'}`);

  if (failures.length) {
    // A re-run, or the run of the next merge, runs in `recover` mode: it builds
    // the tagged commit and publishes the packages that npm still lacks.
    console.error(
      `::error::The publish stopped after ${published.length} of ` +
        `${packages.length} packages. Re-run this workflow to publish the rest ` +
        `from the tagged commit.`
    );
    throw new Error(`Failed to publish: ${failures.join(', ')}`);
  }

  console.log('Finished');
}

run().catch((err) => {
  console.error('Error encountered during package publish:', err);
  process.exit(1);
});
