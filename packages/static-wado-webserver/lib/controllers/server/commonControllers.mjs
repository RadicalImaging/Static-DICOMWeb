/* eslint-disable import/prefer-default-export */
import formidable from 'formidable';
import * as storeServices from '../../services/storeServices.mjs';
import dcmjs from 'dcmjs';
import fs from 'fs';
import { dicomToXml, handleHomeRelative, logger } from '@radicalimaging/static-wado-util';

const { webserverLog } = logger;

const { denaturalizeDataset } = dcmjs.data.DicomMetaDictionary;

const maxFileSize = 4 * 1024 * 1024 * 1024;
const maxTotalFileSize = 10 * maxFileSize;

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
  const rootDir = handleHomeRelative(params.rootDir);
  const uploadDir = `${rootDir}/temp`;
  const formOptions = {
    multiples: true,
    uploadDir,
    maxFileSize,
    maxTotalFileSize,
  };

  return async (req, res, next) => {
    const storedInstances = [];
    const studyUIDs = new Set();
    const fileNames = [];
    const form = formidable(formOptions);
    form.on('file', (_formname, file) => {
      try {
        const { filepath, mimetype } = file;
        webserverLog.debug('Received upload file', filepath, mimetype);
        storedInstances.push({
          filepath,
          mimetype,
          result: storeServices.storeFileInstance(filepath, mimetype, params),
        });
      } catch (e) {
        webserverLog.warn('Unable to store instance', e);
      }
    });

    try {
      const [fields, files] = await form.parse(req);

      if (!storedInstances.length) {
        webserverLog.warn('No files uploaded');
        res.status(500).send('No files uploaded');
        return;
      }
      const listFiles = Object.values(files).reduce((prev, curr) => prev.concat(curr), []);

      // const sopInfo = await storeServices.storeFilesByStow(files, params)
      webserverLog.info('Starting to await', storedInstances.length, 'files');
      let result;
      let count = 1;
      for (const item of storedInstances) {
        let itemResult;
        try {
          webserverLog.debug('About to await #', `${count++}/${storedInstances.length}`);
          itemResult = await item.result;
          if (Array.isArray(itemResult)) {
            webserverLog.debug('Finding single result in', itemResult);
            itemResult = itemResult.find(
              it => item.ReferencedSOPSequence || item.FailedSOPSequence
            );
          }
          webserverLog.debug('Found itemResult', itemResult);
          if (itemResult?.ReferencedSOPSequence?.[0].StudyInstanceUID) {
            studyUIDs.add(itemResult.ReferencedSOPSequence[0].StudyInstanceUID);
          } else {
            webserverLog.info('No study uid found', itemResult);
          }
        } catch (e) {
          webserverLog.warn('Error', e);
          webserverLog.warn("Couldn't upload item", item);
          itemResult = {
            FailedSOPSequence: [
              {
                SOPClassUID: 'unknown',
                SOPInstanceUID: 'unknown',
                FailureReason: 0xc000,
                TextValue: `error: ${e}`,
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
          result.ReferencedSOPSequence.push(...itemResult.ReferencedSOPSequence);
        }
        if (itemResult.FailedSOPSequence?.length) {
          result.FailedSOPSequence.push(...itemResult.FailedSOPSequence);
        }
      }
      webserverLog.info('Done awaiting all instances');

      if (!result) {
        webserverLog.warn('No results found');
        res.status(500).send('No result found');
        return;
      }
      if (result.FailedSOPSequence?.length === 0) {
        delete result.FailedSOPSequence;
      }
      const dicomResult = denaturalizeDataset(result);

      webserverLog.debug('STOW result: ', JSON.stringify(result, null, 2));
      await storeServices.storeFilesByStow({ listFiles, files, studyUIDs, result }, params);

      const xml = dicomToXml(dicomResult);

      res.status(200).setHeader('content-type', 'application/dicom+xml').send(xml);
    } catch (e) {
      webserverLog.error("Couldn't upload all files because:", e);
      res.status(500).json(`Unable to handle ${e}`);
    } finally {
      deleteStoreInstances(storedInstances);
    }
  };
}

async function deleteStoreInstances(instances) {
  webserverLog.info('Deleting stored instances', instances.length);
  for (const instance of instances) {
    try {
      if (fs.existsSync(instance.filepath)) {
        await fs.promises.unlink(instance.filepath);
      }
    } catch (e) {
      webserverLog.warn('Unable to unlink', instance?.filepath);
    }
  }
}
