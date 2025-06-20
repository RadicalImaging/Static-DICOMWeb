import JSONWriter from "./writer/JSONWriter";
import fs from "fs";

export function createStudyDirectories(dir) {
  fs.mkdirSync(`${dir}/studies`, { recursive: true });
  fs.mkdirSync(`${dir}/temp`, { recursive: true });

  JSONWriter(dir, "index.json", [], { gzip: true });
}

export default createStudyDirectories;