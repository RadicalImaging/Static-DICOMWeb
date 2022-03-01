import ConfigPoint from "config-point";
import StaticCreator from "@ohif/static-wado-creator";
import "@ohif/static-wado-plugins";

const { staticWadoConfig } = StaticCreator;

/**
 * Defines the basic configuration values for the dicomwebserver component.  See the README for more details.
 */
const { dicomWebServerConfig } = ConfigPoint.register({
  dicomWebServerConfig: {
    configBase: staticWadoConfig,
    helpShort: "dicomwebserver",
    helpDescription: "Serve up the static wado files and optionally a web client as a web server on the local machine.",
    clientDir: "~/ohif",
    port: 5000,
  },
});

export default dicomWebServerConfig;
