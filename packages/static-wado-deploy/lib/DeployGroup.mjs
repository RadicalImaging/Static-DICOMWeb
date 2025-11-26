import fs from "fs";
import {
  configGroup,
  handleHomeRelative,
} from "@radicalimaging/static-wado-util";
import path from "path";
import { plugins } from "@radicalimaging/static-wado-plugins";
import joinUri from "./joinUri.mjs";

/**
 * Deployment class.
 * Knows how to configure/load the deploy operations and then use them to
 * create/store deployments.
 *
 * Note, the buckets MUST already be configured in order to setup the deployment.
 * Copies things from the source file to the destination file.
 */

class DeployGroup {
  constructor(config, groupName, options = {}, deployPlugin) {
    this.config = config;
    this.deployPlugin = deployPlugin;
    this.groupName = groupName;
    this.options = {
      concurrentUploads: 2,  // Default number of concurrent uploads
      ...options
    };
    this.group = configGroup(config, groupName);
    if (!this.group) throw new Error(`No group ${groupName}`);
    this.baseDir = handleHomeRelative(this.group.dir);
    if (this.group.index) {
      this.indexFullName = `studies/${this.group.index}.json.gz`;
      config.indexFullName = this.indexFullName;
    }
  }

  // Loads the ops
  async loadOps() {
    const imported = await import(plugins[this.deployPlugin || "s3Plugin"]);
    const { createPlugin: CreatePlugin } = imported.default || imported;
    this.ops = new CreatePlugin(this.config, this.groupName, this.options);
  }

/**
 * Process a batch of files concurrently with a limit on parallel uploads.
 * @param {Array} files Array of {parentDir, name, relativeName, size} objects
 * @param {Object} excludeExisting Exclusion map
 * @param {number} parallelCount The number of concurrent uploads allowed
 * @returns {Promise<number>} Number of files uploaded
 */
async processBatch(files, excludeExisting, totalFiles, processStats, parallelCount = 5) {
  let completedUploads = 0;
  const activeUploads = [];  // Array to track active uploads
  const queue = [...files];   // Copy the files array into a queue
  
  const results = {};

  // Function to upload files one by one with concurrency control
  const uploadFile = async ({ baseDir, relativeName }) => {
    const result = await this.ops.upload(baseDir, relativeName, null, excludeExisting);
    results[relativeName] = result;
    processStats.count += 1;

    // Calculate progress metrics
    const elapsedSeconds = (Date.now() - processStats.startTime) / 1000;
    const overallSpeed = processStats.count / elapsedSeconds;
    const progress = ((processStats.count / totalFiles) * 100).toFixed(1);

    // Update progress every 100 files or when batch completes
    if (processStats.count % 100 === 0 || processStats.count === totalFiles) {
      const remainingFiles = totalFiles - processStats.count;
      const estimatedSecondsLeft = remainingFiles / overallSpeed;

      // Format time remaining in a human-readable format
      const etaMinutes = Math.floor(estimatedSecondsLeft / 60);
      const etaSeconds = Math.ceil(estimatedSecondsLeft % 60);
      const etaDisplay = etaMinutes > 0 
        ? `${etaMinutes}m ${etaSeconds}s`
        : `${etaSeconds}s`;

      console.log(
        `Progress: ${progress}% (${processStats.count}/${totalFiles}) | ` +
        `Speed: ${overallSpeed.toFixed(1)} files/sec | ` +
          `ETA: ${etaDisplay}`
        );
      }

    completedUploads++;
      return result;
  };

  const allUploads = [];

  // Function to start the next file upload if there is space in the parallel pool
  const startNextUpload = async () => {
    if (queue.length === 0) {
      return;  // No more files to process
    }

    // Get the next file in the queue
    const file = queue.shift();
    
    // Start the upload
    const uploadPromise = uploadFile(file);

    // Add the upload promise to the active uploads list
    activeUploads.push(uploadPromise);
    allUploads.push(uploadPromise);

    // When this upload completes, remove it from active uploads and start the next one
    uploadPromise.finally(() => {
      activeUploads.splice(activeUploads.indexOf(uploadPromise), 1);

      // Start the next upload if there are still files in the queue and space in the pool
      if (queue.length > 0 && activeUploads.length < parallelCount) {
        startNextUpload();
      }

      // If all uploads are completed, resolve the overall promise
      if (completedUploads === files.length) {
        processStats.uploadedFiles = completedUploads;
        return completedUploads;
      }
    });
  };

  // Start the initial batch of uploads (up to parallelCount files)
  for (let i = 0; i < Math.min(parallelCount, files.length); i++) {
    startNextUpload();
  }

  // Wait for all uploads to finish
  for(const promise of allUploads) {
    await promise;
  }

  return results;
}

  /**
   * Collects all files to be uploaded from a directory
   * @param {string} parentDir Parent directory path
   * @param {string} name File/directory name
   * @returns {Promise<Array>} Array of file objects
   */
  /**
   * Processes a directory in batches
   * @param {string} dirPath Directory path
   * @param {string} relativePath Relative path for file names
   * @param {Set} excludePatterns Patterns to exclude
   * @param {Object} stats Statistics object
   * @returns {Promise<Array>} Array of file objects
   */
  async processDirectory(dirPath, relativePath, excludePatterns, stats) {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const files = [];
    const directories = [];

    // Separate files and directories for optimized processing
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const entryRelativePath = path.join(relativePath, entry.name).replace(/\\/g, '/');
      
      // Early exclusion check
      const shouldExclude = Array.from(excludePatterns).some(pattern => 
        entryRelativePath.indexOf(pattern) !== -1
      );
      
      if (shouldExclude) continue;

      if (entry.isDirectory()) {
        directories.push({ path: fullPath, relativePath: entryRelativePath });
      } else {
        const stat = await fs.promises.stat(fullPath);
        files.push({
          baseDir: this.baseDir,
          relativeName: entryRelativePath,
          size: stat.size
        });
        
        // Update scanning progress
        stats.filesFound++;
        if (stats.filesFound % 100 === 0) {
          const elapsed = (Date.now() - stats.startTime) / 1000;
          const rate = stats.filesFound / elapsed;
          console.log(
            `Scanning: found ${stats.filesFound} files ` +
            `(${rate.toFixed(1)} files/sec)`
          );
        }
      }
    }

    // Process subdirectories in parallel with concurrency limit
    const batchSize = 5; // Process 5 directories at a time
    const results = [];
    
    for (let i = 0; i < directories.length; i += batchSize) {
      const batch = directories.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(dir => 
          this.processDirectory(dir.path, dir.relativePath, excludePatterns, stats)
        )
      );
      results.push(...batchResults.flat());
    }

    return [...files, ...results];
  }

  /**
   * Collects all files to be uploaded from a directory with optimized scanning
   * @param {string} parentDir Parent directory path
   * @param {string} name File/directory name
   * @returns {Promise<Array>} Array of file objects
   */
  async collectFiles(parentDir = "", name = "") {
    const startPath = path.join(this.baseDir, parentDir, name);
    const stats = {
      startTime: Date.now(),
      filesFound: 0
    };

    // Convert exclude patterns to Set for faster lookups
    const { exclude = ["temp"] } = this.options;
    const excludePatterns = new Set(exclude);

    console.log("Starting directory scan...");
    
    try {
      const files = await this.processDirectory(
        startPath,
        parentDir || "",
        excludePatterns,
        stats
      );

      const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1);
      const rate = (stats.filesFound / elapsed).toFixed(1);
      
      console.log(
        `\nDirectory scan complete:` +
        `\n- Found ${stats.filesFound} files` +
        `\n- Scan time: ${elapsed}s` +
        `\n- Scan rate: ${rate} files/sec`
      );

      return files;
    } catch (error) {
      console.error("Error scanning directory:", error);
      throw error;
    }
  }

  /**
   * Stores the entire directory inside basePath / subdir.
   * Uses parallel processing for improved performance.
   * @param {string} parentDir Parent directory path
   * @param {string} name File/directory name
   * @param {Object} excludeExisting Exclusion map
   * @returns {Promise<number>} Number of files uploaded
   */
  /**
   * Stores either a single file or an entire directory.
   * @param {string} parentDir Parent directory path
   * @param {string} name File/directory name
   * @param {Object} excludeExisting Exclusion map
   * @returns {Promise<number>} Number of files uploaded
   */
  async store(parentDir = "", name = "", excludeExisting = {}) {
    const fullPath = path.join(this.baseDir, parentDir, name);
    
    try {
      const stats = await fs.promises.stat(fullPath);
      
      // Handle single file upload
      if (stats.isFile()) {
        console.log("Processing single file:", name);
        const relativePath = path.join(parentDir, name).replace(/\\/g, '/');
        const result = await this.ops.upload(this.baseDir, relativePath, null, excludeExisting);
        console.log(result ? "File uploaded successfully" : "File upload skipped");
        return result ? 1 : 0;
      }
      
      // Handle directory upload
      if (stats.isDirectory()) {
        console.log("Collecting files from directory...");
        const files = await this.collectFiles(parentDir, name);
        const totalFiles = files.length;
        
        if (totalFiles === 0) {
          console.log("No files to upload");
          return 0;
        }
        
        const batchSize = this.options.concurrentUploads || 10;
        console.noQuiet('Found', totalFiles, 'files to process concurrently using', batchSize, 'uploaders');
        
        // Stats object to track overall progress
        const processStats = { 
          count: 0,
          startTime: Date.now()
        };
        
        const results = await this.processBatch(files, excludeExisting, totalFiles, processStats, batchSize);
        const count = [...Object.keys(results)].length;
                
        const totalTime = ((Date.now() - processStats.startTime) / 1000).toFixed(1);
        const avgSpeed = (count / totalTime).toFixed(1);
        
        // Format total time in a human-readable format
        const totalMinutes = Math.floor(totalTime / 60);
        const totalSeconds = Math.ceil(totalTime % 60);
        const totalTimeDisplay = totalMinutes > 0 
          ? `${totalMinutes}m ${totalSeconds}s`
          : `${totalSeconds}s`;
        
        console.log(
          `\nUpload complete:` +
          `\n- ${count} files uploaded successfully` +
          `\n- ${totalFiles - count} files skipped/failed` +
          `\n- Total time: ${totalTimeDisplay}` +
          `\n- Average speed: ${avgSpeed} files/sec`
        );

        return results;
      }
      
      throw new Error(`Path is neither a file nor a directory: ${fullPath}`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Path does not exist: ${fullPath}`);
      }
      throw error;
    }
  }

  async dir(uri) {
    const list = await this.ops.dir(uri);
    return list.reduce((acc, value) => {
      acc[value.Key] = value;
      return acc;
    }, {});
  }

  /**
   * Retrieves the contents of uri into the local baseDir, preserving the original naming/directory structure
   */
  async retrieve(options = {}, parentDir = "", name = "") {
    const { remoteUri } = options;
    const relativeName = joinUri(parentDir, name);
    if (remoteUri) {
      const destName = options.destName || relativeName;
      console.noQuiet(
        'Retrieving specific URI',
        remoteUri,
        relativeName,
        'to',
        this.baseDir,
        destName
      );
      await this.ops.retrieve(
        joinUri(remoteUri, relativeName),
        path.join(this.baseDir, destName)
      );
      return { skippedItems: 0, retrieved: 1 };
    }

    // Doing a directory index here
    const contents = await this.ops.dir(relativeName);
    let skippedItems = 0;
    let retrieved = 0;
    if (!contents) {
      console.log('Directory does not exist:', relativeName);
      return { skippedItems, retrieved };
    }
    const { include = [], exclude = ['temp'], force } = options;
    for (const item of contents) {
      // item is an object containing information about this object
      if (!item.relativeUri) throw new Error('Nothing to retrieve');
      const destName = path.join(this.baseDir, item.fileName);
      if (include.length) {
        const foundItem = include.find((it) => destName.indexOf(it) !== -1);
        // Not skipped or retrieved, this is just out of scope
        if (!foundItem) {
          console.verbose(
            'Skipping',
            destName,
            'because it includes',
            foundItem
          );
          continue;
        }
      }
      const isExcluded = exclude.find((it) => destName.indexOf(it) !== -1);
      if (isExcluded) {
        continue;
      }
      if (fs.existsSync(destName) && !force) {
        if (this.ops.shouldSkip(item, destName)) {
          console.verbose('Skipping', destName);
          skippedItems += 1;
          continue;
        }
      }
      await this.ops.retrieve(item.relativeUri, destName);
      retrieved += 1;
    }
    console.log(
      'Retrieved',
      retrieved,
      'items to',
      this.baseDir,
      'and skipped',
      skippedItems
    );
    return { skippedItems, retrieved };
  }
}

export default DeployGroup;
