// A missing study gives a NOT_FOUND error from both Part 10 entry points
import fs from 'fs';
import os from 'os';
import path from 'path';
import { part10Main, generatePart10ForStudy } from '../lib/commands/part10Main.mjs';

let dicomdir;
beforeAll(() => {
  dicomdir = fs.mkdtempSync(path.join(os.tmpdir(), 'part10-not-found-'));
});
afterAll(() => fs.rmSync(dicomdir, { recursive: true, force: true }));

it.each([
  ['part10Main', () => part10Main('1.2.3', { dicomdir, outputDir: dicomdir })],
  ['generatePart10ForStudy', () => generatePart10ForStudy(dicomdir, '1.2.3')],
])('%s rejects a missing study with code NOT_FOUND', async (_name, run) => {
  await expect(run()).rejects.toMatchObject({
    code: 'NOT_FOUND',
    message: 'No series found for study 1.2.3',
  });
});
