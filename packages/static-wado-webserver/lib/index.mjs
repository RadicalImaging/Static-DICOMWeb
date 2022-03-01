import { handleHomeRelative } from "@ohif/static-wado-util";
import express from "express";
import logger from "morgan";
import dcmjs from "dcmjs";
import { importPlugin as cpImportPlugin } from "config-point";
import dicomWebServerConfig from "./dicomWebServerConfig.mjs";
import "regenerator-runtime";

const { DicomMetaDictionary } = dcmjs.data;

const importPlugin = (name) => cpImportPlugin(name, (moduleName) => import(moduleName).then((value) => (value && value.default) || value));

/**
 * Maps QIDO queries for studies, series and instances to the index.json.gz file.
 */
const qidoMap = (req, res, next) => {
  req.url = `${req.path}/index.json.gz`;
  res.setHeader("content-type", "application/json");
  next();
};

/**
 * Handles returning other JSON files as application/json, and uses the compression extension.
 */
const otherJsonMap = (req, res, next) => {
  res.setHeader("content-type", "application/json");
  req.url = `${req.path}.gz`;
  next();
};

/**
 * Default handling when a request isn't found.  Just responsds with a 404 and a message saying it wasn't found.
 */
const missingMap = (req, res, next) => {
  console.log("Not found", req.path);
  res
    .status(404)
    .send(
      `Couldn't find ${req.path} in studyUID ${req.params.studyUID} - TODO, query remote with params=${JSON.stringify(req.params)} and query=${JSON.stringify(
        req.query
      )}`
    );
  next();
};

/** Adds the compression headers to the response */
const gzipHeaders = (res, path) => {
  if (path.indexOf(".gz") !== -1) {
    res.setHeader("Content-Encoding", "gzip");
  } else if (path.indexOf(".br") !== -1) {
    res.setHeader("Content-Encoding", "br");
  }
};

const addQueryCall = async (router, level, params, key) => {
  const name = params[key];
  if (!name) return;
  try {
    const plugin = await importPlugin(name);
    const { generator } = plugin.default || plugin;
    const queryFunction = generator(params, key);
    if (params.verbose) console.log("Adding query call on", level, "to", name);
    router.get(level, async (req, res, next) => {
      try {
        const results = await queryFunction(req.query);
        if (results) {
          const retResults = results.map((item) => (item.elements && DicomMetaDictionary.denaturalizeDataset(item.elements)) || item);
          res.json(retResults);
          return;
        }
      } catch (e) {
        console.warn("Unable to query:", e);
      }
      next();
    });
  } catch (e) {
    console.error("Unable to load study query plugin", name, "because", e);
    // eslint-disable-next-line no-process-exit
    process.exit(-1);
  }
};

/**
 * Methods to allow configuring directories as being either client or dicomweb containing directories.
 */
const methods = {
  /**
   * Add a new DICOMweb directory.
   */
  async addDicomWeb(directory, params = {}) {
    console.log("Adding dicom web dir", directory);
    if (!directory) return;
    const dir = handleHomeRelative(directory);

    const path = params.path || "/dicomweb";
    const router = express.Router();
    this.use(path, router);

    await addQueryCall(router, "/studies", params, "studyQuery");
    router.get("/studies", qidoMap);
    router.get("/studies/:studyUID/series", qidoMap);
    router.get("/studies/:studyUID/series/metadata", otherJsonMap);
    router.get("/studies/:studyUID/series/:seriesUID/instances", qidoMap);

    // Handle the QIDO queries
    router.use(
      express.static(dir, {
        index: "index.json.gz",
        setHeaders: gzipHeaders,
        extensions: ["gz"],
        redirect: false,
        fallthrough: true,
      })
    );

    router.use("/studies/:studyUID/", missingMap);
    // if( this.plugins.retrieveMissing ) {
    //     router.use('/studies/:studyUID/', this.plugins.retrieveMissing);
    // }
  },

  /**
   * Adds a client directory, typically served on /
   * @param {*} directory containing the client to serve.  Defaults to ~/ohif
   * @param {*} params
   * @returns
   */
  addClient(directory, params = {}) {
    if (!directory) return;
    const dir = handleHomeRelative(directory);

    const path = params.path || "/";

    this.get("/viewer", (req, res, next) => {
      req.url = "/index.html";
      next();
    });

    this.use(
      path,
      express.static(dir, {
        index: "index.html",
        setHeaders: gzipHeaders,
        extensions: ["gz"],
        redirect: false,
      })
    );
  },
};

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
const DicomWebServer = async (params) => {
  const app = express();
  Object.assign(app, methods);

  app.use(logger("combined"));
  app.params = params || {};

  await app.addDicomWeb(params.rootDir, params);
  app.addClient(params.clientDir, params);

  const superListen = app.listen;
  app.listen = (port) => {
    if (port) superListen.call(app, port);
    else {
      console.log(`Server listening on ${params.port || 5000}`);
      superListen.call(app, app.params.port || 5000);
    }
  };

  return app;
};

export default DicomWebServer;
export { dicomWebServerConfig, importPlugin };
