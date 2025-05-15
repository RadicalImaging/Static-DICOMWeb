import JSONWriter from "./writer/JSONWriter";
import fs from "fs";

export function createStudyDirectories(dir) {
  fs.mkdirSync(`${dir}/studies`, { recursive: true });
  fs.mkdirSync(`${dir}/temp`, { recursive: true });
  if (!fs.existsSync(`${dir}/studies/index.json.gz`)) {
    console.warn("Creating new studies index");
    JSONWriter(dir, "index.json.gz", [], { gzip: true });
  }
}
