import express from "express";
import setCorsMiddlewares from "./cors";
import setEmbedder from "./embedder";
import setLogsMiddlewares from "./logs";

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
}
