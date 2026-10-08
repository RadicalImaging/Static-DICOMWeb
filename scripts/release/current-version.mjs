import { readCurrentVersion } from './workspace-packages.mjs';

// Writes the version that the checkout carries, from VERSION_SOURCE, to stdout.

console.log(await readCurrentVersion());
