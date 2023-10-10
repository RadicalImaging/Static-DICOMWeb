import { handleHomeRelative } from "@radicalimaging/static-wado-util";
import fs from "fs";

const extensions = {
  "image/jphc": ".jhc",
  "image/jpeg": ".jpeg",
};

export default function byteRangeRequest(options) {
  const { dir } = options;
  const baseDir = handleHomeRelative(dir);

  
  function exists(path, frameName) {
    const framePath = path.replace("/frames/",`/${frameName}/`);
    const fullPath = `${baseDir}/${framePath}`;
    return fs.existsSync(fullPath);
  }

  async function rangeResponse(req,res,range) {
    // Better hope the range is a simple - range
    const bytes = range.substring(6).split('-');
    const path = `${baseDir}/${req.path}`;
    if( !fs.existsSync(path) ) {
        res.status(400).text("Not found");
        return;
    }
    console.log("Generating response from", bytes[0], "to", bytes[1], "for", path);
    const rawdata = await fs.promises.readFile(path);
    const data = rawdata.slice(bytes[0], bytes[1]);
    res.setHeader("content-type", "multipart/related");
    res.status(206).send(data);
  }

  return (req, res, next) => {
    const fsiz = req.query.fsiz;
    const range = req.header("Range");
    if (fsiz && exists(req.path, `fsiz`)) {
      req.url = req.path.replace("/frames/", "/fsiz/");
      console.log("Using fsiz relative directory for fractional sizes", req.url);
    } else if (range) {
      console.log("Returning byte range request", range, req.path);
      return rangeResponse(req,res,range);
    }
    const accept = req.header("accept") || "";
    const queryAccept = req.query.accept;
    const extension = extensions[queryAccept || accept];
    if (extension) {
      res.setHeader("content-type", queryAccept || accept);
      req.url = `${req.path}${extension}`;
    } else {
      res.setHeader("content-type", "multipart/related");
    }
    next();
  };
};


