import express from "express";
import setCorsMiddlewares from "./cors.mjs";
import setEmbedder from "./embedder.mjs";
import setLogsMiddlewares from "./logs.mjs";

/**
 * Set all app middlewares
 *
 * @param {*} appExpress express instance
 * @param {*} config
 */
export default function setMiddlewares(appExpress, config) {
  setLogsMiddlewares(appExpress, config);
  setCorsMiddlewares(appExpress, config);
  setEmbedder(appExpress, config);
  appExpress.use(express.json());
  appExpress.use(express.urlencoded({extended: true}));
}
