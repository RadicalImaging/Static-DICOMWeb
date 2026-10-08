import { pathToFileURL } from 'url';
import {
  DEPENDENCY_TYPES,
  VERSION_SOURCE,
  runText,
} from './workspace-packages.mjs';

// Checks that a version commit changes only what publish-version.mjs changes.
//
//   node verify-version-commit.mjs <tag> <expected parent>
//
// The deploy key pushes the version commit to master past the review, and the
// job that made the commit ran the scripts of every dependency. So the push job
// runs this check, with Node built-ins only, before the push.

const ALLOWED_FILE = /^(pnpm-lock\.yaml|packages\/[^/]+\/package\.json)$/;
const VERSION = String.raw`\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?`;

function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True when `next` is above `current`, by major, minor and patch. */
function isAbove(next, current) {
  const parts = (version) => version.split('-')[0].split('.').map(Number);
  const [a, b] = [parts(next), parts(current)];
  const index = a.findIndex((value, i) => value !== b[i]);
  return index !== -1 && a[index] > b[index];
}

/**
 * The problems of a version commit; an empty list accepts it.
 *
 * - `manifests`: `{ path, before, after }` for each changed package.json, parsed.
 * - `lockfileDiff`: the output of `git diff -U1` for pnpm-lock.yaml.
 * - `currentVersion`: the version of VERSION_SOURCE in the parent.
 *
 * The tag must be `v<nextVersion>`, above `currentVersion`. Each manifest may
 * change only its `version`, to `nextVersion`, and the range of a dependency on
 * a package that moves to `nextVersion`, to `[>=]nextVersion` with the same
 * prefix. The lockfile may change only the `specifier:` lines of those
 * dependencies, to `[>=]nextVersion`: a resolved version, an integrity hash, a
 * third-party specifier or a new package fails the check.
 */
export function findProblems({
  tag,
  subject,
  files,
  manifests,
  lockfileDiff,
  nextVersion,
  currentVersion,
}) {
  const problems = [];
  const expectedSubject = `chore(release): publish v${nextVersion} [skip ci]`;

  if (subject !== expectedSubject) {
    problems.push(`The subject is "${subject}", not "${expectedSubject}".`);
  }
  if (tag !== `v${nextVersion}`) {
    problems.push(`The tag ${tag} does not name the version ${nextVersion} of the commit.`);
  }
  if (!new RegExp(`^${VERSION}$`).test(nextVersion) || !isAbove(nextVersion, currentVersion)) {
    problems.push(`The version ${nextVersion} is not above ${currentVersion}.`);
  }

  for (const file of files) {
    if (!ALLOWED_FILE.test(file)) {
      problems.push(`The commit changes ${file}.`);
    }
  }

  const moved = new Set(
    manifests
      .filter(({ before, after }) => before && after && after.version === nextVersion)
      .map(({ after }) => after.name)
  );
  const range = (prefix) => new RegExp(`^${prefix}${VERSION}$`);

  for (const { path, before, after } of manifests) {
    if (!before || !after) {
      problems.push(`The commit adds or removes ${path}.`);
      continue;
    }

    const normalized = structuredClone(after);
    if (after.version !== before.version) {
      if (after.version !== nextVersion) {
        problems.push(`${path}: version ${before.version} -> ${after.version}.`);
      }
      normalized.version = before.version;
    }

    for (const type of DEPENDENCY_TYPES) {
      for (const [name, value] of Object.entries(after[type] ?? {})) {
        const old = before[type]?.[name];
        if (old === undefined || old === value) {
          continue;
        }
        const prefix = old.startsWith('>=') ? '>=' : '';
        if (
          !moved.has(name) ||
          !range(prefix).test(old) ||
          value !== `${prefix}${nextVersion}`
        ) {
          problems.push(`${path}: ${type} ${name} ${old} -> ${value}.`);
        }
        normalized[type][name] = old;
      }
    }

    if (JSON.stringify(normalized) !== JSON.stringify(before)) {
      problems.push(`${path}: the commit changes more than the version and the ranges of the release.`);
    }
  }

  // With one line of context, the line above each specifier names its dependency:
  //       '@radicalimaging/cs3d':
  //   -     specifier: '>=1.7.6'
  //   +     specifier: '>=1.7.7'
  const removed = new RegExp(`^-\\s+specifier: '?(>=)?${VERSION}'?$`);
  const added = new RegExp(`^\\+\\s+specifier: '?(>=)?${escape(nextVersion)}'?$`);
  const dependencyName = /^ \s+'?([^':\s]+)'?:$/;
  const lines = lockfileDiff.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^(diff |index |--- |\+\+\+ |@@| )/.test(line) || line === '') {
      continue;
    }
    const name = lines[i - 1]?.match(dependencyName)?.[1];
    if (removed.test(line) && added.test(lines[i + 1] ?? '') && moved.has(name)) {
      i += 1;
      continue;
    }
    problems.push(`pnpm-lock.yaml: ${line}`);
  }

  return problems;
}

async function readJsonAt(ref, path) {
  try {
    return JSON.parse(await runText('git', ['show', `${ref}:${path}`]));
  } catch {
    return undefined;
  }
}

async function run() {
  const [tag, expectedParent] = process.argv.slice(2);
  if (!tag || !expectedParent) {
    throw new Error('Usage: verify-version-commit.mjs <tag> <expected parent>');
  }

  const commit = await runText('git', ['rev-parse', '--verify', `refs/tags/${tag}^{commit}`]);
  const parents = (await runText('git', ['rev-list', '--parents', '-n', '1', commit]))
    .split(' ')
    .slice(1);
  const parent = await runText('git', ['rev-parse', '--verify', `${expectedParent}^{commit}`]);

  if (parents.length !== 1 || parents[0] !== parent) {
    throw new Error(`${commit} must have the one parent ${parent}, and it has: ${parents.join(' ') || 'none'}.`);
  }

  const subject = await runText('git', ['log', '-1', '--format=%s', commit]);
  const nextVersion = subject.match(/^chore\(release\): publish v(\S+) /)?.[1] ?? '';
  const files = (await runText('git', ['diff', '--name-only', '--no-renames', parent, commit]))
    .split('\n')
    .filter(Boolean);
  const manifests = await Promise.all(
    files
      .filter((file) => file.endsWith('/package.json'))
      .map(async (path) => ({
        path,
        before: await readJsonAt(parent, path),
        after: await readJsonAt(commit, path),
      }))
  );
  const lockfileDiff = await runText('git', [
    'diff', '-U1', '--no-color', parent, commit, '--', 'pnpm-lock.yaml',
  ]);
  const currentVersion = (await readJsonAt(parent, VERSION_SOURCE))?.version ?? '';

  const problems = findProblems({
    tag, subject, files, manifests, lockfileDiff, nextVersion, currentVersion,
  });
  if (problems.length) {
    problems.forEach((problem) => console.error(`::error::${problem}`));
    throw new Error(`The version commit ${commit} changes more than the release.`);
  }

  console.log(`The version commit ${commit} (v${nextVersion}) changes only the release.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((err) => {
    console.error('Error encountered while checking the version commit:', err.message);
    process.exit(1);
  });
}
