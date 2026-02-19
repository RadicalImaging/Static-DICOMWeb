import ConfigPoint from 'config-point';
import '@radicalimaging/static-wado-plugins';
import { staticWadoConfig } from '@radicalimaging/static-wado-util';

/**
 * Defines the basic configuration values for the dicomwebserver component.  See the README for more details.
 */
const { dicomWebServerConfig } = ConfigPoint.register({
  dicomWebServerConfig: {
    configBase: staticWadoConfig,
    helpShort: 'dicomwebserver',
    stowCommands: ['mkdicomweb metadata <studyUIDs> --dir <rootDir> --multipart'],
    helpDescription:
      'Serve up the static wado files and optionally a web client as a web server on the local machine.',
    clientDir: '~/ohif',
    port: 5000,
    /** HTTP server request timeout in ms. Default 30 minutes. Set to 0 to disable. */
    serverTimeoutMs: 30 * 60 * 1000,
    /** When true, do not update series/study summaries after STOW-RS uploads (--disable-summary). */
    disableSummary: false,
    corsOptions: {
      enabled: true,
      origin: true,
      // methods: ['GET', "PUT", "POST"],
      // allowedHeaders: ['Content-Type', 'Authorization'],
      // ... https://www.npmjs.com/package/cors#configuration-options
    },
    // proxyAe: "AE-NAME",

    /** Size threshold in bytes for public bulkdata tags (default: 131074, i.e. 128k + 2). Set via --bulkdata-size. */
    sizeBulkdataTags: undefined,
    /** Size threshold in bytes for private bulkdata tags (default: 128). Set via --private-bulkdata-size. */
    sizePrivateBulkdataTags: undefined,

    /** When true, enable /dicomweb/hang endpoint for testing (--hang). */
    hang: false,

    webserverPlugins: [],
  },
});

export default dicomWebServerConfig;
