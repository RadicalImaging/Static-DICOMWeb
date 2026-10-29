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
    /** Maximum number of top-level builds of derived files (series, study, studies list) that run at the same time. */
    maxRunningJobs: 2,
    /** Maximum number of request builds in the queue (background builds, of upload messages and next rounds, do not count). A request that needs a build above this gets 503 with Retry-After. */
    maxQueuedJobs: 20,
    /** Extra running builds for requests only, above maxRunningJobs, so a request does not wait for the background builds. */
    requestJobSlots: 1,
    /** At start, remove the temp files of studies/<studyUID>/temp older than this (hours). One upload of an instance must take less time. 0 turns the removal off. */
    tempMaxAgeHours: 24,
    /** When this number of STOW-RS instances did not complete within the wait of their upload (usually stuck storage), a new upload gets 503 with Retry-After at once. 0 turns the limit off. */
    maxStalledStowListeners: 8,
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
