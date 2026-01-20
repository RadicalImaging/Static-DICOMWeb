import fs from "fs";
import { dirScanner } from '@radicalimaging/static-wado-util';
import { instanceFromStream } from '../instance/instanceFromStream.mjs';

export async function instanceMain(fileNames, options) {
    const studyUIDs = new Set();
    await dirScanner(fileNames, { 
        ...options, 
        recursive: true, 
        callback: async (filename) => {
            const result = await instanceFromFile(filename, options);
            if (result?.information) {
                // Check both PascalCase and camelCase for compatibility
                const studyUID = result.information.StudyInstanceUid || result.information.studyInstanceUid;
                if (studyUID) {
                    studyUIDs.add(studyUID);
                }
            }
        }
    });
    return studyUIDs;
}

export function instanceFromFile(fileName, options = {}) {
    const stream = fs.createReadStream(fileName);
    return instanceFromStream(stream, options);
}
