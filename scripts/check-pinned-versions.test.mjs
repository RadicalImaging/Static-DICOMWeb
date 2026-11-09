import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SCRIPT = path.join(import.meta.dirname, 'check-pinned-versions.sh');
const skip = spawnSync('bash', ['-c', 'command -v jq']).status !== 0 && 'jq is not installed';

/** Runs the check on a scratch repository with these overrides and one package dependency */
function check(overrides, dependency = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pinned-'));
  fs.mkdirSync(path.join(root, 'packages', 'a'), { recursive: true });
  fs.writeFileSync(path.join(root, 'pnpm-workspace.yaml'), `overrides:\n${overrides}\n`);
  fs.writeFileSync(
    path.join(root, 'packages', 'a', 'package.json'),
    JSON.stringify({ name: 'a', version: '1.0.0', dependencies: dependency })
  );
  const { status, stderr } = spawnSync('bash', [SCRIPT], {
    env: { ...process.env, REPO_ROOT: root },
    encoding: 'utf-8',
  });
  fs.rmSync(root, { recursive: true, force: true });
  return { ok: status === 0, stderr };
}

const ALIAS = 'npm:@dcmjs-org/dcmjs@1.0.0-beta.10';

test('the check accepts exact versions and aliases', { skip }, () => {
  assert.deepEqual(check(`  dcmjs: ${ALIAS}`, { dcmjs: ALIAS }), { ok: true, stderr: '' });
  assert.equal(check(`  'a@>=1.0.0 <2.0.0': ${ALIAS}`).ok, true);
});

test('the check rejects a version that is not exact', { skip }, () => {
  assert.equal(check('  dcmjs: npm:@dcmjs-org/dcmjs@^1.0.0').ok, false);
  assert.equal(check('  x: 1.0.0', { dcmjs: 'npm:@dcmjs-org/dcmjs@beta' }).ok, false);
});

test('the check rejects an override line that it cannot read', { skip }, () => {
  assert.match(check('  dcmjs:1.0.0').stderr, /Cannot read the override line/);
  assert.match(check('  dcmjs:\n    1.0.0').stderr, /Cannot read the override line/);
});

test('a package.json repeats the value of an override', { skip }, () => {
  const { ok, stderr } = check(`  dcmjs: ${ALIAS}`, { dcmjs: 'npm:@dcmjs-org/dcmjs@1.0.0-beta.9' });
  assert.equal(ok, false);
  assert.match(stderr, /differs from the pnpm-workspace.yaml override/);
});
