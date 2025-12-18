import express from 'express';
import http from 'http';
import dicomWebServerConfig from './dicomWebServerConfig.mjs';
import '@radicalimaging/static-wado-plugins';
import 'regenerator-runtime';
import configureProgram from './program/index.mjs';

import setRoutes from './routes/index.mjs';
import setMiddlewares from './middlewares/index.mjs';

/**
 * Serve up the web files
 * Configuration is broken up into several parts:
 * 1. Web Service Configuration - port number, path, localhost only or all hosts or specified
 * 2. Client Service Configuration - one or more static directories containing static client files
 * 3. DICOMweb Service Configuration - a directory or root path to serve, plus one or more dynamic component extension
 *
 * This is basically a simple script that just configures an express app, returning it.  The configuration all comes from the
 * params or the default values.
 *
 * @param {*} params
 * @returns
 */
const DicomWebServer = async params => {
  const app = express();

  setMiddlewares(app, params);
  app.params = params || {};
  const { port = 5000 } = app.params;

  await setRoutes(app, params);

  const server = http.createServer(app);

  server.listen(
    {
      port,
      host: '::', // IPv6 wildcard
      ipv6Only: false, // Allow IPv4 mapped addresses
    },
    () => {
      console.log(`Listening on port ${port} for both IPv4 and IPv6`);
    }
  );

  return app;
};

export default DicomWebServer;
export { dicomWebServerConfig, configureProgram };
