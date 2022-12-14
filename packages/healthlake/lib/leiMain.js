import commonMain from "./commonMain.mjs";
import path from "path";
import fs from "fs";
import { dirScanner } from "@radicalimaging/static-wado-util";
import {execFileSync} from "node:child_process";
import extractSop from "./extractSop.mjs";

export async function leiConvert(sourcePath, config, name, options, deployer) {
  const dirName = options.name || path.basename(sourcePath);
  console.log("Options=", options.name);
  console.log("dirName=", dirName);
  const destPath = `${deployer.baseDir}/lei/${dirName}`;
  if( !fs.existsSync(destPath)) {
    fs.mkdirSync(destPath,{recursive: true});
  }

  let n=0;
  // Now, iterate over files in sourcePath
  await dirScanner(sourcePath, {
    recursive: true,
    callback: async (file) => {
      // Capture instanceUID
      const sopUID = await extractSop(file);
      if( !sopUID ) return;
      const destFileName = path.join(destPath,sopUID+'.dcm');
      // Execute dcm2dcm <sourcePath> <destPath>/<dirName>/<uid>.dcm
      execFileSync("dcm2dcm.bat", [file, destFileName], {stdio:'inherit'});
      n++;
    }
  })
  console.log("Converted", n, "files");
  return destPath;
}

export default async function (sourcePath, options) {
  console.log("sourcePath=", sourcePath);
  console.log("options=", options.name);
  await commonMain(this, "upload", options, leiConvert.bind(null,sourcePath));
}
