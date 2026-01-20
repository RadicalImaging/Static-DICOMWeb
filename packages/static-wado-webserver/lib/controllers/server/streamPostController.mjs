/* eslint-disable import/prefer-default-export */
import formidable from 'formidable';
import * as storeServices from '../../services/storeServices.mjs';
import dcmjs from 'dcmjs';
import fs from 'fs';
import { dicomToXml, handleHomeRelative } from '@radicalimaging/static-wado-util';
import { instanceFromStream } from '@radicalimaging/create-dicomweb';

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
export function streamPostController(params) {
  const dicomdir = handleHomeRelative(params.rootDir);
  console.warn("Storing POST uploads to:", dicomdir);
  
  return multipartStream({
    listener: (headers, stream) => {
      // Called immediately when a file part starts.
      // You can kick off downstream processing and return a promise.
      // This promise is *not awaited* by middleware.
      console.warn("Processing POST upload:", headers);
      return instanceFromStream(stream, { dicomdir });
    },
    limits: { files: 1_000, fileSize: 250 * 1_000_000_000 }, // 250GB, 1000 files
  })
}

export const completePostController = async (req, res, next) => {
  try {
    const results = await Promise.allSettled(req.uploadListenerPromises);

    const files = req.uploadStreams.map((entry, index) => {
      const r = results[index];

      if (r.status === "fulfilled") {
        return {
          ...entry.fileInfo,
          ok: true,
          result: r.value,
        };
      }

      return {
        ...entry.fileInfo,
        ok: false,
        error: String(r.reason),
      };
    });

    res.json({
      ok: files.every(f => f.ok),
      files,
    });
  } catch (err) {
    // This should rarely happen now, but keep it safe
    next(err);
  }
}