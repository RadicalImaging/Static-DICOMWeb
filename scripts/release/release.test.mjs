import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bumpVersion, releaseTypeOf, releaseTypeOfAll } from './release-type.mjs';
import { sortByDependencies } from './workspace-packages.mjs';
import { findProblems } from './verify-version-commit.mjs';
import { findEntryProblems } from './publish-package.mjs';
import { chooseRelease, findTagProblems } from './docker-release.mjs';

test('the bump follows the conventional commit rules', () => {
  assert.equal(bumpVersion('1.7.6', 'patch'), '1.7.7');
  assert.equal(bumpVersion('1.7.6', 'minor'), '1.8.0');
  assert.equal(bumpVersion('1.7.6', 'major'), '2.0.0');
  assert.equal(releaseTypeOf('fix(series)!: drop the old layout'), 'major');
  assert.equal(releaseTypeOf('fix: a\n\nBREAKING CHANGE: the API moved'), 'major');
  assert.equal(releaseTypeOf('feat(scp): add C-GET'), 'minor');
  assert.equal(releaseTypeOf('Merge branch master'), 'patch');
  assert.equal(releaseTypeOfAll(['feat: a', 'fix: b']), 'minor');
  assert.equal(releaseTypeOfAll([]), 'patch');
});

test('each package publishes after the packages that it needs', () => {
  const pkg = (name, dependencies = {}) => ({ name, manifest: { dependencies } });
  const order = sortByDependencies([
    pkg('a-create', { 'c-util': '>=1.0.0', 'b-cs3d': '>=1.0.0' }),
    pkg('b-cs3d'),
    pkg('c-util', { 'b-cs3d': '>=1.0.0' }),
  ]).map(({ name }) => name);

  assert.deepEqual(order, ['b-cs3d', 'c-util', 'a-create']);
});

const manifest = (version, utilRange, extra = {}) => ({
  name: '@x/create',
  version,
  dependencies: { '@x/util': utilRange, dcmjs: '0.52.0' },
  ...extra,
});
const util = (version) => ({ name: '@x/util', version });
const lockfileDiff = [
  '@@ -297,3 +297,3 @@ importers:',
  "       '@x/util':",
  "-        specifier: '>=1.7.6'",
  "+        specifier: '>=1.7.7'",
  '         version: link:../util',
].join('\n');
const commit = (createAfter, diff = lockfileDiff) => ({
  tag: 'v1.7.7',
  expectedVersion: '1.7.7',
  subject: 'chore(release): publish v1.7.7 [skip ci]',
  files: ['packages/create/package.json', 'packages/util/package.json', 'pnpm-lock.yaml'],
  manifests: [
    { path: 'packages/create/package.json', before: manifest('1.7.6', '>=1.7.6'), after: createAfter },
    { path: 'packages/util/package.json', before: util('1.7.6'), after: util('1.7.7') },
  ],
  lockfileDiff: diff,
  nextVersion: '1.7.7',
});

test('the version commit check accepts only the changes of a release', () => {
  assert.deepEqual(findProblems(commit(manifest('1.7.7', '>=1.7.7'))), []);

  assert.notDeepEqual(
    findProblems(commit(manifest('1.7.7', '>=1.7.7', { scripts: { postinstall: 'curl x | sh' } }))),
    []
  );
  assert.notDeepEqual(
    findProblems(commit(manifest('1.7.7', '>=1.7.7'), `${lockfileDiff}\n       dcmjs:\n-        specifier: 0.52.0\n+        specifier: 1.7.7`)),
    []
  );
});

test('a tarball holds each path once, as a file or a directory under package/', () => {
  const file = (name) => ({ name, type: '-' });
  const clean = [{ name: 'package/', type: 'd' }, file('package/package.json'), file('package/lib/index.js')];

  assert.deepEqual(findEntryProblems(clean), []);
  assert.deepEqual(findEntryProblems([...clean, file('package/binding.gyp')], ['binding.gyp']), []);
  for (const entries of [
    [...clean, file('zz/package.json')],
    [...clean, file('package/./package.json')],
    [...clean, file('package//package.json')],
    [...clean, file('package/PACKAGE.JSON')],
    [...clean, { name: 'package/link', type: 'l' }],
    [...clean, file('package/binding.gyp')],
    [...clean, file('package/npm-shrinkwrap.json')],
    [...clean, file('package/node_modules/x/index.js')],
  ]) {
    assert.notDeepEqual(findEntryProblems(entries), [], entries.at(-1).name);
  }
});

test('the Docker image builds a release tag, and only the newest one moves latest', () => {
  const tags = ['v1.5.0', 'v1.10.0', 'v1.9.2', 'v2.0.0-beta.1', 'healthlake-v1.0.0'];

  assert.deepEqual(chooseRelease(tags), { tag: 'v1.10.0', version: '1.10.0', latest: true });
  assert.deepEqual(chooseRelease(tags, 'v1.9.2'), { tag: 'v1.9.2', version: '1.9.2', latest: false });
  for (const requested of ['v2.0.0-beta.1', 'v1.9.3', '1.9.2']) {
    assert.throws(() => chooseRelease(tags, requested), undefined, requested);
  }
});

test('the Docker image builds only a tag that carries its version and the lockfile install', () => {
  const tag = { tag: 'v1.8.0', version: '1.8.0', manifest: { version: '1.8.0' } };
  const dockerfile = 'RUN pnpm --filter @x/server deploy --prod /deploy';

  assert.deepEqual(findTagProblems({ ...tag, dockerfile }), []);
  assert.equal(findTagProblems({ ...tag, manifest: { version: '1.7.9' }, dockerfile }).length, 1);
  assert.equal(findTagProblems({ ...tag, manifest: undefined, dockerfile }).length, 1);
  assert.equal(findTagProblems({ ...tag, dockerfile: 'RUN npm install ./x.tgz' }).length, 1);
  assert.equal(findTagProblems({ ...tag, dockerfile: '# RUN pnpm deploy --prod /deploy' }).length, 1);
});
