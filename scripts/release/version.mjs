import { execa } from 'execa';
import semver from 'semver';
import fs from 'fs/promises';
import { releaseTypeOfAll } from './release-type.mjs';
import { VERSION_SOURCE } from './workspace-packages.mjs';

// Computes the next version and writes it to version.txt.

/**
 * The commit messages since the current version: the commits that HEAD holds
 * and the tag of the current version does not.
 *
 * The tag must exist. A tag that is not on the history of HEAD still works,
 * because `tag..HEAD` then starts at the merge base (v1.7.6 is a publish commit
 * next to master), but the run says so.
 */
async function messagesSince(currentVersion) {
  const tag = `v${currentVersion}`;
  const { exitCode } = await execa(
    'git',
    ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}^{commit}`],
    { reject: false }
  );

  if (exitCode !== 0) {
    throw new Error(
      `The tag ${tag} of the current version does not exist. Create it on the commit that npm published as ${currentVersion}.`
    );
  }

  const { exitCode: ancestorExitCode } = await execa(
    'git',
    ['merge-base', '--is-ancestor', tag, 'HEAD'],
    { reject: false }
  );
  if (ancestorExitCode !== 0) {
    console.warn(
      `The tag ${tag} is not on the history of HEAD. The commits after the merge base count.`
    );
  }

  const { stdout } = await execa('git', [
    'log',
    '--format=%B%x00',
    `${tag}..HEAD`,
  ]);

  return stdout.split('\0').filter((message) => message.trim());
}

async function run() {
  const { version: currentVersion } = JSON.parse(
    await fs.readFile(VERSION_SOURCE, 'utf-8')
  );
  console.log('Current version:', currentVersion);

  const messages = await messagesSince(currentVersion);
  const releaseType = releaseTypeOfAll(messages);
  const nextVersion = semver.inc(currentVersion, releaseType);

  if (!nextVersion) {
    throw new Error(`Could not determine the next version after ${currentVersion}`);
  }

  console.log(
    `Next version (${releaseType}, from ${messages.length} commits):`,
    nextVersion
  );
  await fs.writeFile('./version.txt', nextVersion);
}

run().catch((err) => {
  console.error('Error encountered while computing the next version:', err);
  process.exit(1);
});
