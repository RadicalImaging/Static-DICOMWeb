import { runText } from './workspace-packages.mjs';

// The semver bump of a release, from the commit messages that the release holds.
// Only Node built-ins: the push job runs this to check the version commit.

const RELEASE_TYPES = ['patch', 'minor', 'major'];

/**
 * The bump that one commit message asks for, by the conventional commit rules:
 * `type!:` or a `BREAKING CHANGE:` footer gives a major, `feat` gives a minor,
 * and every other message (a merge commit, a non-conventional title) gives a patch.
 */
export function releaseTypeOf(message) {
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
 * The highest bump that any of the messages asks for. Every change that no
 * release holds yet counts, not only the tip, so a `feat` followed by a `fix`
 * still gives a minor. No messages give a patch.
 */
export function releaseTypeOfAll(messages) {
  return messages
    .map(releaseTypeOf)
    .reduce(
      (highest, type) =>
        RELEASE_TYPES.indexOf(type) > RELEASE_TYPES.indexOf(highest)
          ? type
          : highest,
      'patch'
    );
}

/**
 * The version after `version` for a bump. Only `major.minor.patch` versions:
 * this release flow never makes a prerelease, so any other form throws.
 */
export function bumpVersion(version, releaseType) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`The version ${version} is not major.minor.patch.`);
  }
  const [major, minor, patch] = version.split('.').map(Number);

  return {
    major: `${major + 1}.0.0`,
    minor: `${major}.${minor + 1}.0`,
    patch: `${major}.${minor}.${patch + 1}`,
  }[releaseType];
}

/**
 * The next version after `currentVersion`, from the commits that `head` holds
 * and the tag `v<currentVersion>` does not.
 *
 * The tag must exist. A tag that is not on the history of `head` still works,
 * because `tag..head` then starts at the merge base (v1.7.6 is a publish commit
 * next to master), and `onWarning` gets a message.
 */
export async function computeNextVersion(currentVersion, head, onWarning = () => {}) {
  const tag = `v${currentVersion}`;

  try {
    await runText('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}^{commit}`]);
  } catch {
    throw new Error(
      `The tag ${tag} of the current version does not exist. Create it on the commit that npm published as ${currentVersion}.`
    );
  }

  try {
    await runText('git', ['merge-base', '--is-ancestor', tag, head]);
  } catch {
    onWarning(`The tag ${tag} is not on the history of ${head}. The commits after the merge base count.`);
  }

  const log = await runText('git', ['log', '--format=%B%x00', `${tag}..${head}`]);
  const messages = log.split('\0').filter((message) => message.trim());
  const releaseType = releaseTypeOfAll(messages);

  return {
    nextVersion: bumpVersion(currentVersion, releaseType),
    releaseType,
    commitCount: messages.length,
  };
}
