import { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from '@aws-sdk/lib-storage';
import fs from "fs";
import mime from "mime-types";
import { configGroup, endsWith } from "@radicalimaging/static-wado-util";
import ConfigPoint from "config-point";
import { createHash } from "crypto";
import { createReadStream } from "fs";

import copyTo from "./copyTo.mjs";

const compressedRe = /((\.br)|(\.gz))$/;
const indexRe = /\/index\.(json|mht)$/;

const octetStream = "application/octet-stream";
const multipartRelated = "multipart/related";
const multipartRelatedDicom = "multipart/related";
const imagejpeg = "image/jpeg";
const pngType = "image/png";
const applicationDicom = "application/dicom";
const ionType = "application/x-amzn-ion";

/** Key patterns to not cache */
const noCachePattern = /(index.html)|(index.js)|(index.umd.js)|(studies$)|(theme\/)|(^[a-zA-Z0-9\-_]+\.js)|(config\/)/;

// const prefixSlash = (str) => (str && str[0] !== "/" ? `/${str}` : str);
const noPrefixSlash = (str) => (str && str[0] === "/" ? str.substring(1) : str);

const extensionsToRemove = [".mht", ".jhc"];

const findExtensionToRemove = (name) => {
  for (const testExtension of extensionsToRemove) {
    const lastFound = name.lastIndexOf(testExtension);
    if (lastFound !== -1) return lastFound;
  }
};

class S3Ops {
  constructor(config, name, options) {
    this.group = configGroup(config, name, options);
    this.config = config;
    this.options = options;
  }

  get client() {
    if (!this._client) {
      this._client = new S3Client({ region: this.group.region });
    }
    return this._client;
  }

  /**
   * Converts a file name into a path name for s3.
   * @param {string} file - assumes relative to the group directory name
   * @returns path name in s3 as an absolute path
   */
  fileToKey(file) {
    let fileName = file.replaceAll("\\", "/");
    if (fileName === this.config.indexFullName) {
      console.verbose("Is index", fileName);
      const lastSlash = fileName.lastIndexOf("/");
      fileName = `${fileName.substring(0, lastSlash + 1)}index.json.gz`;
    }
    if (compressedRe.test(fileName)) {
      fileName = fileName.substring(0, fileName.length - 3);
    }
    if (fileName[0] != "/") fileName = `/${fileName}`;
    if (this.group.path && this.group.path != "/") {
      fileName = `${this.group.path}${fileName}`;
    }
    if (indexRe.test(fileName)) {
      const indexPos = fileName.lastIndexOf("/index");
      fileName = fileName.substring(0, indexPos);
    }
    if (fileName[0] == "/") {
      fileName = fileName.substring(1);
    }
    const extensionPos = findExtensionToRemove(fileName);
    if (extensionPos > 0) {
      fileName = fileName.substring(0, extensionPos);
    }
    if (!fileName) {
      throw new Error(`No filename defined for ${file}`);
    }
    return fileName;
  }

  /**
   * Generates the content type for the file name
   * @param {string} file
   */
  fileToContentType(file) {
    const compressed = compressedRe.test(file);
    const src = (compressed && file.substring(0, file.length - 3)) || file;
    return (
      mime.lookup(src) ||
      (src.indexOf(".dcm") !== -1 && applicationDicom) ||
      (src.indexOf(".mht") !== -1 && multipartRelatedDicom) ||
      (src.indexOf("bulkdata") !== -1 && octetStream) ||
      (src.indexOf(".raw") !== -1 && octetStream) ||
      (src.indexOf("frames") !== -1 && multipartRelated) ||
      (src.indexOf("thumbnail") !== -1 && imagejpeg) ||
      (src.indexOf(".ion") !== -1 && ionType) ||
      (src.indexOf("rendered") !== -1 && pngType) ||
      "application/json"
    );
  }

  fileToContentEncoding(file) {
    if (file.indexOf(".br") !== -1) return "brotli";
    if (file.indexOf(".gz") !== -1) return "gzip";
    return undefined;
  }

  fileToMetadata(file, hash) {
    if (hash) return { hash };
    return undefined;
  }

  toFile(dir, file) {
    if (!dir) return file;
    return `${dir}/${file}`;
  }

  remoteRelativeToUri(uri) {
    if (uri === undefined) return;
    if (uri.length > 5 && uri.substring(0, 5) === "s3://") return uri;
    return this.group.path ? `s3://${this.group.Bucket}${this.group.path}/${uri}` : `s3://${this.group.Bucket}/${uri}`;
  }

  async calculateMD5(filePath) {
    return new Promise((resolve, reject) => {
      const hash = createHash('md5');
      const stream = createReadStream(filePath);
      
      stream.on('data', data => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', error => reject(error));
    });
  }

  async shouldSkip(item, fileName) {
    if (!item) return false;
    if (!fs.existsSync(fileName)) {
      console.verbose("Doesn't exist, not skipping", fileName);
      return false;
    }
    const info = fs.statSync(fileName);
    if (item.size !== info.size) {
      console.verbose("Size different", item.size, info.size);
      return false;
    }
    // Files larger than a mb are compared ONLY on size
    if (info.size > 1024 * 1024) return true;

    if (fileName.indexOf("json") === -1) {
      // Skip MD5 check everything but JSON files
      return true;
    }
    const { ETag } = item;
    if (!ETag) return true;
    
    try {
      const md5 = await this.calculateMD5(fileName);
      const etagMd5 = ETag.replace(/['"]/g, ''); // Remove quotes from ETag
      return md5 === etagMd5;
    } catch (error) {
      console.warn("Error calculating MD5:", error);
      return false;
    }
  }

  /** Retrieves the given s3 URI to the specified destination path */
  async retrieve(uri, destFile, options = { force: false }) {
    const remoteUri = this.remoteRelativeToUri(uri);
    const bucketStart = 5;
    const bucketEnd = remoteUri.indexOf("/", bucketStart + 1);
    const Bucket = remoteUri.substring(bucketStart, bucketEnd === -1 ? remoteUri.length : bucketEnd);
    const Key = remoteUri.substring(bucketEnd + 1);
    const command = new GetObjectCommand({
      Bucket,
      Key,
    });
    if (options?.force !== true && fs.existsSync(destFile)) {
      console.info("Already exists", Key);
      return destFile;
    }

    if (this.options.dryRun) {
      console.log("Dry run - no retrieve", Bucket, Key, destFile);
      return "";
    }

    try {
      const result = await this.client.send(command);
      const { Body } = result;
      await copyTo(Body, destFile);
      console.info("Retrieved", Key);
    } catch (e) {
      console.warn("Error retrieving", Bucket, Key, e);
    }

    return destFile;
  }

  /** Gets a relative path from a response to the directory */
  getPath(contentItem) {
    return this.group.path ? contentItem.Key.substring(this.group.path.length) : contentItem.Key;
  }

  contentItemToFileName(contentItem) {
    const s = this.getPath(contentItem);
    if (endsWith(s, "thumbnail")) return s;
    if (endsWith(s, "/")) return `${s}index.json.gz`;
    if (endsWith(s, "/series") || endsWith(s, "/studies") || endsWith(s, "/instances")) return `${s}/index.json.gz`;
    if (endsWith(s, ".gz") || endsWith(s, ".jls")) return s;
    return `${s}.gz`;
  }

  async dir(uri) {
    const remoteUri = this.remoteRelativeToUri(uri);
    if (!remoteUri) {
      throw new Error(`No remoteURI found for ${uri}`);
    }
    const bucketStart = 5;
    const bucketEnd = remoteUri.indexOf("/", bucketStart + 1);
    const Bucket = remoteUri.substring(bucketStart, bucketEnd);
    const Prefix = noPrefixSlash(remoteUri.substring(bucketEnd));
    let ContinuationToken;
    const results = [];

    for (let continuation = 0; continuation < 1000; continuation++) {
      console.verbose('continuation', continuation, ContinuationToken);
      const command = new ListObjectsV2Command({
        Bucket,
        Prefix,
        MaxKeys: 25000,
        ContinuationToken,
      });
      try {
        const result = await this.client.send(command);
        (result?.Contents || []).forEach((it) => {
          results.push({
            ...it,
            size: it.Size,
            relativeUri: this.getPath(it),
            fileName: this.contentItemToFileName(it),
          });
        });
        if (!result.IsTruncated) {
          return results;
        }
        ContinuationToken = result.NextContinuationToken;
        if (!ContinuationToken) {
          throw new Error("No continuation token");
        }
      } catch (e) {
        console.log("Error sending", Bucket, remoteUri, e);
        return results;
      }
    }
    return results;
  }

async upload(dir, file, hash, excludeExisting = {}) {
  if (!file || !dir) {
    throw new Error('File and directory are required');
  }

  if (file.indexOf(".DS_STORE") !== -1) return false;

  const Key = this.fileToKey(file);
  const fileName = this.toFile(dir, file);

  if (!fs.existsSync(fileName)) {
    throw new Error(`File not found: ${fileName}`);
  }

  const stats = await fs.promises.stat(fileName);
  const ContentSize = stats.size;

  if (await this.shouldSkip(excludeExisting[Key], fileName)) {
    console.verbose("Exists", Key);
    return "exists";
  }

  if (this.options.dryRun) {
    console.log("Dry run - not stored", Key);
    return "dryrun";
  }

  const ContentType = this.fileToContentType(file);
  const Metadata = this.fileToMetadata(file, hash);
  const ContentEncoding = this.fileToContentEncoding(file);
  const isNoCacheKey = Key.match(noCachePattern);
  const CacheControl = isNoCacheKey ? "no-cache" : undefined;

  const maxRetries = 3;
  let retryCount = 0;
  let lastError;

  while (retryCount < maxRetries) {
    let fileStream;

    try {
      fileStream = fs.createReadStream(fileName);

      const upload = new Upload({
        client: this.client,
        params: {
          Bucket: this.group.Bucket,
          Key,
          Body: fileStream,
          ContentType,
          ContentEncoding,
          Metadata,
          CacheControl,
        },
        queueSize: 4, // concurrency
        partSize: 5 * 1024 * 1024, // 5MB parts (S3 minimum)
        leavePartsOnError: false,
      });

      upload.on('httpUploadProgress', (progress) => {
        console.verbose(`Uploading ${Key}: ${progress.loaded} bytes`);
      });

      await upload.done();
      console.verbose("Successfully uploaded", Key);
      return true;
    } catch (error) {
      lastError = error;
      retryCount++;

      const isStreamError = error.message.includes('Failed to read file') ||
                            error.message.includes('empty or unreadable');

      if (isStreamError) {
        console.error(`Stream error for ${Key}:`, error.message);
        throw error;
      }

      if (retryCount < maxRetries) {
        const delay = Math.pow(2, retryCount) * 1000;
        console.warn(
          `Upload failed for ${Key} (attempt ${retryCount}/${maxRetries}). ` +
          `Retrying in ${delay / 1000}s. Error: ${error.message}`
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } finally {
      if (fileStream) {
        fileStream.destroy();
      }
    }
  }

  const errorMsg = `Failed to upload ${Key} after ${maxRetries} attempts. Last error: ${lastError?.message || 'Unknown error'}`;
  console.error(errorMsg);
  throw new Error(errorMsg);
}
}

ConfigPoint.createConfiguration("s3Plugin", S3Ops);

export default S3Ops;
