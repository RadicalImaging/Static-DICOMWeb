import fs from 'fs/promises';
import { VERSION_SOURCE } from './workspace-packages.mjs';

// Writes the version that the checkout carries, from VERSION_SOURCE, to stdout.

const { version } = JSON.parse(await fs.readFile(VERSION_SOURCE, 'utf-8'));
console.log(version);
