#!/usr/bin/env bun
import { Command } from 'commander';
import { instanceMain } from '../lib/index.mjs';

const program = new Command();

program
  .name('createdicomweb')
  .description('dcmjs based tools for creation of metadata files')
  .version('0.0.1');

program
  .command('instance')
  .description('Store instance data')
  .argument('<part10>', 'part 10 file(s)')
  .option('--dicomdir <path>', 'Base directory path where binary .mht files will be written in DICOMweb structure')
  // .option('-s, --separator <char>', 'separator character', ',')
  .action(async (fileName, options) => {
    const instanceOptions = {};
    if (options.dicomdir) {
      instanceOptions.dicomdir = options.dicomdir;
    }
    await instanceMain([fileName], instanceOptions);
  });


program.parse();