// The semver bump of a release, from the commit messages that the release holds.

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
