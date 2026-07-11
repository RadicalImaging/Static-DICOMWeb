/**
 * S3 thumbnail upload helpers using Bun's native {@link https://bun.com/reference/bun/S3Client S3Client}.
 * Thumbnail output to `s3://` requires running under the Bun runtime (`bun run` / `bunx`), not Node.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Minimal INI parse for `~/.aws/credentials` (section headers + key = value lines).
 * @param {string} content
 * @returns {Record<string, Record<string, string>>}
 */
function parseIniSections(content) {
  /** @type {Record<string, Record<string, string>>} */
  const profiles = {};
  let section = '';
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;
    const sectionMatch = /^\[([^\]]+)\]\s*$/.exec(trimmed);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      if (section.toLowerCase().startsWith('profile ')) {
        section = section.slice('profile '.length).trim();
      }
      if (!profiles[section]) profiles[section] = {};
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq === -1 || !section) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    profiles[section][k] = v;
  }
  return profiles;
}

/**
 * Trims keys/secrets; drops empty session tokens.
 * Long-term IAM user access keys start with **AKIA** and must **not** send `x-amz-security-token`.
 * A leftover `aws_session_token` in ~/.aws/credentials (e.g. from a copied block) causes
 * "The provided token is malformed or otherwise invalid."
 *
 * Temporary STS credentials use **ASIA** and require `sessionToken`.
 *
 * @param {{ accessKeyId: string, secretAccessKey: string, sessionToken?: string }} creds
 * @returns {{ accessKeyId: string, secretAccessKey: string, sessionToken?: string }}
 */
function normalizeCredentialsForS3(creds) {
  const accessKeyId = typeof creds.accessKeyId === 'string' ? creds.accessKeyId.trim() : '';
  const secretAccessKey = typeof creds.secretAccessKey === 'string' ? creds.secretAccessKey.trim() : '';
  let sessionToken =
    typeof creds.sessionToken === 'string' ? creds.sessionToken.trim() : undefined;
  if (!sessionToken) sessionToken = undefined;

  const hadSession = Boolean(sessionToken);
  if (accessKeyId.startsWith('AKIA')) {
    if (hadSession) {
      console.verbose(
        '[S3] omitting session token: access key is AKIA (long-term IAM); aws_session_token must not be sent'
      );
    }
    sessionToken = undefined;
  }

  return {
    accessKeyId,
    secretAccessKey,
    ...(sessionToken ? { sessionToken } : {}),
  };
}

/**
 * Reads access keys from `~/.aws/credentials` for profile `default` (or `AWS_PROFILE`).
 * Does not use the AWS SDK — plain file read + INI-style parse.
 *
 * @returns {{ accessKeyId: string, secretAccessKey: string, sessionToken?: string } | null}
 */
export function readAwsCredentialsFromSharedFile() {
  const credentialsPath = path.join(os.homedir(), '.aws', 'credentials');
  try {
    if (!fs.existsSync(credentialsPath)) {
      return null;
    }
    const content = fs.readFileSync(credentialsPath, 'utf8');
    const profiles = parseIniSections(content);
    const profile = process.env.AWS_PROFILE || 'default';
    const keys = profiles[profile];
    if (!keys) {
      return null;
    }
    const accessKeyId = keys.aws_access_key_id || keys.AWS_ACCESS_KEY_ID;
    const secretAccessKey = keys.aws_secret_access_key || keys.AWS_SECRET_ACCESS_KEY;
    const sessionToken = keys.aws_session_token || keys.AWS_SESSION_TOKEN;
    if (!accessKeyId || !secretAccessKey) {
      return null;
    }
    return normalizeCredentialsForS3({
      accessKeyId,
      secretAccessKey,
      ...(sessionToken ? { sessionToken } : {}),
    });
  } catch {
    return null;
  }
}

/**
 * Env vars take precedence; otherwise `~/.aws/credentials` (default profile).
 * @returns {{ source: string, creds: { accessKeyId?: string, secretAccessKey?: string, sessionToken?: string } }}
 */
function resolveAwsCredentialsForBun() {
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    return {
      source: 'environment',
      creds: normalizeCredentialsForS3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        ...(process.env.AWS_SESSION_TOKEN && { sessionToken: process.env.AWS_SESSION_TOKEN }),
      }),
    };
  }
  const fromFile = readAwsCredentialsFromSharedFile();
  if (fromFile) {
    return {
      source: 'shared-credentials-file (~/.aws/credentials)',
      creds: normalizeCredentialsForS3(fromFile),
    };
  }
  return { source: 'none', creds: {} };
}

/**
 * True if the string is an S3 bucket URI for output (s3://bucket or s3://bucket/prefix).
 * @param {string} location
 * @returns {boolean}
 */
export function isS3OutputUri(location) {
  return typeof location === 'string' && /^s3:\/\//i.test(location.trim());
}

/**
 * @param {string} uri - s3://bucket or s3://bucket/optional/prefix
 * @returns {{ bucket: string, keyPrefix: string }}
 */
export function parseS3OutputUri(uri) {
  const s = uri.trim();
  const m = s.match(/^s3:\/\/([^/]+)(?:\/(.*))?$/i);
  if (!m) {
    throw new Error(`Invalid S3 URI (expected s3://bucket or s3://bucket/prefix): ${uri}`);
  }
  const bucket = m[1];
  if (!bucket) {
    throw new Error(`S3 URI missing bucket name: ${uri}`);
  }
  let keyPrefix = (m[2] || '').replace(/\\/g, '/').replace(/\/+$/, '');
  return { bucket, keyPrefix };
}

/**
 * DICOMweb-relative path for a thumbnail, matching FileDicomWebWriter layout.
 * @param {'study'|'series'|'instance'} level
 * @param {string} studyUID
 * @param {string} seriesUID
 * @param {string} [sopInstanceUid]
 * @param {string} filename - e.g. thumbnail or thumbnail-2
 * @returns {string} key path without bucket (no leading slash)
 */
export function thumbnailRelativeKey(level, studyUID, seriesUID, sopInstanceUid, filename) {
  if (level === 'study') {
    return `studies/${studyUID}/${filename}`;
  }
  if (level === 'series') {
    return `studies/${studyUID}/series/${seriesUID}/${filename}`;
  }
  return `studies/${studyUID}/series/${seriesUID}/instances/${sopInstanceUid}/${filename}`;
}

/**
 * @param {string} keyPrefix - optional prefix inside the bucket
 * @param {string} relativeKey - path from DICOMweb root
 */
export function joinS3ObjectKey(keyPrefix, relativeKey) {
  const rel = relativeKey.replace(/^\/+/, '').replace(/\\/g, '/');
  if (!keyPrefix) return rel;
  const pre = keyPrefix.replace(/\/+$/, '');
  return `${pre}/${rel}`;
}

let s3ClientCtorPromise;

/**
 * @returns {Promise<typeof import('bun').S3Client>}
 */
async function getS3ClientConstructor() {
  if (typeof Bun === 'undefined') {
    throw new Error(
      'Thumbnail output to s3:// requires the Bun runtime. Run with: bun bin/createdicomweb.mjs thumbnail ... (or bunx createdicomweb thumbnail ...)'
    );
  }
  if (!s3ClientCtorPromise) {
    s3ClientCtorPromise = import('bun').then(m => {
      const Ctor = m.S3Client;
      if (!Ctor) {
        throw new Error('Bun S3Client is not available; upgrade Bun to a version with S3 support.');
      }
      return Ctor;
    });
  }
  return s3ClientCtorPromise;
}

const bucketClientCache = new Map();

/**
 * Returns a Bun {@link import('bun').S3Client} scoped to one bucket (cached).
 *
 * Credentials (no AWS SDK): `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` if set, else
 * the **`[default]`** profile in **`~/.aws/credentials`** (or **`AWS_PROFILE`**). Region from
 * `AWS_REGION` / `AWS_DEFAULT_REGION` / `S3_REGION`. Endpoint defaults to
 * `https://s3.<region>.amazonaws.com` unless `AWS_ENDPOINT` / `S3_ENDPOINT` is set.
 *
 * @param {string} bucket
 * @param {string} [region]
 * @returns {Promise<import('bun').S3Client>}
 */
export async function getBunS3ClientForBucket(bucket, region) {
  const r =
    region ||
    process.env.AWS_REGION ||
    process.env.AWS_DEFAULT_REGION ||
    process.env.S3_REGION ||
    'us-east-1';
  const key = `${bucket}\0${r}`;
  let client = bucketClientCache.get(key);
  if (!client) {
    const S3Client = await getS3ClientConstructor();
    const { source, creds } = resolveAwsCredentialsForBun();
    const endpoint =
      process.env.AWS_ENDPOINT || process.env.S3_ENDPOINT || `https://s3.${r}.amazonaws.com`;
    console.verbose('[S3] auth:', source);
    client = new S3Client({
      bucket,
      region: r,
      endpoint,
      ...creds,
    });
    bucketClientCache.set(key, client);
  }
  return client;
}

/**
 * @param {import('bun').S3Client} client - Bun S3Client for the bucket
 * @param {string} key - full object key within the bucket
 * @returns {Promise<boolean>}
 */
export async function s3ObjectExists(client, key) {
  return client.exists(key);
}

function thumbnailBodyByteLength(body) {
  if (body == null) return 0;
  if (typeof body.byteLength === 'number') return body.byteLength;
  if (typeof body.length === 'number') return body.length;
  return 0;
}

/**
 * @param {import('bun').S3Client} client - Bun S3Client for the bucket
 * @param {string} key - full object key within the bucket
 * @param {Buffer|Uint8Array} body
 * @param {string} [bucketName] - bucket name for logs (if omitted, tries client.bucket / client.config.bucket)
 */
export async function putS3ThumbnailJpeg(client, key, body, bucketName) {
  await client.write(key, body, { type: 'image/jpeg' });
  const bytes = thumbnailBodyByteLength(body);
  let bucket = bucketName;
  if (!bucket && client && typeof client === 'object') {
    bucket = client.bucket || client.config?.bucket;
  }
  if (!bucket) bucket = '(bucket)';
  console.verbose(`[S3] PUT OK s3://${bucket}/${key} (${bytes} bytes) Content-Type=image/jpeg`);
}
