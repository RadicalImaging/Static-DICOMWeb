import { handleHomeRelative, logger } from '@radicalimaging/static-wado-util';
import fs from 'fs';

const { webserverLog } = logger;

const renderedTypes = {
  'image/jpeg': '/1.jpg',
  'video/mp4': '/index.mp4',
  'application/pdf': '/index.pdf',
};

const testTypes = ['video/mp4', 'image/jpeg', 'application/pdf'];

export default function byteRangeRequest(options) {
  const { dir } = options;
  const baseDir = handleHomeRelative(dir);

  function exists(path, testType) {
    const testPath = renderedTypes[testType];
    if (!testPath) {
      return;
    }
    const framePath = path.replace('/rendered', `/rendered${testPath}`);
    const fullPath = `${baseDir}${framePath}`;
    return fs.existsSync(fullPath);
  }

  function findType(path, accept) {
    if (renderedTypes[accept]) return accept;
    for (const testType of testTypes) {
      if (exists(path, testType)) {
        return testType;
      }
    }
    return '';
  }

  async function rangeResponse(req, res, range, contentType, filePart) {
    // Better hope the range is a simple - range
    const bytes = range.substring(6).split('-');
    const path = `${baseDir}/${req.path}${filePart}`;
    if (!fs.existsSync(path)) {
      res.status(400).send('Not found');
      return;
    }
    // TODO - read just the range required.
    const rawdata = await fs.promises.readFile(path);
    const { length } = rawdata;
    bytes[0] ||= 0;
    bytes[1] ||= length - 1;
    bytes[1] = Math.min(bytes[1], length - 1);
    // The bytes values are inclusive at both ends, but the slice is exclusive at end
    const data = rawdata.slice(bytes[0], bytes[1] + 1);
    res.setHeader('Content-Range', `bytes ${bytes[0]}-${bytes[1]}/${length}`);
    res.status(206).send(data);
  }

  return (req, res, next) => {
    const accept = req.header('accept') || '';
    const queryAccept = req.query.accept;
    const contentType = findType(req.path, queryAccept || accept);
    const range = req.header('Range');
    const filePart = renderedTypes[contentType];
    if (!filePart) {
      webserverLog.warn("Didn't find type", filePart, accept);
      next();
      return;
    }
    res.setHeader('content-type', contentType);
    res.setHeader('Access-Control-Expose-Headers', '*');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Age', '65147');
    res.setHeader('Cache-Control', 'public, max-age=65147');

    if (range) {
      webserverLog.debug('Returning rendered byte range request', range, req.path);
      rangeResponse(req, res, range, contentType, filePart);
      return;
    }
    req.url = `${req.path}${filePart}`;
    webserverLog.debug('Retrieving', filePart, renderedTypes[filePart], req.url);
    next();
  };
}
