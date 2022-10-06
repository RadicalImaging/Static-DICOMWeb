import fs from "fs";
import path from "path";

export default function copyTo(is, destName) {
  const dirName = path.dirname(destName);
  if (!fs.existsSync(dirName)) {
    fs.mkdirSync(dirName, { recursive: true });
  }
  return new Promise((resolve, reject) => {
    try {
      is.pipe(fs.createWriteStream(destName)).on("finish", () => {
        console.log("Done piping");
        resolve(destName);
      });
    } catch (e) {
      reject(e);
    }
  });
}
