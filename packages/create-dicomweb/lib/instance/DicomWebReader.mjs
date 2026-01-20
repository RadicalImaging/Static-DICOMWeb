/**
 * Joins path segments using forward slashes consistently
 * @param {...string} segments - Path segments to join
 * @returns {string} - Joined path with forward slashes
 * @private
 */
function joinPath(...segments) {
  return segments
    .filter(segment => segment && segment.length > 0)
    .join('/');
}

/**
 * Base reader class for DICOMweb file structure
 * Provides path construction methods only - no file system operations
 * Subclasses should implement file system specific operations
 */
export class DicomWebReader {
  /**
   * @param {string} baseDir - Base directory for DICOMweb structure
   */
  constructor(baseDir) {
    if (!baseDir) {
      throw new Error('baseDir is required for DicomWebReader');
    }
    this.baseDir = baseDir;
  }

  /**
   * Creates a path for study level
   * @param {string} studyUID - Study Instance UID
   * @param {string} [additionalPath] - Additional path to append
   * @returns {string} - Relative path
   */
  getStudyPath(studyUID, additionalPath = '') {
    if (!studyUID) {
      throw new Error('studyUID is required');
    }
    return joinPath(`studies/${studyUID}`, additionalPath);
  }

  /**
   * Creates a path for series level
   * @param {string} studyUID - Study Instance UID
   * @param {string} seriesUID - Series Instance UID
   * @param {string} [additionalPath] - Additional path to append
   * @returns {string} - Relative path
   */
  getSeriesPath(studyUID, seriesUID, additionalPath = '') {
    if (!studyUID || !seriesUID) {
      throw new Error('studyUID and seriesUID are required');
    }
    return joinPath(`studies/${studyUID}/series/${seriesUID}`, additionalPath);
  }

  /**
   * Creates a path for instance level
   * @param {string} studyUID - Study Instance UID
   * @param {string} seriesUID - Series Instance UID
   * @param {string} instanceUID - SOP Instance UID
   * @param {string} [additionalPath] - Additional path to append
   * @returns {string} - Relative path
   */
  getInstancePath(studyUID, seriesUID, instanceUID, additionalPath = '') {
    if (!studyUID || !seriesUID || !instanceUID) {
      throw new Error('studyUID, seriesUID, and instanceUID are required');
    }
    return joinPath(`studies/${studyUID}/series/${seriesUID}/instances/${instanceUID}`, additionalPath);
  }

  /**
   * Checks if a file exists
   * Must be implemented by subclasses
   * @param {string} relativePath - Relative path within baseDir
   * @param {string} filename - Filename to check
   * @returns {Object} - { exists: boolean, path: string, isCompressed: boolean }
   * @throws {Error} - If not implemented by subclass
   */
  fileExists(relativePath, filename) {
    throw new Error('fileExists must be implemented by subclass');
  }

  /**
   * Checks if a file exists at study level
   * @param {string} studyUID - Study Instance UID
   * @param {string} filename - Filename to check
   * @returns {Object} - { exists: boolean, path: string, isCompressed: boolean }
   */
  studyFileExists(studyUID, filename) {
    const relativePath = this.getStudyPath(studyUID);
    return this.fileExists(relativePath, filename);
  }

  /**
   * Checks if a file exists at series level
   * @param {string} studyUID - Study Instance UID
   * @param {string} seriesUID - Series Instance UID
   * @param {string} filename - Filename to check
   * @returns {Object} - { exists: boolean, path: string, isCompressed: boolean }
   */
  seriesFileExists(studyUID, seriesUID, filename) {
    const relativePath = this.getSeriesPath(studyUID, seriesUID);
    return this.fileExists(relativePath, filename);
  }

  /**
   * Checks if a file exists at instance level
   * @param {string} studyUID - Study Instance UID
   * @param {string} seriesUID - Series Instance UID
   * @param {string} instanceUID - SOP Instance UID
   * @param {string} filename - Filename to check
   * @returns {Object} - { exists: boolean, path: string, isCompressed: boolean }
   */
  instanceFileExists(studyUID, seriesUID, instanceUID, filename) {
    const relativePath = this.getInstancePath(studyUID, seriesUID, instanceUID);
    return this.fileExists(relativePath, filename);
  }

  /**
   * Opens an input stream to an uncompressed file
   * Must be implemented by subclasses
   * @param {string} relativePath - Relative path within baseDir
   * @param {string} filename - Filename to read
   * @returns {Promise<Readable>} - Readable stream (uncompressed)
   * @throws {Error} - If not implemented by subclass
   */
  async openInputStream(relativePath, filename) {
    throw new Error('openInputStream must be implemented by subclass');
  }

  /**
   * Opens an input stream at study level
   * @param {string} studyUID - Study Instance UID
   * @param {string} filename - Filename to read
   * @returns {Promise<Readable>} - Readable stream (uncompressed)
   */
  async openStudyInputStream(studyUID, filename) {
    const relativePath = this.getStudyPath(studyUID);
    return this.openInputStream(relativePath, filename);
  }

  /**
   * Opens an input stream at series level
   * @param {string} studyUID - Study Instance UID
   * @param {string} seriesUID - Series Instance UID
   * @param {string} filename - Filename to read
   * @returns {Promise<Readable>} - Readable stream (uncompressed)
   */
  async openSeriesInputStream(studyUID, seriesUID, filename) {
    const relativePath = this.getSeriesPath(studyUID, seriesUID);
    return this.openInputStream(relativePath, filename);
  }

  /**
   * Opens an input stream at instance level
   * @param {string} studyUID - Study Instance UID
   * @param {string} seriesUID - Series Instance UID
   * @param {string} instanceUID - SOP Instance UID
   * @param {string} filename - Filename to read
   * @returns {Promise<Readable>} - Readable stream (uncompressed)
   */
  async openInstanceInputStream(studyUID, seriesUID, instanceUID, filename) {
    const relativePath = this.getInstancePath(studyUID, seriesUID, instanceUID);
    return this.openInputStream(relativePath, filename);
  }

    /**
   * Reads a JSON file from a stream and parses it
   * @param {Readable} stream - Readable stream containing JSON data
   * @returns {Promise<Object>} - Parsed JSON object
   */
    async readJsonFromStream(stream) {
      return new Promise((resolve, reject) => {
        const chunks = [];
        
        stream.on('data', (chunk) => {
          chunks.push(chunk);
        });
        
        stream.on('end', () => {
          try {
            const buffer = Buffer.concat(chunks);
            const jsonString = buffer.toString('utf-8');
            const json = JSON.parse(jsonString);
            resolve(json);
          } catch (error) {
            reject(new Error(`Failed to parse JSON: ${error.message}`));
          }
        });
        
        stream.on('error', reject);
      });
    }
  
    /**
     * Reads a JSON file from a relative path
     * @param {string} relativePath - Relative path within baseDir
     * @param {string} filename - Filename to read
     * @returns {Promise<Object>} - Parsed JSON object
     */
    async readJsonFile(relativePath, filename) {
      const stream = await this.openInputStream(relativePath, filename);
      return this.readJsonFromStream(stream);
    }
  
  
}
