import { pathToFileURL } from 'url';
import { VERSION_SOURCE, runText } from './workspace-packages.mjs';

// Chooses and checks the release tag that the Docker image workflow builds.
//
//   node docker-release.mjs [tag]
//
// Writes `tag=`, `sha=`, `version=` and `latest=` lines for $GITHUB_OUTPUT.
// Needs a checkout that holds the tags and origin/master. Node built-ins only.
// Only the tags that master contains count, so that only released code gets an
// image, and a stray tag cannot take `latest`.

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
 * The release to build: `{ tag, version, latest }`.
 *
 * Only `vX.Y.Z` tags of `tags` count. An empty `requested` picks the newest
 * one. Only the newest release moves `latest`, so a rebuild of an older
 * release never moves `latest` back. A requested tag that is not a release
 * tag of the list throws.
 */
export function chooseRelease(tags, requested = '') {
  const releases = tags.filter((tag) => RELEASE_TAG.test(tag)).sort(compareReleases);
  const newest = releases.at(-1);
  const tag = requested || newest;

  // JSON quotes the input, so a newline in it cannot start a workflow command.
  if (!tag) {
    throw new Error('master contains no release tag of the form v1.2.3.');
  }
  if (!RELEASE_TAG.test(tag)) {
    throw new Error(`${JSON.stringify(tag)} is not a release tag of the form v1.2.3.`);
  }
  if (!releases.includes(tag)) {
    throw new Error(`master contains no tag ${tag}.`);
  }

  return { tag, version: tag.slice(1), latest: tag === newest };
}

async function run() {
  const tags = (await runText('git', ['tag', '--list', '--merged', 'origin/master', 'v*'])).split('\n');
  const { tag, version, latest } = chooseRelease(tags, process.argv[2] ?? '');
  const sha = await runText('git', ['rev-parse', `${tag}^{commit}`]);

  let tagged;
  try {
    tagged = JSON.parse(await runText('git', ['show', `${sha}:${VERSION_SOURCE}`]));
  } catch {
    throw new Error(`${tag} has no ${VERSION_SOURCE}, so it is older than the image build.`);
  }
  if (tagged.version !== version) {
    throw new Error(`${tag} carries version ${tagged.version} in ${VERSION_SOURCE}.`);
  }

  console.log(`tag=${tag}\nsha=${sha}\nversion=${version}\nlatest=${latest}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((err) => {
    console.error(`::error::${err.message}`);
    process.exit(1);
  });
}
