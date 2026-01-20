#!/usr/bin/env bun
import { Command } from 'commander';
import { instanceMain, seriesMain, studyMain, createMain } from '../lib/index.mjs';
import { handleHomeRelative } from '@radicalimaging/static-wado-util';

const program = new Command();

program
  .name('createdicomweb')
  .description('dcmjs based tools for creation of metadata files')
  .version('0.0.1');

program
  .command('instance')
  .description('Store instance data')
  .argument('<part10>', 'part 10 file(s)')
  .option('--dicomdir <path>', 'Base directory path where binary .mht files will be written in DICOMweb structure','~/dicomweb')
  // .option('-s, --separator <char>', 'separator character', ',')
  .action(async (fileName, options) => {
    const instanceOptions = {};
    if (options.dicomdir) {
      instanceOptions.dicomdir = handleHomeRelative(options.dicomdir);
    }
    await instanceMain([fileName], instanceOptions);
  });

program
  .command('series')
  .description('Generate series metadata files')
  .argument('<studyUID>', 'Study Instance UID')
  .option('--dicomdir <path>', 'Base directory path where DICOMweb structure is located', '~/dicomweb')
  .option('--series-uid <seriesUID>', 'Specific Series Instance UID to process (if not provided, processes all series in the study)')
  .action(async (studyUID, options) => {
    const seriesOptions = {};
    if (options.dicomdir) {
      seriesOptions.dicomdir = handleHomeRelative(options.dicomdir);
    }
    if (options.seriesUid) {
      seriesOptions.seriesUid = options.seriesUid;
    }
    await seriesMain(studyUID, seriesOptions);
  });

program
  .command('study')
  .description('Generate study metadata files')
  .argument('<studyUID>', 'Study Instance UID')
  .option('--dicomdir <path>', 'Base directory path where DICOMweb structure is located', '~/dicomweb')
  .action(async (studyUID, options) => {
    const studyOptions = {};
    if (options.dicomdir) {
      studyOptions.dicomdir = handleHomeRelative(options.dicomdir);
    }
    await studyMain(studyUID, studyOptions);
  });

program
  .command('create')
  .description('Process instances and generate series and study metadata for all discovered studies')
  .argument('<part10>', 'part 10 file(s) or directory(ies)')
  .option('--dicomdir <path>', 'Base directory path where DICOMweb structure is located', '~/dicomweb')
  .action(async (fileName, options) => {
    const createOptions = {};
    if (options.dicomdir) {
      createOptions.dicomdir = handleHomeRelative(options.dicomdir);
    }
    await createMain([fileName], createOptions);
  });

program.parse();