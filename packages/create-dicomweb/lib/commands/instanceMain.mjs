import fs from "fs";
import { dirScanner } from '@radicalimaging/static-wado-util';
import { instanceFromStream } from '../instance/instanceFromStream.mjs';

/**
 * Stores each Part 10 file of fileNames (files or directories, recursive). dirScanner logs
 * the error of a file that is not stored, and of a path that does not exist, and continues
 * with the next file. Another error of a path (for example EACCES) throws.
 * @returns {Promise<{ studyUIDs: Set<string>, failedFiles: string[] }>} - The studies of the
 *   stored instances, and the files and paths that were not stored
 */
export async function storeInstanceFiles(fileNames, options) {
    const studyUIDs = new Set();
    const failedFiles = [];
    await dirScanner(fileNames, {
        ...options,
        recursive: true,
        // A path that does not exist is a file that was not stored (SQR-U5)
        onMissing: (filename) => failedFiles.push(filename),
        callback: async (filename) => {
            let result;
            try {
                result = await instanceFromFile(filename, options);
            } catch (error) {
                failedFiles.push(filename);
                throw error;
            }
            if (result?.information) {
                // Check both PascalCase and camelCase for compatibility
                const studyUID = result.information.StudyInstanceUid || result.information.studyInstanceUid;
                if (studyUID) {
                    studyUIDs.add(studyUID);
                }
            }
        }
    });
    return { studyUIDs, failedFiles };
}

/**
 * Stores each Part 10 file of fileNames. See storeInstanceFiles for the failed files.
 * @returns {Promise<Set<string>>} - The studies of the stored instances
 */
export async function instanceMain(fileNames, options) {
    return (await storeInstanceFiles(fileNames, options)).studyUIDs;
}

export function instanceFromFile(fileName, options = {}) {
    const stream = fs.createReadStream(fileName);
    return instanceFromStream(stream, options);
}
