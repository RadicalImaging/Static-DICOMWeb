import fs from "fs";
import { instanceFromStream } from '../instance/instanceFromStream';

export async function instanceMain(fileNames, options) {
    for(const fileName of fileNames) {
        await instanceFromFile(fileName, options);
    }
}

export function instanceFromFile(fileName, options = {}) {
    console.warn("Converting instance", fileName);
    const stream = fs.createReadStream(fileName);
    return instanceFromStream(stream, options);
}
