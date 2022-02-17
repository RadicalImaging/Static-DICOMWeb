import ConfigPoint from "config-point";
import StaticCreator from "@ohif/static-wado-creator";

const { staticWadoConfig } = StaticCreator;

/**
 * Defines the basic configuration values for the dicomwebserver component.  See the README for more details.
 */
const { dicomWebServerConfig } = ConfigPoint.register({
  plugins: {
    // TODO - figure out where these should actually go
    studyQueryReadIndex: "../lib/studyQueryReadIndex.mjs",
  },

  dicomWebServerConfig: {
    configBase: staticWadoConfig,
    helpShort: "dicomwebserver",
    helpDescription:
      "Serve up the static wado files and optionally a web client as a web server on the local machine.",
    studyQuery: "studyQueryReadIndex",
    clientDir: "~/ohif",
    port: 5000,
  },
});

export default dicomWebServerConfig;
