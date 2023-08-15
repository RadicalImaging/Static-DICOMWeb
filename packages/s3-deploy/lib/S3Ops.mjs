import { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import mime from "mime-types";
import { configGroup, endsWith } from "@radicalimaging/static-wado-util";
import ConfigPoint from "config-point";
import { execFileSync } from "node:child_process";

import copyTo from "./copyTo.mjs";

const compressedRe = /((\.br)|(\.gz))$/;
const indexRe = /\/index\.(json|mht)$/;

const octetStream = "application/octet-stream";
const multipartRelated = "multipart/related";
const multipartRelatedDicom = "multipart/related";
const imagejpeg = "image/jpeg";
const applicationDicom = "application/dicom";
const ionType = "application/x-amzn-ion";

/** Key patterns to not cache */
const noCachePattern = /(index.html)|(index.js)|(index.umd.js)|(studies$)|(theme\/)|(^[a-zA-Z0-9\-_]+\.js)|(config\/)/;

// const prefixSlash = (str) => (str && str[0] !== "/" ? `/${str}` : str);
const noPrefixSlash = (str) => (str && str[0] === "/" ? str.substring(1) : str);

class S3Ops {
  constructor(config, name, options) {
    this.group = configGroup(config, name);
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
    const extensionPos = fileName.lastIndexOf(".jhc");
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

  shouldSkip(item, fileName) {
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
    const md5 = execFileSync(`md5sum "${fileName}"`, { shell: true });
    for (let i = 1; i < ETag.length - 1; i++) {
      if (md5[i] != ETag.charCodeAt(i)) {
        // Leave this for now as there might be more file types needing specific encoding checks
        console.log("md5 different at", i, md5[i], ETag.charCodeAt(i), ETag, md5.toString());
        return false;
      }
    }
    return true;
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
      console.verbose("Skipping", destFile);
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
      console.verbose("Done copyTo destDir");
    } catch (e) {
      console.log("Error retrieving", Bucket, Key, e);
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
      console.verbose("continuation", continuation, ContinuationToken);
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

  /**
   * Uploads file into the group s3 bucket.
   * Asynchronous
   */
  async upload(dir, file, hash, ContentSize, excludeExisting = {}) {
    const Key = this.fileToKey(file);
    const ContentType = this.fileToContentType(file);
    const Metadata = this.fileToMetadata(file, hash);
    const ContentEncoding = this.fileToContentEncoding(file);
    const fileName = this.toFile(dir, file);
    const isNoCacheKey = Key.match(noCachePattern);
    const CacheControl = isNoCacheKey ? "no-cache" : undefined;

    if (this.shouldSkip(excludeExisting[Key], fileName)) {
      console.info("Exists", Key);
      return false;
    }

    const Body = fs.createReadStream(fileName);
    const command = new PutObjectCommand({
      Body,
      Bucket: this.group.Bucket,
      ContentType,
      ContentEncoding,
      Key,
      CacheControl,
      Metadata,
      ContentSize,
    });
    console.verbose("uploading", file, ContentType, ContentEncoding, Key, ContentSize, Metadata, this.group.Bucket);
    if (this.options.dryRun) {
      console.log("Dry run - no upload", Key);
      // Pretend this uploaded - causes count to change
      return true;
    }
    try {
      await this.client.send(command);
      console.info("Uploaded", Key);
      return true;
    } catch (error) {
      console.log("Error sending", file, error);
      return false;
    } finally {
      await Body.close();
    }
  }
}

ConfigPoint.createConfiguration("s3Plugin", S3Ops);

export default S3Ops;
