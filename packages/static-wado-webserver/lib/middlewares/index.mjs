import setCorsMiddlewares from "./cors.mjs";
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
}
