/* eslint-disable import/prefer-default-export */
import formidable from "formidable";
import * as storeServices from "../../services/storeServices.mjs";
import dcmjs from "dcmjs";
import { dicomToXml } from "@radicalimaging/static-wado-util";

const { denaturalizeDataset } = dcmjs.data.DicomMetaDictionary;

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
    const storedInstances = [];
    const studyUIDs = new Set();
    const fileNames = [];

    const form = formidable({ multiples: true });
    form.on("file", (_formname, file) => {
      const { filepath, mimetype } = file;
      storedInstances.push({
        filepath,
        mimetype,
        result: storeServices.storeFileInstance(filepath, mimetype, params),
      });
    });

    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.log("Couldn't parse because", err);
        next(err);
        return;
      }
      const listFiles = Object.values(files).reduce(
        (prev, curr) => prev.concat(curr),
        []
      );

      try {
        // const sopInfo = await storeServices.storeFilesByStow(files, params)
        let result;
        for (const item of storedInstances) {
          let itemResult;
          try {
            itemResult = await item.result;
            if (itemResult.ReferencedSOPSequence?.[0].StudyInstanceUID) {
              studyUIDs.add(
                itemResult.ReferencedSOPSequence[0].StudyInstanceUID
              );
            } else {
              console.warn("No study uid found", itemResult);
            }
          } catch (e) {
            console.warn("Couldn't upload item", item);
            itemResult = {
              FailedSOPSequence: [
                {
                  FailedSOPInstance: {
                    SOPClassUID: "unknown",
                    SOPInstanceUID: "unknown",
                    FailureReason: `error: ${e}`,
                  },
                },
              ],
            };
          }
          if (!result) {
            result = {
              ...itemResult,
              ReferencedSOPSequence: [],
              FailedSOPSequence: [],
            };
          }
          if (itemResult.ReferencedSOPSequence?.length) {
            result.ReferencedSOPSequence.push(
              itemResult.ReferencedSOPSequence[0]
            );
          }
          if (itemResult.FailedSOPSequence?.length) {
            result.FailedSOPSequence.push(itemResult.FailedSOPSequence[0]);
          }
        }

        if (result.FailedSOPSequence?.length === 0) {
          delete result.FailedSOPSequence;
        }
        const dicomResult = denaturalizeDataset(result);

        console.log("STOW result: ", JSON.stringify(result, null, 2));
        await storeServices.storeFilesByStow(
          { listFiles, files, studyUIDs, result },
          params
        );

        const xml = dicomToXml(dicomResult);

        res
          .status(200)
          .setHeader("content-type", "application/dicom+xml")
          .send(xml);
      } catch (e) {
        console.log(e);
        res.status(500).json(`Unable to handle ${e}`);
      }
    });
  };
}
