/* eslint-disable import/prefer-default-export */
import formidable from 'formidable';
import * as storeServices from '../../services/storeServices.mjs';
import dcmjs from 'dcmjs';
import fs from 'fs';
import { dicomToXml, handleHomeRelative } from '@radicalimaging/static-wado-util';
import { instanceFromStream } from '@radicalimaging/create-dicomweb';

import { multipartStream } from './multipartStream.mjs';

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

/**
 * Formats results into DICOM Part 19 JSON format
 */
function formatDicomJsonResponse(files) {
  const responseArray = files.map((file) => {
    const dataset = {};
    
    // Add SOP Instance UID if available
    if (file.result?.information?.sopInstanceUid) {
      dataset['00080018'] = {
        vr: 'UI',
        Value: [file.result.information.sopInstanceUid],
      };
    } else if (file.result?.dict?.['00080018']) {
      // Extract from dict if available
      const sopInstanceUid = file.result.dict['00080018'];
      if (sopInstanceUid?.Value?.[0]) {
        dataset['00080018'] = {
          vr: sopInstanceUid.vr || 'UI',
          Value: [sopInstanceUid.Value[0]],
        };
      }
    }
    
    // Add status (Performed Procedure Step Status)
    dataset['00400252'] = {
      vr: 'CS',
      Value: [file.ok ? 'COMPLETED' : 'FAILED'],
    };
    
    // Add error message if failed
    if (!file.ok && file.error) {
      dataset['00404002'] = {
        vr: 'ST',
        Value: [file.error],
      };
    }
    
    // Add Study Instance UID if available
    if (file.result?.information?.studyInstanceUid) {
      dataset['0020000D'] = {
        vr: 'UI',
        Value: [file.result.information.studyInstanceUid],
      };
    } else if (file.result?.dict?.['0020000D']) {
      const studyInstanceUid = file.result.dict['0020000D'];
      if (studyInstanceUid?.Value?.[0]) {
        dataset['0020000D'] = {
          vr: studyInstanceUid.vr || 'UI',
          Value: [studyInstanceUid.Value[0]],
        };
      }
    }
    
    // Add Series Instance UID if available
    if (file.result?.information?.seriesInstanceUid) {
      dataset['0020000E'] = {
        vr: 'UI',
        Value: [file.result.information.seriesInstanceUid],
      };
    } else if (file.result?.dict?.['0020000E']) {
      const seriesInstanceUid = file.result.dict['0020000E'];
      if (seriesInstanceUid?.Value?.[0]) {
        dataset['0020000E'] = {
          vr: seriesInstanceUid.vr || 'UI',
          Value: [seriesInstanceUid.Value[0]],
        };
      }
    }
    
    return dataset;
  });
  
  return responseArray;
}

/**
 * Formats results into DICOM Part 19 XML format using dicomToXml
 */
function formatDicomXmlResponse(files) {
  // For XML, we need to create a sequence of items
  // Since dicomToXml expects a single dataset, we'll create a wrapper sequence
  const responseDataset = {
    '00400275': {  // Referenced SOP Sequence
      vr: 'SQ',
      Value: files.map((file) => {
        const item = {};
        
        // Add SOP Instance UID if available
        if (file.result?.information?.sopInstanceUid) {
          item['00080018'] = {
            vr: 'UI',
            Value: [file.result.information.sopInstanceUid],
          };
        } else if (file.result?.dict?.['00080018']) {
          const sopInstanceUid = file.result.dict['00080018'];
          if (sopInstanceUid?.Value?.[0]) {
            item['00080018'] = {
              vr: sopInstanceUid.vr || 'UI',
              Value: [sopInstanceUid.Value[0]],
            };
          }
        }
        
        // Add status
        item['00400252'] = {
          vr: 'CS',
          Value: [file.ok ? 'COMPLETED' : 'FAILED'],
        };
        
        // Add error message if failed
        if (!file.ok && file.error) {
          item['00404002'] = {
            vr: 'ST',
            Value: [file.error],
          };
        }
        
        // Add Study Instance UID if available
        if (file.result?.information?.studyInstanceUid) {
          item['0020000D'] = {
            vr: 'UI',
            Value: [file.result.information.studyInstanceUid],
          };
        } else if (file.result?.dict?.['0020000D']) {
          const studyInstanceUid = file.result.dict['0020000D'];
          if (studyInstanceUid?.Value?.[0]) {
            item['0020000D'] = {
              vr: studyInstanceUid.vr || 'UI',
              Value: [studyInstanceUid.Value[0]],
            };
          }
        }
        
        // Add Series Instance UID if available
        if (file.result?.information?.seriesInstanceUid) {
          item['0020000E'] = {
            vr: 'UI',
            Value: [file.result.information.seriesInstanceUid],
          };
        } else if (file.result?.dict?.['0020000E']) {
          const seriesInstanceUid = file.result.dict['0020000E'];
          if (seriesInstanceUid?.Value?.[0]) {
            item['0020000E'] = {
              vr: seriesInstanceUid.vr || 'UI',
              Value: [seriesInstanceUid.Value[0]],
            };
          }
        }
        
        return item;
      }),
    },
  };
  
  return responseDataset;
}

export const completePostController = async (req, res, next) => {
  try {
    console.log('************* uploadListenerPromises length:', req.uploadListenerPromises?.length);
    const results = await Promise.allSettled(req.uploadListenerPromises || []);
    console.log('************* results length:', results.length);

    const files = (req.uploadStreams || []).map((entry, index) => {
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

    // Check Accept header to determine response format
    const acceptHeader = req.headers.accept || '';
    const prefersXml = acceptHeader.includes('application/dicom+xml') || 
                       acceptHeader.includes('application/xml') ||
                       acceptHeader.includes('text/xml');
    const prefersJson = acceptHeader.includes('application/dicom+json') ||
                       acceptHeader.includes('application/json');

    // Default to JSON if no preference specified
    const useXml = prefersXml && !prefersJson;

    if (useXml) {
      // Format as DICOM XML
      const xmlDataset = formatDicomXmlResponse(files);
      const denaturalized = denaturalizeDataset(xmlDataset);
      const xml = dicomToXml(denaturalized);
      
      res.status(200)
         .setHeader('Content-Type', 'application/dicom+xml; charset=utf-8')
         .send(xml);
    } else {
      // Format as DICOM JSON
      const jsonResponse = formatDicomJsonResponse(files);
      
      res.status(200)
         .setHeader('Content-Type', 'application/dicom+json; charset=utf-8')
         .json(jsonResponse);
    }
  } catch (err) {
    // This should rarely happen now, but keep it safe
    next(err);
  }
}