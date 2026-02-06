#!/usr/bin/env bun
import { Command } from 'commander';
<<<<<<< HEAD
import { instanceMain, seriesMain, studyMain, createMain, stowMain, thumbnailMain, indexMain, part10Main } from '../lib/index.mjs';
import { handleHomeRelative, createVerboseLog } from '@radicalimaging/static-wado-util';
=======
import { instanceMain, seriesMain, studyMain, createMain, stowMain, thumbnailMain, indexMain } from '../lib/index.mjs';
import {
  handleHomeRelative,
  createVerboseLog,
  parseTimeoutToMs,
  parseSizeToBytes,
} from '@radicalimaging/static-wado-util';
>>>>>>> origin/master

const program = new Command();

// Initialize verbose logging with defaults
createVerboseLog(false, {});

// Helper function to update verbose logging from program options
const updateVerboseLog = () => {
  const opts = program.opts();
  createVerboseLog(opts.verbose, { quiet: opts.quiet });
};

program
  .name('createdicomweb')
  .description('dcmjs based tools for creation of metadata files')
  .version('0.0.1')
  .option('-v, --verbose', 'Enable verbose logging')
  .option('-q, --quiet', 'Disable noQuiet logging');

program
  .command('instance')
  .description('Store instance data')
  .argument('<part10>', 'part 10 file(s)')
  .option('--dicomdir <path>', 'Base directory path where binary .mht files will be written in DICOMweb structure','~/dicomweb')
  .action(async (fileName, options) => {
    updateVerboseLog();
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
    updateVerboseLog();
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
    updateVerboseLog();
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
  .option('--no-study-index', 'Skip creating/updating studies/index.json.gz file')
  .action(async (fileNames, options) => {
    updateVerboseLog();
    const createOptions = {};
    if (options.dicomdir) {
      createOptions.dicomdir = handleHomeRelative(options.dicomdir);
    }
    // studyIndex defaults to true unless --no-study-index is specified
    createOptions.studyIndex = options.studyIndex !== false;
    await createMain(fileNames, createOptions);
  });

program
  .command('stow')
  .description('Store DICOM files to a STOW-RS endpoint')
  .argument('<part10...>', 'part 10 file(s) or directory(ies)')
  .option(
    '--url <url>',
    'URL endpoint for STOW-RS storage',
    'http://localhost:5000/dicomweb/studies'
  )
  .option(
    '--header <header>',
    'Additional HTTP header in format "Key: Value" (can be specified multiple times)'
  )
  .option(
    '--max-group-size <size>',
    'Maximum size for grouping files: bytes or with units (k/m/g/t, e.g. 10m, 1g, 2t). Default: 10m',
    '10m'
  )
  .option('--send-as-single-files', 'Send each file individually instead of grouping')
  .option('--xml-response', 'Request XML response format instead of JSON')
  .option(
    '--timeout <duration>',
    'Request timeout: hours (10h), minutes (10m), or seconds (3600 or 3600s)'
  )
  .option('--parallel <N>', 'Number of parallel STOW-RS requests', '1')
  .option(
    '--no-filename-check',
    'Upload all files regardless of extension (default: skip .gz, .json, .md, .txt, .xml, .pdf, .jpg, .png, .html, .zip, etc.)'
  )
  .action(async (fileNames, options) => {
    updateVerboseLog();
    const stowOptions = {
      url: options.url,
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

    // Parse max group size (accepts numbers or strings with units like 10m, 10MB, 1g, 2t, etc.)
    if (options.maxGroupSize) {
      stowOptions.maxGroupSize = parseSizeToBytes(options.maxGroupSize);
    }

    // Add sendAsSingleFiles flag if specified
    if (options.sendAsSingleFiles) {
      stowOptions.sendAsSingleFiles = true;
    }

    // Add xmlResponse flag if specified
    if (options.xmlResponse) {
      stowOptions.xmlResponse = true;
    }

    // Parse timeout (e.g. 10h, 10m, 3600, 3600s) to milliseconds
    if (options.timeout) {
      stowOptions.timeoutMs = parseTimeoutToMs(options.timeout);
    }

    const parallel = parseInt(options.parallel, 10);
    if (!Number.isNaN(parallel) && parallel >= 1) {
      stowOptions.parallel = parallel;
    }

    if (options.filenameCheck === false) {
      stowOptions.filenameCheck = false;
    }

    await stowMain(fileNames, stowOptions);
  });

/**
 * Parses a frame numbers string into an array of frame numbers
 * Supports comma-separated values and ranges (e.g., "1-3,17" -> [1, 2, 3, 17])
 * @param {string} frameNumbersStr - Frame numbers string (e.g., "1-3,17")
 * @returns {number[]} - Array of frame numbers
 */
function parseFrameNumbers(frameNumbersStr) {
  if (!frameNumbersStr) {
    return [1]; // Default to frame 1
  }

  const frames = new Set();
  const parts = frameNumbersStr.split(',').map(part => part.trim());

  for (const part of parts) {
    if (part.includes('-')) {
      // Handle range (e.g., "1-3")
      const [start, end] = part.split('-').map(n => parseInt(n.trim(), 10));
      if (isNaN(start) || isNaN(end)) {
        throw new Error(`Invalid frame range: ${part}`);
      }
      if (start > end) {
        throw new Error(`Invalid frame range: start (${start}) must be <= end (${end})`);
      }
      for (let i = start; i <= end; i++) {
        frames.add(i);
      }
    } else {
      // Handle single number
      const frameNum = parseInt(part, 10);
      if (isNaN(frameNum)) {
        throw new Error(`Invalid frame number: ${part}`);
      }
      frames.add(frameNum);
    }
  }

  return Array.from(frames).sort((a, b) => a - b);
}

program
  .command('thumbnail')
  .description('Generate thumbnail(s) for DICOM instance(s)')
  .argument('<studyUID>', 'Study Instance UID (required)')
  .option('--dicomdir <path>', 'Base directory path where DICOMweb structure is located', '~/dicomweb')
  .option('--series-uid <seriesUID>', 'Specific Series Instance UID to process (if not provided, uses first series from study query)')
  .option('--sop-uid <sopUID>', 'Specific SOP Instance UID to process (if not provided, uses first instance from series)')
  .option('--frame-numbers <frames>', 'Frame numbers to generate thumbnails for (comma-separated, supports ranges, e.g., "1-3,17")', '1')
  .option('--series-thumbnail', 'Generate thumbnails for series (middle SOP instance, middle frame for multiframe)')
  .action(async (studyUID, options) => {
    updateVerboseLog();
    const thumbnailOptions = {};
    if (options.dicomdir) {
      thumbnailOptions.dicomdir = handleHomeRelative(options.dicomdir);
    }
    if (options.seriesUid) {
      thumbnailOptions.seriesUid = options.seriesUid;
    }
    if (options.sopUid) {
      thumbnailOptions.instanceUid = options.sopUid;
    }
    if (options.seriesThumbnail) {
      thumbnailOptions.seriesThumbnail = true;
    }
    
    // Parse frame numbers
    try {
      const frameNumbers = parseFrameNumbers(options.frameNumbers);
      thumbnailOptions.frameNumbers = frameNumbers;
    } catch (error) {
      console.error(`Error parsing frame numbers: ${error.message}`);
      process.exit(1);
    }
    
    await thumbnailMain(studyUID, thumbnailOptions);
  });

program
  .command('index')
  .description('Create or update studies/index.json.gz file by adding/updating study information')
  .argument('[studyUIDs...]', 'Optional Study Instance UID(s) to process (if not provided, scans all studies)')
  .option('--dicomdir <path>', 'Base directory path where DICOMweb structure is located', '~/dicomweb')
  .action(async (studyUIDs, options) => {
    updateVerboseLog();
    const indexOptions = {};
    if (options.dicomdir) {
      indexOptions.dicomdir = handleHomeRelative(options.dicomdir);
    }
    await indexMain(studyUIDs, indexOptions);
  });

program
  .command('part10')
  .description('Export DICOMweb metadata to Part 10 DICOM files')
  .argument('<studyUID>', 'Study Instance UID')
  .option('--dicomdir <path>', 'Base directory path where DICOMweb structure is located', '~/dicomweb')
  .option('--series-uid <seriesUID>', 'Specific Series Instance UID to export (if not provided, exports all series)')
  .option('-o, --output <dir>', 'Output directory for Part 10 files', '.')
  .option('--continue-on-error', 'Continue processing even if an instance fails')
  .action(async (studyUID, options) => {
    updateVerboseLog();
    const part10Options = {
      dicomdir: handleHomeRelative(options.dicomdir),
      outputDir: options.output,
    };
    if (options.seriesUid) {
      part10Options.seriesUid = options.seriesUid;
    }
    if (options.continueOnError) {
      part10Options.continueOnError = true;
    }
    await part10Main(studyUID, part10Options);
  });

program.parse();