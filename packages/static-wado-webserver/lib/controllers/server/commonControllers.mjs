/* eslint-disable import/prefer-default-export */
import formidable from "formidable";
import * as storeServices from "../../services/storeServices.mjs";

/**
 * Handles an incoming stow-rs POST data, either in application/dicom (single instance), or in
 * multipart/related with JSON data elements.
 *
 * TODO: Handle bulkdata and images, in addition to the raw JSON data.
 *
 * @param {*} params
 * @returns function controller
 */
export function defaultPostController(params) {
  return (req, res, next) => {
    const form = formidable({ multiples: true });
    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.log("Couldn't parse because", err);
        next(err);
        return;
      }
      try {
        const sopInfo = await storeServices.storeFilesByStow(files, params);
        console.log("Returning empty result - TODO, generate references", sopInfo);
        res.status(200).json({});
      } catch (e) {
        console.log(e);
        res.status(500).text(`Unable to handle ${e}`);
      }
    });
  };
}
