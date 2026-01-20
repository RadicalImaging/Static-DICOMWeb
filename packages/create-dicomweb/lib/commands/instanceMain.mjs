import fs from "fs";
import { dirScanner } from '@radicalimaging/static-wado-util';
import { instanceFromStream } from '../instance/instanceFromStream.mjs';

export async function instanceMain(fileNames, options) {
    await dirScanner(fileNames, { ...options, recursive: true, callback: (filename) => instanceFromFile(filename, options) })
}

export function instanceFromFile(fileName, options = {}) {
    const stream = fs.createReadStream(fileName);
    return instanceFromStream(stream, options);
}
