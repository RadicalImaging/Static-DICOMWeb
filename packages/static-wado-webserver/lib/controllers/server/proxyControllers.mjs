/* eslint-disable import/prefer-default-export */
import { aeConfig } from "@ohif/static-wado-util";
import * as cmoveServices from "../../services/cmoveServices.mjs";

/**
 * Default/common controller for get method to
 * Preferable usage for paths [/studies,/studies/:studyUID/series/, /studies/:studyUID/series/:seriesUID/instance]
 *
 * It finds (and move existing) entities from proxy source (defined by proxyAe config) to scp target (defined by staticWadoAE).
 *
 * @param {*} params
 * @param {*} uidPatternObject Defines the uid pattern strings to directly access values from req.params.
 * @param {*} bulk tell whether the operation is a bulk operation or not.
 * @returns controller function
 */
export function defaultGetProxyController(
  params,
  { studyInstanceUIDPattern, seriesInstanceUIDPattern, sopInstanceUIDPattern } = {
    studyInstanceUIDPattern: "",
    seriesInstanceUIDPattern: "",
    sopInstanceUIDPattern: "",
  },
  bulk = false
) {
  return async (req, res, next) => {
    try {
      const { proxyAe, staticWadoAe: destAeTittle } = params;
      const proxyAeData = aeConfig[proxyAe];

      const { host, port } = proxyAeData;

      const proxyConfig = {
        host,
        port,
        aeTittle: proxyAe,
      };

      const requestOptions = {
        bulk,
        destAeTittle,
        StudyInstanceUID: req.params[studyInstanceUIDPattern],
        SeriesInstanceUID: req.params[seriesInstanceUIDPattern],
        SOPInstanceUID: req.params[sopInstanceUIDPattern],
      };

      if (bulk) {
        const [findResults] = await cmoveServices.findMove(proxyConfig, requestOptions);

        res.status(200).send(findResults);

        return;
      }
    } catch (e) {
      console.log(`Get data from server failed${e}`);
    }

    next();
  };
}
