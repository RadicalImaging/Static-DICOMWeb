import * as staticWadoUtil from '@radicalimaging/static-wado-util';
const { parseTimeoutToMs, parseSizeToBytes } = staticWadoUtil;
import dicomWebServerConfig from '../dicomWebServerConfig.mjs';
import DicomWebServer from '../index.mjs';
import { installFromEnv } from '../util/asyncStackDump.mjs';
import { setLivelockEnabled } from '../util/livelockRegistry.mjs';

function main() {
  return DicomWebServer(this.dicomWebServerConfig).then(value => value.listen());
}

/**
 * Configure static-wado-creator commander program.
 *
 * @param {*} defaults Configuration caller level
 * @returns Program object
 */
async function configureProgram(defaults = dicomWebServerConfig) {
  await staticWadoUtil.loadConfiguration(defaults, process.argv);

  // Optional: stack dump on SIGUSR2 for livelock diagnosis (STACK_DUMP_ENABLED=1 or STACK_DUMP_SAMPLE_MS=200)
  installFromEnv();

  const { argumentsRequired = [], optionsRequired = [], helpShort, helpDescription } = defaults;

  const argumentsList = [];

  // program command options
  const optionsList = [
    {
      key: '-v, --verbose',
      description: 'Write verbose output',
      defaultValue: false,
    },
    {
      key: '-q, --quiet',
      description: 'Quiet/minimal output',
      defaultValue: false,
    },
    {
      key: '--progress',
      description:
        'Show progress feedback during STOW-RS uploads (enables quiet logging so progress is visible)',
      defaultValue: false,
    },
    {
      key: '-o, --dir <value>',
      description: 'Set output directory (to read from for serving files)',
      defaultValue: defaults.rootDir,
    },
    {
      key: '-p, --port <value>',
      description: 'Choose the port to run on',
      defaultValue: defaults.port,
    },
    {
      key: '--hash-study-uid-path',
      description: 'Enable hashing of studyUID folder structure',
      defaultValue: false,
    },
    {
      key: '--no-study-index',
      description: 'Skip creating/updating studies/index.json.gz file',
      defaultValue: true,
    },
    {
      key: '--server-path <path>',
      description: 'Sets the server path to listen to',
      defaultValue: '/dicomweb',
    },
    {
      key: '--client-path <clientPath>',
      description: 'Sets the client path to listen to',
      defaultValue: '/',
    },
    {
      key: '--timeout <value>',
      description:
        'HTTP server request timeout (e.g. 30m, 1h, 3600s). Use 0 to disable. Default: 30m',
      defaultValue: '30m',
    },
    {
      key: '--disable-summary',
      description: 'Do not update series and study summaries after STOW-RS uploads',
      defaultValue: false,
    },
    {
      key: '--livelock-detect',
      description:
        'Enable livelock detection for STOW stream reads (log after threshold ms if ensureAvailable is stuck)',
      defaultValue: false,
    },
    {
      key: '--show-status',
      description: 'Periodically dump status JSON (pretty-printed) to the console',
      defaultValue: false,
    },
    {
      key: '--status-diagnostic',
      description: 'Include diagnostic info in status dump (ongoing jobs, livelock config and reports)',
      defaultValue: false,
    },
    {
      key: '--status-time <seconds>',
      description: 'Interval in seconds for status dump when using --show-status. Default: 60',
      defaultValue: 60,
    },
    {
      key: '--bulkdata-size <size>',
      description: 'Size threshold for public bulkdata tags (bytes or with units e.g. 128k). Default: 131074',
    },
    {
      key: '--private-bulkdata-size <size>',
      description: 'Size threshold for private bulkdata tags (bytes or with units e.g. 128). Default: 128',
    },
    {
      key: '--hang',
      description: 'Enable /dicomweb/hang endpoint for testing server hangs and stack traces',
      defaultValue: false,
    },
  ];

  const configuration = {
    argumentsList,
    argumentsRequired,
    helpDescription,
    helpShort,
    optionsList,
    optionsRequired,
    configurationFile: defaults.configurationFile,
  };

  const program = staticWadoUtil.configureProgram(configuration);
  const opts = program.opts();
  program.dicomWebServerConfig = Object.assign(Object.create(defaults), opts);
  // --progress implies quiet so progress output is visible
  if (opts.progress) {
    program.dicomWebServerConfig.quiet = true;
  }
  program.dicomWebServerConfig.progress = !!opts.progress;
  program.dicomWebServerConfig.rootDir = opts.dir;
  program.dicomWebServerConfig.port = opts.port || 5000;
  const timeoutStr = opts.timeout ?? '30m';
  program.dicomWebServerConfig.serverTimeoutMs =
    timeoutStr === '0' ? 0 : parseTimeoutToMs(timeoutStr);

  const statusTimeSec = typeof opts.statusTime !== 'undefined' ? Number(opts.statusTime) : 60;
  program.dicomWebServerConfig.showStatus = !!opts.showStatus;
  program.dicomWebServerConfig.statusDiagnostic = !!opts.statusDiagnostic;
  program.dicomWebServerConfig.statusTime = Number.isFinite(statusTimeSec) ? statusTimeSec : 60;

  if (opts.livelockDetect) {
    setLivelockEnabled(true);
  }

  if (opts.bulkdataSize) {
    program.dicomWebServerConfig.sizeBulkdataTags = parseSizeToBytes(opts.bulkdataSize);
  }
  if (opts.privateBulkdataSize) {
    program.dicomWebServerConfig.sizePrivateBulkdataTags = parseSizeToBytes(opts.privateBulkdataSize);
  }

  program.dicomWebServerConfig.hang = !!opts.hang;

  program.main = main;

  return program;
}

export default configureProgram;
