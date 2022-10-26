import { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import mime from "mime-types";
import { configGroup } from "@radicalimaging/static-wado-util";
import ConfigPoint from "config-point";
import path from "path";
import copyTo from "./copyTo.mjs";

const compressedRe = /((\.br)|(\.gz))$/;

const octetStream = "application/octet-stream";
const multipartRelated = "multipart/related";
const imagejpeg = "image/jpeg";
const applicationDicom = "application/dicom";

/** Key patterns to not cache */
const noCachePattern = /(index.html)|(studies$)|(theme\/)|(^[a-zA-Z0-9\-_]+\.js)|(config\/)/;

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
      console.log("S3 client config:", this.group);
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
    if (compressedRe.test(fileName)) {
      fileName = fileName.substring(0, fileName.length - 3);
    }
    if (fileName[0] != "/") fileName = `/${fileName}`;
    if (this.group.path && this.group.path != "/") {
      fileName = `${this.group.path}${fileName}`;
    }
    const indexPos = fileName.lastIndexOf("/index");
    if (indexPos !== -1 && fileName.indexOf("/", indexPos + 1) == -1) {
      fileName = fileName.substring(0, indexPos);
    }
    if (fileName[0] == "/") {
      fileName = fileName.substring(1);
    }
    if (!fileName) {
      throw new Error("No filename defined for", file);
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
      (src.indexOf("bulkdata") !== -1 && octetStream) ||
      (src.indexOf(".raw") !== -1 && octetStream) ||
      (src.indexOf("frames") !== -1 && multipartRelated) ||
      (src.indexOf("thumbnail") !== -1 && imagejpeg) ||
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

  /** Retrieves the given s3 URI to the specified destination path */
  async retrieve(remoteUri, Key, destDir, options = { force: false }) {
    const bucketStart = 5;
    const bucketEnd = remoteUri.indexOf("/", bucketStart + 1);
    const Bucket = remoteUri.substring(bucketStart, bucketEnd === -1 ? remoteUri.length : bucketEnd);
    const command = new GetObjectCommand({
      Bucket,
      Key,
    });
    const destName = path.join(destDir, Key);
    if (options?.force !== true && fs.existsSync(destName)) return destDir;

    try {
      const result = await this.client.send(command);
      const { Body } = result;
      await copyTo(Body, destName);
      console.log("Done copyTo destDir");
    } catch (e) {
      console.log("Error retrieving", Bucket, Key, e);
    }

    return destDir;
  }

  async dir(s3Uri) {
    console.log("lstat", s3Uri);
    // TODO - better validation than this
    const bucketStart = 5;
    const bucketEnd = s3Uri.indexOf("/", bucketStart + 1);
    const Bucket = s3Uri.substring(bucketStart, bucketEnd);
    const Prefix = noPrefixSlash(s3Uri.substring(bucketEnd));

    const command = new ListObjectsV2Command({
      Bucket,
      Prefix,
    });
    try {
      const result = await this.client.send(command);
      console.log("result=", result);
      return result?.Contents;
    } catch (e) {
      console.log("Error sending", Bucket, s3Uri, e);
      console.log("e=", e);
      return null;
    }
  }

  /**
   * Uploads file into the group s3 bucket.
   * Asynchronous
   */
  async upload(dir, file, hash, ContentSize) {
    const Key = this.fileToKey(file);
    console.log("fileToKey", file, Key);
    const ContentType = this.fileToContentType(file);
    const Metadata = this.fileToMetadata(file, hash);
    const ContentEncoding = this.fileToContentEncoding(file);
    const fileName = this.toFile(dir, file);
    const isNoCacheKey = Key.match(noCachePattern);
    const CacheControl = isNoCacheKey ? "no-cache" : undefined;
    if (isNoCacheKey) {
      console.log("no-cache set on", Key);
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
    console.log("uploading", file, ContentType, ContentEncoding, Key, ContentSize, Metadata, this.group.Bucket);
    if (this.options.dryRun) {
      console.log("Dry run - no upload", Key);
      return;
    }
    try {
      await this.client.send(command);
    } catch (error) {
      console.log("Error sending", file, error);
    } finally {
      await Body.close();
    }
  }
}

ConfigPoint.createConfiguration("s3Plugin", S3Ops);

export default S3Ops;
