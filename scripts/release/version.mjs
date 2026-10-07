import { execa } from 'execa';
import semver from 'semver';
import fs from 'fs/promises';
import { VERSION_SOURCE } from './workspace-packages.mjs';

// Computes the next version and writes it to version.txt.
// A last commit message that starts with `feat` bumps the minor version; anything else bumps the patch.

async function run() {
  const { version: currentVersion } = JSON.parse(
    await fs.readFile(VERSION_SOURCE, 'utf-8')
  );
  console.log('Current version:', currentVersion);

  const { stdout: lastCommitMessage } = await execa('git', [
    'log',
    '--format=%B',
    '-n',
    '1',
  ]);
  const releaseType = lastCommitMessage.trim().startsWith('feat')
    ? 'minor'
    : 'patch';
  const nextVersion = semver.inc(currentVersion, releaseType);

  if (!nextVersion) {
    throw new Error(`Could not determine the next version after ${currentVersion}`);
  }

  console.log(`Next version (${releaseType}):`, nextVersion);
  await fs.writeFile('./version.txt', nextVersion);
}

run().catch((err) => {
  console.error('Error encountered while computing the next version:', err);
  process.exit(1);
});
