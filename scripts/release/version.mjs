import { execa } from 'execa';
import semver from 'semver';
import fs from 'fs/promises';
import { VERSION_SOURCE } from './workspace-packages.mjs';

// Computes the next version and writes it to version.txt.

const RELEASE_TYPES = ['patch', 'minor', 'major'];

/**
 * The bump that one commit message asks for, by the conventional commit rules:
 * `type!:` or a `BREAKING CHANGE:` footer gives a major, `feat` gives a minor,
 * and every other message (a merge commit, a non-conventional title) gives a patch.
 */
function releaseTypeOf(message) {
  const subject = message.trim().split('\n', 1)[0];

  if (
    /^\w+(\([^)]*\))?!:/.test(subject) ||
    /^BREAKING[ -]CHANGE:/m.test(message)
  ) {
    return 'major';
  }

  return /^feat\b/.test(subject) ? 'minor' : 'patch';
}

/**
 * The commit that the current version starts from: its tag, or, for a version
 * that no tag names (lerna made per-package tags up to 1.7.6), the last commit
 * that wrote the version to VERSION_SOURCE.
 */
async function baseOf(currentVersion) {
  const tag = `v${currentVersion}`;
  const { exitCode } = await execa(
    'git',
    ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`],
    { reject: false }
  );

  if (exitCode === 0) {
    return tag;
  }

  const { stdout: commit } = await execa('git', [
    'log',
    '-1',
    '--format=%H',
    `-S"version": "${currentVersion}"`,
    '--',
    VERSION_SOURCE,
  ]);

  if (!commit) {
    throw new Error(
      `Neither the tag ${tag} nor a commit that sets ${currentVersion} in ${VERSION_SOURCE} exists.`
    );
  }

  console.warn(
    `The tag ${tag} does not exist. The commits after ${commit}, which set ${currentVersion}, count.`
  );
  return commit;
}

/**
 * The commit messages since the current version. Every change that no release
 * holds yet counts, not only the tip, so a `feat` followed by a `fix` still
 * gives a minor.
 */
async function messagesSince(currentVersion) {
  const base = await baseOf(currentVersion);
  const { stdout } = await execa('git', [
    'log',
    '--format=%B%x00',
    `${base}..HEAD`,
  ]);

  return stdout.split('\0').filter((message) => message.trim());
}

async function run() {
  const { version: currentVersion } = JSON.parse(
    await fs.readFile(VERSION_SOURCE, 'utf-8')
  );
  console.log('Current version:', currentVersion);

  const messages = await messagesSince(currentVersion);
  const releaseType = messages
    .map(releaseTypeOf)
    .reduce(
      (highest, type) =>
        RELEASE_TYPES.indexOf(type) > RELEASE_TYPES.indexOf(highest)
          ? type
          : highest,
      'patch'
    );
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
