import { handleHomeRelative } from "@radicalimaging/static-wado-util";
import fs from "fs";

const extensions = {
  "image/jphc": ".jhc",
  "image/jls": ".jls",
  "image/jpeg": ".jpeg",
  "multipart/related": ".mht",
};

const contentTypeForExtension = {};
Object.entries(extensions).forEach(([key, value]) => {
  contentTypeForExtension[value] = key;
  contentTypeForExtension[`${value}.gz`] = key;
});

export default function byteRangeRequest(options) {
  const { dir } = options;
  const baseDir = handleHomeRelative(dir);

  function exists(path, frameName) {
    const framePath = path.replace("/frames/", `/${frameName}/`);
    const fullPath = `${baseDir}/${framePath}`;
    return fs.existsSync(fullPath);
  }

  function findExtension(path, accept) {
    const testExtension = extensions[accept] || ".mht";

    if (!testExtension) return "";
    const fullPath = `${baseDir}/${path}${testExtension}`;
    if (fs.existsSync(fullPath)) {
      return testExtension;
    }
    if (fs.existsSync(`${fullPath}.gz`)) {
      return `${testExtension}.gz`;
    }
    return "";
  }

  async function rangeResponse(req, res, range, extension) {
    // Better hope the range is a simple - range
    const bytes = range.substring(6).split("-");
    const path = `${baseDir}/${req.path}${extension}`;
    if (!fs.existsSync(path)) {
      res.status(400).send("Not found");
      return;
    }
    const rawdata = await fs.promises.readFile(path);
    const { length } = rawdata;
    bytes[0] ||= 0;
    bytes[1] ||= length - 1;
    bytes[1] = Math.min(bytes[1], length - 1);
    const data = rawdata.slice(bytes[0], bytes[1] + 1);
    res.setHeader("Content-Range", `bytes ${bytes[0]}-${bytes[1]}/${length}`);
    res.status(206).send(data);
  }

  return (req, res, next) => {
    const fsiz = req.query.fsiz;
    const accept = req.header("accept") || "";
    const queryAccept = req.query.accept;
    const extension = findExtension(req.path, queryAccept || accept);
    const range = req.header("Range");
    res.setHeader("content-type", contentTypeForExtension[extension] || "multipart/related");
    res.setHeader("Access-Control-Expose-Headers", "*");
    res.setHeader("Access-Control-Allow-Origin", "*");

    if (fsiz && exists(req.path, `fsiz`)) {
      req.url = req.path.replace("/frames/", "/fsiz/");
    } else if (range) {
      return rangeResponse(req, res, range, extension);
    }
    if (extension) {
      req.url = `${req.path}${extension}`;
    }
    next();
  };
}
