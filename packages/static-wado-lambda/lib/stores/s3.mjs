import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';

const isNotFound = error =>
  error.name === 'NoSuchKey' ||
  error.name === 'NotFound' ||
  error.$metadata?.httpStatusCode === 404;

/**
 * The S3 object store (PRX-IMP-28). A key is relative to the DICOMweb root; the S3 key is
 * `<prefix>/<key>`. Get the key, the content type, and the content encoding of a file from
 * `putFile`. A missing object gives 404 only when the role has `s3:ListBucket`; without it, S3
 * answers 403, and `get` and `exists` throw.
 * @param {Object} options
 * @param {string} options.bucket
 * @param {string} [options.prefix] - The S3 key of the DICOMweb root, for example `dicomweb`
 * @param {S3Client} [options.client]
 * @returns {{
 *   get: (key: string) => Promise<{body: Buffer, contentType?: string, contentEncoding?: string}|undefined>,
 *   put: (key: string, body: Uint8Array|string, options?: {contentType?: string, contentEncoding?: string}) => Promise,
 *   exists: (key: string) => Promise<boolean>,
 * }}
 */
export function s3Store({ bucket, prefix = '', client = new S3Client({}) }) {
  const target = key => ({ Bucket: bucket, Key: prefix ? `${prefix}/${key}` : key });
  return {
    async get(key) {
      try {
        const result = await client.send(new GetObjectCommand(target(key)));
        return {
          body: Buffer.from(await result.Body.transformToByteArray()),
          contentType: result.ContentType,
          contentEncoding: result.ContentEncoding,
        };
      } catch (error) {
        if (isNotFound(error)) {
          return undefined;
        }
        throw error;
      }
    },
    async put(key, body, { contentType, contentEncoding } = {}) {
      await client.send(
        new PutObjectCommand({
          ...target(key),
          Body: body,
          ContentType: contentType,
          ContentEncoding: contentEncoding,
        })
      );
    },
    async exists(key) {
      try {
        await client.send(new HeadObjectCommand(target(key)));
        return true;
      } catch (error) {
        if (isNotFound(error)) {
          return false;
        }
        throw error;
      }
    },
  };
}

export default s3Store;
