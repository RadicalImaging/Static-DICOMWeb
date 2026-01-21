#!/usr/bin/env bun
import { Command } from 'commander';
import { instanceMain, seriesMain, studyMain, createMain, stowMain } from '../lib/index.mjs';
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
  .argument('<part10...>', 'part 10 file(s) or directory(ies)')
  .option('--dicomdir <path>', 'Base directory path where DICOMweb structure is located', '~/dicomweb')
  .action(async (fileNames, options) => {
    const createOptions = {};
    if (options.dicomdir) {
      createOptions.dicomdir = handleHomeRelative(options.dicomdir);
    }
    await createMain(fileNames, createOptions);
  });

program
  .command('stow')
  .description('Store DICOM files to a STOW-RS endpoint')
  .argument('<part10...>', 'part 10 file(s) or directory(ies)')
  .option('--url <url>', 'URL endpoint for STOW-RS storage', 'http://localhost:5000/dicomweb/studies')
  .option('--header <header>', 'Additional HTTP header in format "Key: Value" (can be specified multiple times)')
  .option('--max-group-size <size>', 'Maximum size in bytes for grouping files (default: 10MB)', '10485760')
  .option('--send-as-single-files', 'Send each file individually instead of grouping')
  .action(async (fileNames, options) => {
    const stowOptions = {
      url: options.url
    };
    
    // Parse additional headers if provided
    if (options.header) {
      const headers = Array.isArray(options.header) ? options.header : [options.header];
      stowOptions.headers = {};
      headers.forEach(header => {
        const [key, ...valueParts] = header.split(':');
        if (key && valueParts.length > 0) {
          stowOptions.headers[key.trim()] = valueParts.join(':').trim();
        }
      });
    }
    
    // Parse max group size (accepts numbers or strings with units like "10MB", "5MB", etc.)
    if (options.maxGroupSize) {
      const sizeStr = String(options.maxGroupSize).toUpperCase();
      if (sizeStr.endsWith('MB')) {
        stowOptions.maxGroupSize = parseInt(sizeStr) * 1024 * 1024;
      } else if (sizeStr.endsWith('KB')) {
        stowOptions.maxGroupSize = parseInt(sizeStr) * 1024;
      } else if (sizeStr.endsWith('GB')) {
        stowOptions.maxGroupSize = parseInt(sizeStr) * 1024 * 1024 * 1024;
      } else {
        stowOptions.maxGroupSize = parseInt(options.maxGroupSize);
      }
    }
    
    // Add sendAsSingleFiles flag if specified
    if (options.sendAsSingleFiles) {
      stowOptions.sendAsSingleFiles = true;
    }
    
    await stowMain(fileNames, stowOptions);
  });

program.parse();