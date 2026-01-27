/* eslint-disable import/prefer-default-export */
import formidable from 'formidable';
import * as storeServices from '../../services/storeServices.mjs';
import dcmjs from 'dcmjs';
import fs from 'fs';
import { dicomToXml, handleHomeRelative } from '@radicalimaging/static-wado-util';
import { instanceFromStream } from '@radicalimaging/create-dicomweb';
import { seriesMain } from '@radicalimaging/create-dicomweb';
import { studyMain } from '@radicalimaging/create-dicomweb';
import { SagaBusMessaging } from './SagaBusMessaging.mjs';

import { multipartStream } from './multipartStream.mjs';

const { denaturalizeDataset } = dcmjs.data.DicomMetaDictionary;

const maxFileSize = 4 * 1024 * 1024 * 1024;
const maxTotalFileSize = 10 * maxFileSize;

// Track if handlers have been initialized
let handlersInitialized = false;
let messagingInstance = null;

// Create a simple in-memory transport compatible with @saga-bus/core
function createInMemoryTransport() {
  const subscriptions = new Map(); // messageType -> Set of handlers
  let started = false;
  
  return {
    start: async () => {
      started = true;
    },
    stop: async () => {
      started = false;
      subscriptions.clear();
    },
    publish: async (message) => {
      if (!started) {
        throw new Error('Transport not started');
      }
      // Find all handlers for this message type
      const handlers = subscriptions.get(message.type) || new Set();
      // Also check for wildcard handlers if needed
      const allHandlers = subscriptions.get('*') || new Set();
      
      // Process handlers asynchronously
      const all = new Set([...handlers, ...allHandlers]);
      if (all.size > 0) {
        // Use Promise.all to properly handle async handlers
        const promises = Array.from(all).map(async (handler) => {
          try {
            // Handler might expect ctx.message or just the message directly
            const result = handler(message);
            if (result && typeof result.then === 'function') {
              await result;
            }
          } catch (err) {
            console.error('[InMemoryTransport] Handler error:', err);
            throw err; // Re-throw to allow bus retry logic
          }
        });
        await Promise.all(promises);
      }
    },
    subscribe: (messageType, handler) => {
      if (!subscriptions.has(messageType)) {
        subscriptions.set(messageType, new Set());
      }
      subscriptions.get(messageType).add(handler);
      
      // Return unsubscribe function
      return () => {
        const handlers = subscriptions.get(messageType);
        if (handlers) {
          handlers.delete(handler);
          if (handlers.size === 0) {
            subscriptions.delete(messageType);
          }
        }
      };
    },
  };
}

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
  
  // Initialize messaging service and register handlers (only once)
  if (!messagingInstance) {
    const transport = params.messaging?.transport || createInMemoryTransport();
    messagingInstance = new SagaBusMessaging({
      transport,
      ...(params.messaging || {}),
    });
    setupMessageHandlers(messagingInstance, dicomdir);
    if (messagingInstance.start) {
      messagingInstance.start().catch(err => {
        console.error("Failed to start messaging service:", err);
      });
    }
    handlersInitialized = true;
  }
  
  return multipartStream({
    listener: async (fileInfo, stream) => {
      // Called immediately when a file part starts.
      // You can kick off downstream processing and return a promise.
      // This promise is *not awaited* by middleware.
      console.warn("Processing POST upload:", fileInfo);
      try {
        const result = await instanceFromStream(stream, { dicomdir });
        const { information } = result;
        console.log("************* information:", information);
        
        return result;
      } catch (error) {
        // Handle errors gracefully - non-DICOM files or invalid DICOM files
        // The error will be caught by Promise.allSettled in completePostController
        // and included in the response as a failed file entry
        const errorMessage = error.message || String(error);
        const contentType = fileInfo?.mimeType || fileInfo?.headers?.['content-type'] || 'unknown';
        const fieldname = fileInfo?.fieldname || fileInfo?.headers?.['content-location'] || 'unknown';
        console.error(`[streamPostController] Error processing stream (Part: ${fieldname}, Content-Type: ${contentType}):`, errorMessage);
        // Re-throw so it's caught by Promise.allSettled and included in the response
        // This ensures the error is properly handled and doesn't cause unhandled rejections
        throw error;
      }
    },
    limits: { files: 1_000, fileSize: 250 * 1_000_000_000 }, // 250GB, 1000 files
  })
}

/**
 * Set up message handlers for updateSeries and updateStudy
 */
function setupMessageHandlers(messaging, dicomdir) {
  // Register handler for updateSeries
  messaging.registerHandler('updateSeries', async (msg) => {
    const { id, data } = msg;
    const [studyUid, seriesUID] = id.split('&');
    
    if (!studyUid || !seriesUID) {
      console.error(`Invalid updateSeries message id format: ${id}`);
      return;
    }
    
    try {
      console.log(`Processing updateSeries for study ${studyUid}, series ${seriesUID}`);
      // Call seriesMain to update the series
      await seriesMain(studyUid, {
        dicomdir,
        seriesUid: seriesUID,
      });
      
      // After series update completes, send updateStudy message
      await messaging.sendMessage('updateStudy', studyUid, data);
      console.log(`Sent updateStudy message for study ${studyUid}`);
    } catch (err) {
      console.error(`Error processing updateSeries for ${id}:`, err);
      throw err; // Re-throw to allow retry/redelivery
    }
  });
  
  // Register handler for updateStudy
  messaging.registerHandler('updateStudy', async (msg) => {
    const { id, data } = msg;
    const studyUid = id;
    
    if (!studyUid) {
      console.error(`Invalid updateStudy message id: ${id}`);
      return;
    }
    
    try {
      console.log(`Processing updateStudy for study ${studyUid}`);
      // Call studyMain to update the study
      await studyMain(studyUid, {
        dicomdir,
      });
      console.log(`Completed updateStudy for study ${studyUid}`);
    } catch (err) {
      console.error(`Error processing updateStudy for ${studyUid}:`, err);
      throw err; // Re-throw to allow retry/redelivery
    }
  });
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

    // Send updateSeries messages for unique seriesUIDs after all instances are processed
    if (messagingInstance) {
      const seriesMap = new Map(); // seriesId -> information object
      
      // Collect unique series from successfully processed files
      for (const file of files) {
        if (file.ok && file.result?.information) {
          const { information } = file.result;
          if (information?.studyInstanceUid && information?.seriesInstanceUid) {
            const studyUid = information.studyInstanceUid;
            const seriesUID = information.seriesInstanceUid;
            const seriesId = `${studyUid}&${seriesUID}`;
            
            // Only keep the latest information for each series (or first, doesn't matter for dedupe)
            if (!seriesMap.has(seriesId)) {
              seriesMap.set(seriesId, information);
            }
          }
        }
      }
      
      // Send one message per unique seriesUID
      for (const [seriesId, information] of seriesMap.entries()) {
        try {
          await messagingInstance.sendMessage('updateSeries', seriesId, information);
          console.log(`Sent updateSeries message for ${seriesId}`);
        } catch (err) {
          console.error(`Failed to send updateSeries message for ${seriesId}:`, err);
        }
      }
    }

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