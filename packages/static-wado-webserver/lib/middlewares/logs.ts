import logger from "morgan";

/**
 * Set request logs  middlewares
 *
 * @param {*} appExpress express instance
 */
export default function setMiddlewares(appExpress) {
  appExpress.use(logger("combined"));
}
