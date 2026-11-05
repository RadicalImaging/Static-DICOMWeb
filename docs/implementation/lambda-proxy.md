# Implementation: Lambda DICOMweb proxy

Status: draft. Not implemented. The requirements wait for confirmation as a set.

This document applies the user requirements of
[Lambda DICOMweb proxy](../specs/lambda-proxy.md) (`PRX-USR`) to the code. The specification
holds the user requirements, the scope, the releases, and the design decisions (Q1-Q35,
D1-D8). You can change an implementation requirement (`PRX-IMP`) freely when a better
approach appears. Record the change in this document.

## § Implementation requirements

Draft. Not yet confirmed as a set.

Topology:

- **PRX-IMP-1** CloudFront uses an origin group: S3 is the primary origin, and a Lambda
  function URL with response streaming is the failover origin on 403/404. Origins use OAC.
- **PRX-IMP-2** A CloudFront Function normalizes the request (for example the Accept header)
  to a canonical S3 key name. The S3 key, the cache key, and the failover use that name.
- **PRX-IMP-3** One upstream per deployment, set in configuration, with pluggable auth:
  none (default, IDC public proxy), a static header, or a token from Secrets Manager.
- **PRX-IMP-4** Two functions: a small zip function for metadata, frames, and multipart
  transforms; a container image (ECR) for thumbnails and compression (`canvas`, `jsdom`,
  `cs3d`). No `ffmpeg` in either function.

Miss handling:

- **PRX-IMP-5** On a miss the proxy fetches only the requested resource. No background job
  fetches the rest of a series or study.
- **PRX-IMP-6** Metadata: fetch, rewrite BulkDataURI values, store in S3, then respond.
- **PRX-IMP-7** Frames and bulkdata that the rule leaves unchanged: stream the upstream
  response to the client and write the same bytes to S3 in parallel.
- **PRX-IMP-8** Compression runs per frame, when the frame arrives. The proxy stores only the
  frames that clients requested. No series-level derived work.
- **PRX-IMP-9** A computed resource (thumbnail) uses the proxy recursively to get the
  metadata and the frame that it needs, and stores the result in S3. No thumbnail for video.
- **PRX-IMP-15** A frame that the rule compresses: fetch the original, encode, store, then
  answer from memory in the requested form.
- **PRX-IMP-16** The rule reads the metadata attributes and the transfer syntax of the frame
  response (PRX-IMP-24). When neither gives a transfer syntax, the rule assumes Explicit VR
  Little Endian (`1.2.840.10008.1.2.1`) for images, and JPEG baseline
  (`1.2.840.10008.1.2.4.50`) for WSI. The metadata handler removes every group 0002 element.
  It writes `AvailableTransferSyntaxUID` (0008,3002) only when the upstream gives a transfer
  syntax in (0008,3002) or (0002,0010): the destination transfer syntax when the rule
  recompresses, else the stored transfer syntax (D6). The proxy does not fetch an extra frame
  to find the transfer syntax. On an encode failure the proxy
  stores the original frame, labels it with its own transfer syntax, and logs the failure.
- **PRX-IMP-17** A CLI command builds `collections/<id>/studies[/<offset>]` from `idc-index`
  and upstream QIDO queries by StudyInstanceUID. The CloudFront Function maps
  `studies?<parameter>=<id>[&offset=<n>]` (no other filters) to those keys. The parameter
  name comes from configuration. Later pages exist only for collections with more than 1000
  studies.
- **PRX-IMP-18** Video-capable instances skip the rule and the thumbnail path.

Storage format:

- **PRX-IMP-10** The proxy writes S3 keys, content types, and content encodings with the
  `S3Ops` rules (`fileToKey`, `fileToContentType`, `fileToContentEncoding`). Those functions
  move to a shared module so that the Lambda function does not import deploy code.
- **PRX-IMP-11** The metadata rewrite emits BulkDataURI values in the S3 key form (without
  `.mht.gz`).
- **PRX-IMP-12** Transcoding uses `@dcmjs/commands` (dcmjs-commands) as a library, through a
  new subpath export of the per-frame codec API. dcmjs-commands gets JPEG-LS and HTJ2K
  targets, and the compression rule as `selectTargetSyntax(metadata, rules)`.
- **PRX-IMP-22** The proxy uses small functions of this repository for the metadata rewrite,
  the multipart wrap, and the S3 key rules. It does not use the dcmjs-commands writer.
- **PRX-IMP-23** The upstream client is a `fetch`-based client in dcmjs-commands (headers,
  streaming bodies, per-request `Accept`). No `jsdom` and no `dicomweb-client` in the zip
  function.
- **PRX-IMP-24** A frame request to the upstream asks for the request form of the final form
  in (0008,3002) of the stored instance metadata (D5), with the media type of the request form.
  The configuration lists the frame syntaxes that the upstream sends, with their media types;
  the default is the IDC 406 list of the facts below. After a 406 or 500, the request sends
  `Accept: multipart/related; type="image/*"` first and `multipart/related;
  type="application/octet-stream"` second.
  Part 10 requests send `multipart/related; type="application/dicom"; transfer-syntax=*`. The
  rule decides per frame from the media type and transfer syntax of the response.
- **PRX-IMP-25** On an upstream error the proxy passes the status to the client and stores
  nothing. CloudFront caches a 404 for 5 minutes, and a 429 or 5xx for 10 seconds. The proxy
  passes `Retry-After` through and logs each 429 with the request key.
- **PRX-IMP-26** Stored data is final: no TTL, no version marker, no invalidation. An operator
  deletes a study prefix in S3 by hand to get a fresh copy.
- **PRX-IMP-27** One upstream series metadata response writes the series metadata and every
  instance metadata file of the series, in parallel with a limit.

Deployment:

- **PRX-IMP-13** Plain CloudFormation templates (YAML) in the repository, deployed with
  `aws cloudformation deploy` or a small Node script on the AWS SDK v3. No CDK bootstrap, no
  `cdk.out`, no asset staging.
- **PRX-IMP-14** The templates replace all of the `s3-deploy` CDK stacks now: the root site
  (`/dicomweb/*`), the upload site (`/lei/*`), the client site with its SPA CloudFront
  Function, the response headers policy, and the hosted zone / certificate configuration.
  Separate sibling templates for site, proxy, and DNS.
- **PRX-IMP-19** DocumentDB is removed: `createDocumentDb.ts`, the `indexGroup` DocumentDB
  path, and the cluster itself.
- **PRX-IMP-20** Conversion of a CDK stack by import: (1) set `DeletionPolicy: Retain` on the
  buckets and the distribution, by an update of the old stack with the edited JSON of
  `GetTemplate`; (2) delete the old stack; (3) create the new stack with a CloudFormation
  resource import; (4) switch from OAI to OAC. A `--dry-run` prints each step. The DocumentDB
  cluster is not retained, so step 2 deletes it.
- **PRX-IMP-21** The deploy script reads the existing `static-wado.json5` and maps its key
  names to the template parameters. `packages/s3-deploy` keeps `S3Ops`, gets the templates and
  the deploy script, and drops `aws-cdk-lib`, `aws-cdk`, and `constructs`. The proxy is a new
  package (`packages/static-wado-lambda`).

Cloud portability and Release 1 deployment:

- **PRX-IMP-28** Code that touches a cloud service goes through a small interface, with one
  AWS implementation and one local implementation (for tests). The interfaces are: object
  store (`get`, `put`, `exists`); secret source (upstream token); compute invoke (encode,
  thumbnail); HTTP entry (the core handler takes a web-standard `Request` and returns a
  `Response`; an adapter connects the Lambda function URL). The edge request mapping
  (`PRX-IMP-2`, `-17`) is one pure function that the CloudFront Function wraps. No Azure
  implementation now.
- **PRX-IMP-29** (Release 1) A proxy stack template (`proxy.yaml`: the two functions, the
  function URL, the ECR repository, IAM, log groups) and a script `deploy-proxy`. The script
  deploys the stack, then attaches the proxy to the existing distribution through the
  CloudFront API: the function URL origin with an OAC for Lambda, the origin group (existing
  S3 origin primary, failover on 403/404), the viewer-request CloudFront Function, and a cache
  policy for `/dicomweb/*` with the query string in the cache key. The existing S3 origin keeps
  its OAI. `--dry-run` prints the distribution change; `--detach` restores the saved previous
  distribution configuration. The existing CDK stack does not know about the attach: a later
  CDK deploy removes the proxy from the distribution, and Release 2 imports the distribution
  in its attached state.

## Appendix: facts

These facts are the base of the design. They come from code and documents, as each section
states.

### Facts to check at the start of the implementation

These facts do not block a decision. The live checks of the IDC proxy are in the next section.

- Lambda runtime: dicom-codec declares `engines.node >= 24`. This affects only the container
  image (any Node version), because the zip function does not load the codecs.

### Facts from the live check of the IDC public proxy (2026-11-05)

Upstream: the IDC public proxy (URL in the section about the IDC upstream below), no auth. Client: the `DicomWebFetch` class
(`@dcmjs/commands/dicomweb-fetch`) of the dcmjs-commands branch `feat/dicomweb-fetch-client`,
commit `1eafa43`, and `fetch` with an explicit `Accept`. `dicomwebjs dump` prints nothing for a
QIDO or metadata URL and exits 0 (see the last item). Total transfer: about 30 MB read.

Test instances (one instance each):

| Kind | StudyInstanceUID | SOPInstanceUID | Stored form |
|---|---|---|---|
| CT | `1.2.840.113654.2.55.8191733375219125995341921872104648622` | `1.2.840.113654.2.55.253757522837977461742488072218984793581` | 512x409, MONOCHROME2, 16 bit, `1.2.840.10008.1.2.1` |
| SM | `2.25.142706219041623035237066035829917608689` | `1.3.6.1.4.1.5962.99.1.3120421285.85402270.1738287241637.31.0` | 174 frames of 256x256, YBR_FULL_422, `1.2.840.10008.1.2.4.50` |
| Colour (XC) | `1.3.6.1.4.1.5962.1.2.0.1677425356.1733` | `1.3.6.1.4.1.5962.1.1.0.2.4589.1677425356.1733` | 4096x3061, RGB, 8 bit, `1.2.840.10008.1.2.1` (about 37.6 MB per frame) |

Requests (`$U` is the proxy root):

    GET $U/studies?ModalitiesInStudy=SM&limit=1
    GET $U/series?Modality=CT&limit=3     GET $U/series?Modality=XC&limit=2
    GET $U/studies/{study}/series/{series}/instances/{sop}/metadata     Accept: application/dicom+json
    GET .../instances/{sop}/frames/1   with each Accept value of the table in item 3
    GET .../instances/{sop}            Accept: multipart/related; type="application/dicom"; transfer-syntax=*
    GET {BulkDataURI of 00131010}      Accept: multipart/related; type="application/octet-stream"
    GET $U/studies/1.2.3.4.5.6.7.8.9.999999/metadata | /series | studies?StudyInstanceUID=...

1. **Transfer syntax in the metadata.** The instance metadata has `TransferSyntaxUID`
   (0002,0010) with the stored transfer syntax: CT `1.2.840.10008.1.2.1`, SM
   `1.2.840.10008.1.2.4.50`, XC `1.2.840.10008.1.2.1`. It has no `AvailableTransferSyntaxUID`
   (0008,3002). Other file meta elements are present, for example (0002,0001) as a BulkDataURI.
2. **BulkDataURI form.** Every BulkDataURI is absolute, on the proxy host, with a `/bulk` path
   prefix that the DICOMweb root does not have:
   `https://proxy.imaging.datacommons.cancer.gov/bulk/current/<root path>/dicomWeb/studies/{study}/series/{series}/instances/{sop}/bulkdata/{tag}`.
   Pixel data is `.../bulkdata/7FE00010`. A sequence element has a path form, for example
   `.../bulkdata/00480105/0/00282000` (the ICC profile of the SM instance). The SM metadata
   also has `FFFCFFFC` and `00020001`; the CT metadata has private UN elements
   `00131010`-`00131013`. A GET of `00131010` with the octet-stream `Accept` returned 200, one
   part `application/octet-stream; transfer-syntax=1.2.840.10008.1.2.1`, 4 bytes.
3. **Frame requests** (`frames/1`). "default" is `multipart/related; type="image/*",
   multipart/related; type="application/octet-stream"`.

   | Accept | CT | SM (stored `.50`) | XC (stored `.1.2.1`) |
   |---|---|---|---|
   | default | 200, `image/jpeg; transfer-syntax=1.2.840.10008.1.2.4.70`, 214104 B | 200, `image/jpeg; .4.70`, 34136 B | 200, `image/jpeg; .4.70`, about 17.5 MB |
   | `type="application/octet-stream"` | 200, `application/octet-stream; .1.2.1`, 418816 B | 200, octet-stream `.1.2.1`, 196608 B (decoded) | 500, `text/html`, empty body |
   | octet-stream first, then `image/*` | 200, octet-stream `.1.2.1` | 200, octet-stream `.1.2.1` | 500 (no fallback to `image/*`) |
   | `type="application/octet-stream"; transfer-syntax=*` | 200, octet-stream `.1.2.1` | 200, `image/jpeg; .4.50`, about 3.1 KB (stored bytes) | 500 |
   | `type="image/*"; transfer-syntax=*` | 406, `text/plain` | 406 | 200, `.70` |

   - The server honours the order of the media types: the first one wins. When the server
     cannot give the first media type, it returns 500 and does not try the second.
   - `type="image/*"` always gives JPEG Lossless (`.4.70`), also for stored JPEG baseline
     (`.50`). The `.70` SM frame is 11 times larger than the stored frame.
   - Each part carries its own `Content-Type` with `transfer-syntax`.
   - The 406 body lists the supported frame media types: octet-stream with `.1.2.1` or `*`;
     `image/jpeg` with `.70`, `.50`, `.57`, `.51`; `image/png`; `application/x-deflate` with
     `.1.2.8.1`; `image/dicom-rle` with `.1.2.5`; `image/jls` with `.80`, `.81`; `image/jp2`
     with `.90`, `.91`; `image/jphc` with `.201`, `.202`, `.203`; `image/jxl` with `.112`,
     `.110`.
4. **Part 10 with `transfer-syntax=*`.** CT: 200, `application/dicom; .1.2.1`, 420976 B. SM:
   200, `application/dicom; .4.50`, 26879610 B. XC (about 37.6 MB): 500, empty body. Each
   response above about 32 MB failed with 500; a 26.9 MB response passed. The limit is an
   inference; the IDC documents do not give it.
5. **Unknown study** (`1.2.3.4.5.6.7.8.9.999999`): `studies/{uid}/metadata` returns 502,
   `application/json`, empty body, no `Retry-After`. `studies/{uid}/series` and
   `studies?StudyInstanceUID={uid}` return 204 with `Content-Type: text/html`. One request
   only; the 502 can be intermittent.

Not checked: the Google Healthcare store (needs a token), a video instance, and `image/*`
frames of a stored JPEG-LS, JPEG 2000, or HTJ2K instance.

**dcmjs-commands defect.** `dicomwebjs dump` and `instance` print nothing for an HTTP URL and
exit 0. `src/webRetrieve.js` sends no `Accept` header, and parses JSON only when the
`Content-Type` contains `application/json`. The proxy returns `application/dicom+json`, so
`readDicomWeb` returns a Buffer, and the command dumps nothing.
### Facts from the existing code

Paths are under `packages/`. Nobody tested these facts against a live deployment.

- **No upstream fetch exists.** No package fetches from an upstream DICOMweb service. The
  webserver miss path returns 404 with "TODO, query remote"
  (`static-wado-webserver/lib/controllers/server/notFoundControllers.mjs:5-21`). The only
  proxy is a DIMSE C-FIND / C-MOVE fallback (`proxyControllers.mjs:16-58`). `aeConfig` has no
  URL or auth model.
- **CDK stacks.** No Lambda, no origin group, no API Gateway. The stacks use the legacy OAI,
  not OAC. One CloudFront Function rewrites the client-site SPA paths
  (`s3-deploy/lib/clientSite.ts:44-54`). Behaviors: `/dicomweb/*`, `/lei/*`, and the default
  client site (`static-site.ts:77-84`). No cache policy is set. Versions: `aws-cdk-lib`
  2.272.0, `aws-cdk` 2.1144.0.
- **S3 key convention** (`s3-deploy/lib/S3Ops.mjs`). `fileToKey` (`:113-142`) strips `.gz`
  and `.br`, then `.mht` and `.jhc`, and collapses `index.json` / `index.mht` to the directory
  key. The object has `Content-Encoding: gzip`. `fileToContentType` (`:144-165`) gives
  extension-less frames the type `multipart/related` with no boundary parameter.
- **Local layout** (`file-structure.md`). Frames are always multipart in `frames/<n>.mht[.gz]`
  (`create-dicomweb/lib/instance/DicomWebWriter.mjs:445-494`). Instance metadata is
  `metadata.gz`. Part 10 is `index.mht.gz`.
- **BulkDataURI.** PixelData is `./frames` in both writers.
  - Legacy `static-wado-creator` writes non-pixel bulkdata as `bulkdata/xxx/yy/<hash>.gz`,
    with the BulkDataURI `.../<hash>` (`static-wado-creator/lib/writer/HashDataWriter.js:62-70`).
    The upload strips `.gz`, so the key and the URI match.
  - `create-dicomweb` writes `bulkdata/xx/yy/<hash>.mht.gz` with the BulkDataURI
    `.../<hash>.mht.gz` (`create-dicomweb/lib/instance/writeBulkdataFilter.mjs:240`). The key
    is `<hash>`, so this URI does not match. The mismatch affects only non-pixel bulkdata that
    `create-dicomweb` wrote. Not checked against a deployment.
- **Thumbnail.** `create-dicomweb thumbnail` (`thumbnailMain.mjs`) reads metadata plus one
  frame, decodes, and renders a 256x256 JPEG through `cs3d` (`getRenderedBuffer.ts`). `cs3d`
  renders on the CPU, but uses the native `canvas` addon (node-cairo) and `jsdom`. Video and
  `--rendered` thumbnails shell out to `ffmpeg` and `dcm4che`.
- **Compression in this repository.** Only the legacy `static-wado-creator` transcodes
  (`lib/operation/adapter/transcodeImage.js`). `create-dicomweb` does not transcode. The
  codecs (`@cornerstonejs/dicom-codec` and the `codec-*` packages) are WASM. (Q12 moved
  transcoding to dcmjs-commands.)
- **Multipart conversion.** Only Part 10 has a multipart-to-single-part stream transform
  (`static-wado-webserver/.../part10Controller.mjs:94-145`). Frame retrieval selects an
  existing file by Accept (`byteRangeRequest.mjs:17-79`), and does not convert. Parsers exist
  in `static-wado-util/lib/extractMultipart.js`, `readBulkData.js`, `multipartFile.mjs`.
- **healthlake** is a CLI that imports to AWS HealthImaging and downloads results. It is not
  a proxy.
- **Docs.** No existing document covers a proxy, cloud, or Lambda.

### Facts about the IDC / Google Healthcare upstream

From documents, not from live requests.

- **Public proxy:** `https://proxy.imaging.datacommons.cancer.gov/current/viewer-only-no-downloads-see-tinyurl-dot-com-slash-3j3d9jyp/dicomWeb`.
  No auth. Per-IP egress cap and a global daily cap, reset at midnight UTC; the quota page
  states 15 GB per day. Policy: https://learn.canceridc.dev/portal/proxy-policy.
- **Google store:** `https://healthcare.googleapis.com/v1/projects/nci-idc-data/locations/us-central1/datasets/idc/dicomStores/idc-store-v{N}/dicomWeb`
  (`v23` at the time of the check). OAuth token from any Google account; no IDC quota.
- **QIDO search attributes** (Google conformance statement,
  https://docs.cloud.google.com/healthcare-api/docs/dicom): study level StudyInstanceUID,
  PatientName, PatientID, AccessionNumber, ReferringPhysicianName, StudyDate; series level
  adds SeriesInstanceUID, Modality; instance level adds SOPInstanceUID. No collection filter.
  `collection_id` is a column of `idc-index`, not a DICOM attribute.
- **Paging:** `limit` / `offset` supported. Default 100 (studies, series), 1000 (instances).
  Maximum `limit` 5000 (studies, series), 50000 (instances). Maximum `offset` 1000000.
- **Frames:** with no `transfer-syntax` parameter, Google returns Explicit VR Little Endian
  (`1.2.840.10008.1.2.1`). `transfer-syntax=*` returns the stored form with no transcode. Google
  transcodes from uncompressed, deflate, JPEG, JPEG-LS, JPEG 2000, JPEG XL, HTJ2K, RLE, and
  Deflated Image Frame Compression; not from video syntaxes. No JPEG transcode for colour data
  deeper than 8 bits.
- **Metadata:** BulkDataURI for pixel data, OB/OW/UN, large OD/OF/OL/OV, numeric VM > 512, and
  any value > 100 MiB. Sequences larger than about 1 MiB are omitted with no BulkDataURI.
  `AvailableTransferSyntaxUID` is not listed.

### Facts from dcmjs-commands

The public repository `dcmjs-org/dcmjs-commands`, `@dcmjs/commands` 0.1.0, commit `f2f38ce`.
Read from code, not run.

- **Transcode command.** `dcmjs transcode` (`src/commands/transcode.js`) works on Part 10
  files, one frame at a time. `dicom_convert` does not transcode pixel data. The MCP server has
  no transcode tool.
- **CLI targets** (`src/pixel/transferSyntaxes.js:22-75`): Explicit VR Little Endian, RLE,
  Deflated Image Frame Compression (`1.2.840.10008.1.2.8.1`), JPEG baseline (`.50`), JPEG XL
  lossless (`.110`), JPEG XL JPEG Recompression (`.111`), JPEG XL (`.112`). No JPEG-LS, no
  HTJ2K in the table, but `encodeFrame` passes the UID to dicom-codec, which has JPEG-LS
  (charls) and HTJ2K (openjph) encoders.
- **`.50` to `.111`** is a bitstream repack with no pixel decode, and is reversible
  (`codec.js:262-300`). A `.111` target needs `.50` input.
- **Decoders:** uncompressed, deflate, JPEG (`.50`, `.51`, `.57`, `.70`), JPEG-LS, JPEG 2000,
  HTJ2K, JPEG XL, RLE.
- **Limits:** 1-bit data can go only to Explicit VR Little Endian, RLE, or deflate. YBR_FULL
  and lossy PALETTE COLOR cannot go to the compressed targets that change pixel values.
- **Per-frame API** (`src/pixel/codec.js`): `decodeFrame`, `encodeFrame`, `transcodeFrame`,
  `isBitstreamTranscode`, `imageInfoFromDict`. Header helpers in `pixelHeader.js`:
  `photometricAfter`, `updatePixelHeader` (transfer syntax, PlanarConfiguration, lossy
  attributes 0028,2110/2112/2114). The package `exports` map does not expose these.
- **No target-selection policy.** The target is always the explicit `--to` value.
- **Video:** no encoder. `dcmjs convert` to MP4 only extracts the existing MPEG-2 / H.264 /
  HEVC stream unchanged (`src/commands/convertVideo.js:104-208`).
- **Codecs** are all WASM (`@cornerstonejs/dicom-codec` ^1.2.0, lazy load). The largest is the
  JPEG XL encoder (2.6 MB). dicom-codec and `@cornerstonejs/codec-libjxl` 1.2.0 both declare
  `engines.node >= 24`. The full `node_modules` of dcmjs-commands is 145 MB, with dev
  dependencies (production size not measured).
- **dcmjs:** depends on `@dcmjs-org/dcmjs` 1.0.0-beta.5.
- **Own Static-DICOMweb writer** (`src/staticdicomweb/`), with layout differences from this
  repository (`part10.dcm`, bulkdata `<h3>/<h3>/<hash>.<ext>`, `series-natural.json.gz`).
- **DICOMweb client:** `DicomWebAccess` wraps `dicomweb-client` 0.11.2 with a `jsdom`
  XMLHttpRequest polyfill. It accepts `headers`. Frame requests carry no `transfer-syntax`
  parameter. `dicomwebjs download` / `part10` have no header option.
