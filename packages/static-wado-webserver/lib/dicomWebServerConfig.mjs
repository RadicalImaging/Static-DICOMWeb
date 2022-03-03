import ConfigPoint from "config-point";
import "@ohif/static-wado-plugins";
import { staticWadoConfig } from "@ohif/static-wado-util";

/**
 * Defines the basic configuration values for the dicomwebserver component.  See the README for more details.
 */
const { dicomWebServerConfig } = ConfigPoint.register({
  dicomWebServerConfig: {
    configBase: staticWadoConfig,
    helpShort: "dicomwebserver",
    stowCommands: ["mkdicomweb"],
    helpDescription: "Serve up the static wado files and optionally a web client as a web server on the local machine.",
    clientDir: "~/ohif",
    port: 5000,
    corsOptions: {
      enabled: true,
      origin: ["http://localhost:3000"],
      // methods: ['GET', "PUT", "POST"],
      // allowedHeaders: ['Content-Type', 'Authorization'],
      // ... https://www.npmjs.com/package/cors#configuration-options
    },
    proxyAe: "CLEARCANVAS",
  },
});

export default dicomWebServerConfig;
