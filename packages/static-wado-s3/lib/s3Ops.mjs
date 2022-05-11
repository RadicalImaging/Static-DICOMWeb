import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import mime from "mime-types";
import { configGroup } from "@ohif/static-wado-util";

const compressedRe = /((\.br)|(\.gz))$/;
const indexRe = /\/index\.json$/;

const octetStream = "application/octet-stream";
const multipartRelated = "multipart/related";
const imagejpeg = "image/jpeg";

class S3Ops {
  constructor(config, name) {
    this.group = configGroup(config, name);
    this.config = config;
  }

  get client() {
    if (!this._client) {
      this._client = new S3Client(this.group);
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
    if (indexRe.test(fileName)) {
      const indexPos = fileName.lastIndexOf("/index");
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
    return null;
  }

  toFile(dir, file) {
    if (!dir) return file;
    return `${dir}/${file}`;
  }

  /**
   * Uploads file into the group s3 bucket.
   * Asynchronous
   */
  upload(dir, file, hash, ContentSize) {
    const Key = this.fileToKey(file);
    const ContentType = this.fileToContentType(file);
    const Metadata = this.fileToMetadata(file, hash);
    const ContentEncoding = this.fileToContentEncoding(file);
    const fileName = this.toFile(dir, file);
    const Body = fs.createReadStream(fileName);
    const command = new PutObjectCommand({
      Body,
      Bucket: this.group.Bucket,
      ContentType,
      ContentEncoding,
      Key,
      Metadata,
      ContentSize,
    });
    console.log("uploading", file, ContentType, ContentEncoding, Key, ContentSize, Metadata, this.group.Bucket);
    return this.client.send(command);
  }
}

export default S3Ops;
