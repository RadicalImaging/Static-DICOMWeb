import fs from 'fs/promises';
import path from 'path';
import { getPublishablePackages, runText } from './workspace-packages.mjs';

// Packs each publishable package into release/, and writes release/manifest.json.
//
// The build job packs, and a separate job publishes the tarballs. Only that job
// can get an npm OIDC token, so no dependency script runs while a token exists.

const OUT_DIR = path.resolve('release');

async function run() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const packages = await getPublishablePackages();
  const manifest = [];

  for (const { name, dir, manifest: { version } } of packages) {
    const [packed] = JSON.parse(
      await runText('npm', ['pack', '--json', '--pack-destination', OUT_DIR], { cwd: dir })
    );
    console.log(`Packed ${name}@${version} as ${packed.filename}`);
    manifest.push({ name, version, file: packed.filename });
  }

  await fs.writeFile(
    path.join(OUT_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  );
}

run().catch((err) => {
  console.error('Error encountered while packing the packages:', err);
  process.exit(1);
});
