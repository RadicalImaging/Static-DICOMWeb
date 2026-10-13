import fs from 'fs';
import os from 'os';
import path from 'path';
import { createVerboseLog } from '@radicalimaging/static-wado-util';
import DeployGroup from '../../lib/DeployGroup.mjs';

createVerboseLog(false, { quiet: true });

describe('DeployGroup.retrieve', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-group-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('downloads again, with force, when a local copy fails shouldSkip', async () => {
    const stale = path.join(dir, 'studies', '1', 'series.gz');
    fs.mkdirSync(path.dirname(stale), { recursive: true });
    fs.writeFileSync(stale, 'old');

    const group = new DeployGroup({ deployGroup: { dir } }, 'deploy');
    const retrieve = jest.fn(async () => {});
    group.ops = {
      dir: async () => [{ relativeUri: 'studies/1/series', fileName: 'studies/1/series.gz' }],
      shouldSkip: async () => false,
      retrieve,
    };

    const result = await group.retrieve({}, 'studies/1');

    expect(result.retrieved).toBe(1);
    expect(retrieve).toHaveBeenCalledWith('studies/1/series', stale, { force: true });
  });
});
