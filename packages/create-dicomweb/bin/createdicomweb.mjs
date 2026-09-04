#!/usr/bin/env bun
import { createRequire } from 'module';
import { Command } from 'commander';
import { instanceMain, seriesMain, studyMain, createMain, stowMain, thumbnailMain, indexMain, part10Main, alternatesMain, transcodeMain } from '../lib/index.mjs';
import {
  handleHomeRelative,
  createVerboseLog,
  parseTimeoutToMs,
  parseSizeToBytes,
} from '@radicalimaging/static-wado-util';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');
const runtime = typeof process !== 'undefined' && process.versions?.bun
  ? `Bun ${process.versions.bun}`
  : `Node ${process.versions?.node ?? 'unknown'}`;

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
  .version(`${pkg.version}\n${runtime}`, '-V, --version', 'output create-dicomweb and runtime (Bun/Node) version')
  .option('-v, --verbose', 'Enable verbose logging')
  .option('-q, --quiet', 'Disable noQuiet logging');

/**
 * Parses the --max-open-files option into a positive integer.
 * @param {string|undefined} value - Raw option value
 * @returns {number|undefined} - Parsed count, or undefined when not specified
 */
function parseMaxOpenFiles(value) {
  if (value === undefined) {
    return undefined;
  }
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    console.error(`Invalid --max-open-files value: ${value}`);
    process.exit(1);
  }
  return parsed;
}

program
  .command('instance')
  .description('Store instance data')
  .argument('<part10>', 'part 10 file(s)')
  .option('--dicomdir <path>', 'Base directory path where binary .mht files will be written in DICOMweb structure','~/dicomweb')
  .option('--max-open-files <N>', 'Maximum number of output files written at the same time (default: 32)')
  .action(async (fileName, options) => {
    updateVerboseLog();
    const instanceOptions = {};
    if (options.dicomdir) {
      instanceOptions.dicomdir = handleHomeRelative(options.dicomdir);
    }
    const maxOpenFiles = parseMaxOpenFiles(options.maxOpenFiles);
    if (maxOpenFiles !== undefined) {
      instanceOptions.maxOpenStreams = maxOpenFiles;
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
  .option('--bulkdata-size <size>', 'Size threshold in bytes for public bulkdata tags (default: 131074, i.e. 128k + 2)')
  .option('--private-bulkdata-size <size>', 'Size threshold in bytes for private bulkdata tags (default: 128)')
  .option('--max-open-files <N>', 'Maximum number of output files written at the same time (default: 32). Lower this if the system runs out of file handles on very large multi-frame instances')
  .action(async (fileNames, options) => {
    updateVerboseLog();
    const createOptions = {};
    if (options.dicomdir) {
      createOptions.dicomdir = handleHomeRelative(options.dicomdir);
    }
    // studyIndex defaults to true unless --no-study-index is specified
    createOptions.studyIndex = options.studyIndex !== false;
    if (options.bulkdataSize) {
      createOptions.sizeBulkdataTags = parseSizeToBytes(options.bulkdataSize);
    }
    if (options.privateBulkdataSize) {
      createOptions.sizePrivateBulkdataTags = parseSizeToBytes(options.privateBulkdataSize);
    }
    const maxOpenFiles = parseMaxOpenFiles(options.maxOpenFiles);
    if (maxOpenFiles !== undefined) {
      createOptions.maxOpenStreams = maxOpenFiles;
    }
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
  .option('--progress', 'Show progress with instance count as files are stored')
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

    if (options.progress) {
      stowOptions.progress = true;
    }

    const opts = program.opts();
    stowOptions.quiet = opts.quiet;
    stowOptions.verbose = opts.verbose;

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

/**
 * Parses the --brick-size option into a positive even integer.
 *
 * Even is required so a brick's z extent divides the way a halving reduction consumes planes;
 * the pyramid handles an odd trailing slab, but there is no reason to ask it to for the pitch
 * itself, and rejecting it here beats failing deep inside the sink chain.
 *
 * @param {string|undefined} value - Raw option value
 * @returns {number|undefined} - Parsed brick size, or undefined when not specified
 */
function parseBrickSize(value) {
  if (value === undefined) {
    return undefined;
  }
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 2 || parsed % 2 !== 0) {
    console.error(`Invalid --brick-size value: ${value} (must be a positive even integer)`);
    process.exit(1);
  }
  return parsed;
}

program
  .command('alternates')
  .description('Generate alternate renditions (jls, jlsThumbnail, htj2k, htj2kLossy, brick) beside an existing frames/ store')
  .argument('<studyUID>', 'Study Instance UID')
  .option('--dicomdir <path>', 'Base directory path where DICOMweb structure is located', '~/dicomweb')
  .option('--series-uid <seriesUID>', 'Specific Series Instance UID to process (if not provided, processes all series in the study)')
  .option('--jls', 'Generate jls/ - a full resolution JPEG-LS lossless rendition of every frame')
  .option('--jls-thumbnail', 'Generate jlsThumbnail/ - a quarter resolution JPEG-LS rendition of every frame')
  .option('--htj2k', 'Generate htj2k/ - a full resolution lossless HTJ2K rendition of every frame')
  .option('--htj2k-lossy', 'Generate htj2kLossy/ - a full resolution lossy HTJ2K rendition of every frame')
  .option('--brick', 'Generate brick/ - a hierarchical brick pyramid for off-axis display, reduced per axis by voxel spacing so coarse levels stay physically isotropic')
  .option('--brick-order <order>', 'Brick row packing: z-minor or plane-major', 'z-minor')
  .option('--brick-codec <codec>', 'Brick encoding: jls (JPEG-LS lossless) or htj2k (HTJ2K lossless)', 'jls')
  .option('--brick-size <N>', 'Brick edge length (default: 64)')
  .option('--force', 'Regenerate output even when it already exists')
  .option('--json', 'Emit the size/compression report as JSON on stdout (progress goes to stderr)')
  .action(async (studyUID, options) => {
    updateVerboseLog();
    const alternatesOptions = {
      dicomdir: handleHomeRelative(options.dicomdir),
      jls: !!options.jls,
      jlsThumbnail: !!options.jlsThumbnail,
      htj2k: !!options.htj2k,
      htj2kLossy: !!options.htj2kLossy,
      brick: !!options.brick,
      force: !!options.force,
      json: !!options.json,
      brickOrder: options.brickOrder,
      brickCodec: options.brickCodec,
    };
    if (options.seriesUid) {
      alternatesOptions.seriesUid = options.seriesUid;
    }
    const brickSize = parseBrickSize(options.brickSize);
    if (brickSize !== undefined) {
      alternatesOptions.brickSize = brickSize;
    }
    try {
      const result = await alternatesMain(studyUID, alternatesOptions);
      // Ineligible series are a normal outcome and exit 0; a series that errored is not.
      if (result.failures.length > 0) {
        process.exitCode = 1;
      }
    } catch (error) {
      // Codec failures surface as numeric exception codes rather than Errors, so print the
      // value itself when there is no message, and the stack only when it is worth reading -
      // a rejected option does not need a trace.
      console.error(`alternates failed: ${error?.message ?? error}`);
      if (error?.stack && program.opts().verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

program
  .command('transcode')
  .description('Rewrite primary frames/ from uncompressed to JPEG-LS lossless (grayscale only)')
  .argument('<studyUID>', 'Study Instance UID')
  .option('--dicomdir <path>', 'Base directory path where DICOMweb structure is located', '~/dicomweb')
  .option('--series-uid <seriesUID>', 'Specific Series Instance UID to process (if not provided, processes all series in the study)')
  .option('--to <target>', 'Target encoding; only jls is supported', 'jls')
  .option('--force', 'Re-transcode instances already in the target syntax')
  .action(async (studyUID, options) => {
    updateVerboseLog();
    const transcodeOptions = {
      dicomdir: handleHomeRelative(options.dicomdir),
      to: options.to,
      force: !!options.force,
    };
    if (options.seriesUid) {
      transcodeOptions.seriesUid = options.seriesUid;
    }
    try {
      await transcodeMain(studyUID, transcodeOptions);
    } catch (error) {
      console.error(`transcode failed: ${error?.message ?? error}`);
      if (error?.stack && program.opts().verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
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
  .option('--sop-uid <sopUIDs>', 'Comma-separated list of SOP Instance UIDs to export')
  .option('-o, --output <dir>', 'Output directory for Part 10 files', '.')
  .option('--format <format>', 'Output format: dicom, multipart, zip', 'dicom')
  .option('--continue-on-error', 'Continue processing even if an instance fails')
  .action(async (studyUID, options) => {
    updateVerboseLog();
    const part10Options = {
      dicomdir: handleHomeRelative(options.dicomdir),
      outputDir: options.output,
      format: options.format,
    };
    if (options.seriesUid) {
      part10Options.seriesUid = options.seriesUid;
    }
    if (options.sopUid) {
      part10Options.sopUids = options.sopUid.split(',').map(s => s.trim());
    }
    if (options.continueOnError) {
      part10Options.continueOnError = true;
    }
    await part10Main(studyUID, part10Options);
  });

program.parse();