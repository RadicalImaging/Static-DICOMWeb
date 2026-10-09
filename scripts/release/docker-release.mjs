import { pathToFileURL } from 'url';
import { VERSION_SOURCE, runText } from './workspace-packages.mjs';

// Chooses and checks the release tag that the Docker image workflow builds.
//
//   node docker-release.mjs [tag]
//
// Writes `tag=`, `sha=` and `version=` lines for $GITHUB_OUTPUT.
// Needs a checkout that holds the tags and origin/master. Node built-ins only.
// Only the tags that master contains count, so that only released code gets an
// image. docker-publish-tags.sh decides whether `latest` moves.

const RELEASE_TAG = /^v(\d+)\.(\d+)\.(\d+)$/;

function compareReleases(a, b) {
  const [, ...partsA] = RELEASE_TAG.exec(a);
  const [, ...partsB] = RELEASE_TAG.exec(b);
  for (let i = 0; i < 3; i++) {
    const difference = Number(partsA[i]) - Number(partsB[i]);
    if (difference) {
      return difference;
    }
  }
  return 0;
}

/**
 * The release to build: `{ tag, version }`.
 *
 * Only `vX.Y.Z` tags of `tags` count. An empty `requested` picks the newest
 * one. A requested tag that is not a release tag of the list throws.
 */
export function chooseRelease(tags, requested = '') {
  const releases = tags.filter((tag) => RELEASE_TAG.test(tag)).sort(compareReleases);
  const newest = releases.at(-1);
  const tag = requested || newest;

  if (!tag) {
    throw new Error('master contains no release tag of the form v1.2.3.');
  }
  if (!RELEASE_TAG.test(tag)) {
    // JSON quotes the input, so a newline in it cannot start a workflow command.
    throw new Error(`${JSON.stringify(tag)} is not a release tag of the form v1.2.3.`);
  }
  if (!releases.includes(tag)) {
    throw new Error(`master contains no tag ${tag}.`);
  }

  return { tag, version: tag.slice(1) };
}

// The Dockerfile step that installs the image from pnpm-lock.yaml. The
// Dockerfile of 1.7.7 and earlier has an npm install stage instead.
const LOCKFILE_INSTALL = /^\s*RUN\b.*\bpnpm\b.*\bdeploy\b.*--prod\b/m;

/**
 * The problems of the tagged commit for an image build; an empty list accepts it.
 *
 * - `manifest`: VERSION_SOURCE at the tag, parsed, or undefined when it is missing.
 * - `dockerfile`: the Dockerfile at the tag, or undefined when it is missing.
 */
export function findTagProblems({ tag, version, manifest, dockerfile }) {
  const problems = [];

  if (!manifest) {
    problems.push(`${tag} has no ${VERSION_SOURCE}.`);
  } else if (manifest.version !== version) {
    problems.push(`${tag} carries version ${manifest.version} in ${VERSION_SOURCE}.`);
  }
  if (!LOCKFILE_INSTALL.test(dockerfile ?? '')) {
    problems.push(
      `The Dockerfile of ${tag} does not install from pnpm-lock.yaml, so this workflow does not build it. Build a release after 1.7.7.`
    );
  }

  return problems;
}

async function readAt(sha, path) {
  try {
    return await runText('git', ['show', `${sha}:${path}`]);
  } catch {
    return undefined;
  }
}

async function run() {
  const tags = (await runText('git', ['tag', '--list', '--merged', 'origin/master', 'v*'])).split('\n');
  const { tag, version } = chooseRelease(tags, process.argv[2] ?? '');
  const sha = await runText('git', ['rev-parse', `refs/tags/${tag}^{commit}`]);

  const manifestText = await readAt(sha, VERSION_SOURCE);
  const problems = findTagProblems({
    tag,
    version,
    manifest: manifestText === undefined ? undefined : JSON.parse(manifestText),
    dockerfile: await readAt(sha, 'Dockerfile'),
  });
  if (problems.length) {
    throw new Error(problems.join(' '));
  }

  console.log(`tag=${tag}\nsha=${sha}\nversion=${version}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((err) => {
    console.error(`::error::${err.message}`);
    process.exit(1);
  });
}
