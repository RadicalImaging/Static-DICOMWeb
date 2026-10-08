import { pathToFileURL } from 'url';
import { runText } from './workspace-packages.mjs';

// Checks that a version commit changes only what publish-version.mjs changes.
//
//   node verify-version-commit.mjs <commit> <expected parent>
//
// The deploy key pushes the version commit to master past the review, and the
// job that made the commit ran the scripts of every dependency. So the push job
// runs this check, with Node built-ins only, before the push.

const ALLOWED_FILE = /^(pnpm-lock\.yaml|packages\/[^/]+\/package\.json)$/;
const DEPENDENCY_TYPES = [
  'dependencies',
  'peerDependencies',
  'optionalDependencies',
  'devDependencies',
];
const VERSION = String.raw`\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?`;

function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The problems of a version commit; an empty list accepts it.
 *
 * - `manifests`: `{ path, before, after }` for each changed package.json, parsed.
 * - `lockfileDiff`: the output of `git diff -U0` for pnpm-lock.yaml.
 *
 * Each manifest may change only its `version`, to `nextVersion`, and the range
 * of a dependency on a package that moves to `nextVersion`, to
 * `[>=]nextVersion` with the same prefix. The lockfile may change only the
 * `specifier:` lines, to `[>=]nextVersion`: a resolved version, an integrity
 * hash or a new package fails the check.
 */
export function findProblems({ subject, files, manifests, lockfileDiff, nextVersion }) {
  const problems = [];
  const expectedSubject = `chore(release): publish v${nextVersion} [skip ci]`;

  if (subject !== expectedSubject) {
    problems.push(`The subject is "${subject}", not "${expectedSubject}".`);
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

  const removed = new RegExp(`^-\\s+specifier: '?(>=)?${VERSION}'?$`);
  const added = new RegExp(`^\\+\\s+specifier: '?(>=)?${escape(nextVersion)}'?$`);
  let balance = 0;
  for (const line of lockfileDiff.split('\n')) {
    if (/^(diff |index |--- |\+\+\+ |@@)/.test(line) || line === '') {
      continue;
    }
    if (removed.test(line)) {
      balance -= 1;
    } else if (added.test(line)) {
      balance += 1;
    } else {
      problems.push(`pnpm-lock.yaml: ${line}`);
    }
  }
  if (balance !== 0) {
    problems.push('pnpm-lock.yaml: the added and removed specifier lines do not pair.');
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
  const [commitRef, expectedParent] = process.argv.slice(2);
  if (!commitRef || !expectedParent) {
    throw new Error('Usage: verify-version-commit.mjs <commit> <expected parent>');
  }

  const commit = await runText('git', ['rev-parse', '--verify', `${commitRef}^{commit}`]);
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
    'diff', '-U0', '--no-color', parent, commit, '--', 'pnpm-lock.yaml',
  ]);

  const problems = findProblems({ subject, files, manifests, lockfileDiff, nextVersion });
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
