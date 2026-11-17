/* eslint-disable */
import path from 'path';
import fs from 'fs';
import { dirScanner } from '@radicalimaging/static-wado-util';
import { execFileSync } from 'node:child_process';
import commonMain from './commonMain.mjs';
import extractSop from './extractSop.mjs';

export async function leiConvert(sourcePath, config, name, options, deployer) {
  const dirName = options.name || path.basename(sourcePath);
  const destPath = `${deployer.baseDir}/lei/${dirName}`;
  if (!fs.existsSync(destPath)) {
    fs.mkdirSync(destPath, { recursive: true });
  }

  let n = 0;
  let failed = 0;
  // Now, iterate over files in sourcePath
  await dirScanner(sourcePath, {
    recursive: true,
    // An unreadable path (for example EACCES or EIO) fails, and the conversion continues
    onError: () => {
      failed += 1;
    },
    callback: async file => {
      try {
        // Capture instanceUID
        const sopUID = await extractSop(file);
        if (!sopUID) return;
        const destFileName = path.join(destPath, `${sopUID}.dcm`);
        // Execute dcm2dcm <sourcePath> <destPath>/<dirName>/<uid>.dcm
        execFileSync('dcm2dcm.bat', [file, destFileName], { stdio: 'inherit' });
        n += 1;
      } catch (e) {
        failed += 1;
        console.error("Couldn't convert", file, e?.message ?? e);
      }
    },
  });
  console.log('Converted', n, 'files');
  if (failed > 0) {
    console.error(failed, 'path(s) failed');
    // A path that failed gives a non-zero exit code (CLI-U1)
    process.exitCode = 1;
  }
  return destPath;
}

export default async function (sourcePath, options) {
  console.log('sourcePath=', sourcePath);
  console.log('options=', options.name);
  await commonMain(this, 'upload', options, leiConvert.bind(null, sourcePath));
}
