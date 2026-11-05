# Specification: Lambda DICOMweb proxy between CloudFront and S3

Status: draft. Not implemented. The requirement sections wait for confirmation as a set.

## Scope

A Lambda function sits between CloudFront and the S3 buckets of a Static-DICOMweb
deployment. S3 content is the default. On a miss, the Lambda function gets the data from an
upstream DICOMweb service (default: the IDC public proxy), transforms the data, and stores the
result in S3. The Lambda function is optional: a deployment without it behaves as a static
deployment.

The main purpose is the performance of metadata and thumbnails. A typical miss fetches the
metadata and one image frame for a thumbnail. Clients can be configured to fetch the other
images directly from the upstream. Bulk transfers use a personal access token and an S3
upload, outside of the Lambda function.

The work also replaces the CDK deployment of `packages/s3-deploy` with plain CloudFormation
templates, for all deployments, and removes DocumentDB.

Releases (see D1-D3 in the section "Decisions"):

- **Release 1 (proxy only).** The proxy, and a deployment of the proxy onto an existing
  deployment. Release 1 does not redeploy the buckets, the client site, or the upload site.
  The existing CDK stack stays the owner of those resources.
- **Release 2 (deployment).** The CloudFormation templates for all components, the CDK and
  DocumentDB removal, and the stack conversion (`PRX-USR-10`, `-11`, `-12`, `PRX-IMP-13`,
  `-14`, `-19`, `-20`, `-21`).
- An Azure deployment can be necessary within 6 months. Code that touches a cloud service goes
  through an interface, with an AWS implementation only (`PRX-IMP-28`). No Azure code now.

This specification holds the user requirements (prefix `PRX-USR`). Change a user requirement
only when it describes the behaviour wrongly, or when the intended user-facing behaviour
changes. An implementation that is inconvenient is never a reason to change a user
requirement.

The implementation requirements (prefix `PRX-IMP`) and the facts of the existing code are in
[`docs/implementation/lambda-proxy.md`](../implementation/lambda-proxy.md). The decisions
below refer to them by identifier.

## § User requirements

Draft. Not yet confirmed as a set.

Retrieval:

- **PRX-USR-1** A client reads a study through the CloudFront URL. When S3 holds the
  resource, CloudFront serves the S3 content, and no Lambda function runs.
- **PRX-USR-2** When S3 does not hold the resource, the client gets the resource from the
  upstream DICOMweb service through the same URL, with no change in the client.
- **PRX-USR-3** The metadata that the client gets has BulkDataURI values that resolve through
  the CloudFront URL, not through the upstream. (Interaction with direct upstream frame
  access: Q31.)
- **PRX-USR-4** A client can get a thumbnail for a study, series, or instance, also when S3
  holds no data for that study yet. Exception: the deployment does not create thumbnails for
  video.
- **PRX-USR-5** A client can ask for a frame as single-part or multipart data, and in a
  compressed transfer syntax. The deployment gives only the variants that its configuration
  permits.
- **PRX-USR-6** A query with an exact UID at study or series level returns the stored index
  file of that UID, the whole file, as Static-DICOMweb does now. When S3 has no index file, the
  proxy gets it from the upstream and stores it. An exact-UID query at instance level, and all
  other queries, go to the upstream with a short cache time, and the proxy does not store them
  (D8).
- **PRX-USR-7** One frame request causes the fetch of that resource only. A large series does
  not delay the first frame.
- **PRX-USR-13** A study query by IDC collection returns the stored study list of that
  collection, in pages of 1000 studies. A collection that nobody has built returns 404.
- **PRX-USR-14** Every client that requests the same URL with the same Accept header gets the
  same bytes, also on the first request.
- **PRX-USR-15** Client contract: a client decodes each frame by the transfer syntax of the
  response (the multipart `Content-Type`), not by `AvailableTransferSyntaxUID` in the
  metadata. The metadata has no `AvailableTransferSyntaxUID` when the upstream does not give
  one.

Storage:

- **PRX-USR-8** The deployment stores image frames in the transfer syntax that a fixed,
  configured compression rule selects (rule: settled Q17). Lossy re-encode of data that is
  already lossy is permitted by the default rule.
- **PRX-USR-16** The deployment stores video-capable instances (video SOP classes, and
  instances with a video transfer syntax) unchanged, as the upstream sends them: no re-encode
  of a video, and no compression of its frames.
- **PRX-USR-9** An operator can restrict population to configured studies or IDC collections.
  No client can store data through the proxy (no STOW-RS). (Changed by D2: no upstream rate
  limit setting. The upstream 429 handling of `PRX-IMP-25` limits the load.)
- **PRX-USR-17** An operator can build the stored study list of an IDC collection with a CLI
  command, one time per IDC release.

Deployment:

- **PRX-USR-19** (Release 1) An operator adds the proxy to an existing deployment with one
  command, and removes it with one command. The command does not redeploy the buckets, the
  client site, or the upload site, and keeps the CloudFront URL and the stored data.
- **PRX-USR-10** (Release 2) An operator deploys every Static-DICOMweb deployment (with or without the
  proxy) from CloudFormation templates, with no CDK.
- **PRX-USR-11** (Release 1 for the proxy settings, Release 2 for the rest) The deployment
  accepts the existing configuration parameter names.
- **PRX-USR-12** (Release 2) An operator can convert an existing CDK-deployed stack to the new templates,
  and keeps the buckets, the data, and the CloudFront URL. The conversion deletes a DocumentDB
  cluster of the old stack.
- **PRX-USR-18** The default upstream is the IDC public proxy, with no auth. An operator can
  configure the Google Healthcare store of IDC (or another upstream) with a token.

## Decisions

Each line gives the result of one settled design question (Q1-Q35), or of one decision after
the design questions (D1-D8). The requirement sections hold the current text. A later item
can change an earlier item, and the line then says so.

- **Q1 - Upstream scope.** The deployment has one upstream, which the configuration sets.
  The upstream auth is pluggable (`PRX-IMP-3`).
- **Q2 - Insertion.** CloudFront uses an origin group. S3 is the primary origin. A Lambda
  function URL with response streaming is the failover origin on 403 and 404 (`PRX-IMP-1`).
- **Q3 - Population.** The proxy tees frames and bulkdata, and handles metadata
  synchronously. The proxy does no series-level derived work. The proxy compresses each frame
  when the frame arrives, and stores only the frames that arrive.
- **Q4 - Granularity.** The proxy fetches only the requested resource. The viewer limits its
  concurrent requests, so this fetch pattern fits the viewer. The choice keeps the latency of
  one retrieve low, and the proxy does not fetch a full series asynchronously (`PRX-IMP-5`).
- **Q5 - Who can write.** Population is open read-through, with a configured allowlist of
  studies and collections. No client can store data (no STOW-RS). D2 removed the upstream rate
  limit of this answer.
- **Q6 - Queries.** An exact-UID query at the study, series, or instance level returns the
  whole stored index file of that UID, as Static-DICOMweb does now (`PRX-USR-6`).
- **Q7 - Compression.** The deployment can use any compression for stored instances, as a
  fixed, configured rule selects. Q17 gives the rule.
- **Q8 - Transforms on retrieval.** A CloudFront Function maps the Accept header to a
  canonical name. The deployment stores or transforms only some variants (Q20). The Lambda
  function is optional.
- **Q9 - Runtime.** The proxy is a Node.js Lambda function in a new package, with no CDK
  construct.
- **Q10 - Deployment method.** All deployments use plain CloudFormation templates, the
  existing parameter names, and OAC. An operator converts an existing stack with the method
  of Q21.
- **Q11 - Scope of the deployment rewrite.** The templates replace all of the CDK code of
  `s3-deploy`, because the CDK code no longer works reliably. D1 moved this work to Release 2.
- **Q12 - Transcoder.** dcmjs-commands does the transcode. dcmjs-commands gets a library API
  for the transcode where necessary.
- **Q13 - BulkDataURI key form.** The proxy writes keys with the `fileToKey` rules. The
  metadata rewrite emits BulkDataURI values without `.mht.gz` (`PRX-IMP-10`, `PRX-IMP-11`).
- **Q14 - Packaging.** The deployment has two functions: a zip function for metadata, frames,
  and multipart transforms, and a container image for thumbnails and compression
  (`PRX-IMP-4`).
- **Q15 - First request for a frame that the rule compresses.** The proxy fetches the
  original, compresses it, stores it, and answers from memory in the form of the Accept
  header. The proxy tees a frame only when the rule leaves the frame unchanged (`PRX-IMP-15`).
- **Q16 - Transfer syntax in the stored metadata.** A client uses the transfer syntax of the
  response, not `AvailableTransferSyntaxUID`. On an encode failure, the proxy stores the
  original frame with its own transfer syntax, and logs the failure. Q30 and Q32 changed the
  inputs of the rule: the rule also reads the transfer syntax of the frame response
  (`PRX-IMP-16`, `PRX-USR-15`).
- **Q17 - Compression rule details.** The rule uses first-match order, with the specific rows
  first:
  WSI JPEG to JPEG XL JPEG Recompression (`1.2.840.10008.1.2.4.111`);
  segmentation to Deflated Image Frame Compression (`1.2.840.10008.1.2.8.1`);
  colour to `.111` from JPEG input, to JPEG XL lossless (`.110`) from lossless input, and to
  JPEG XL (`.112`) from other lossy input;
  already compressed data stays unchanged;
  uncompressed grayscale to JPEG-LS lossless (`1.2.840.10008.1.2.4.80`).
  The `.112` row adds one more generation of loss, and the design accepts that loss. The
  table is a default in code, and the deployment configuration can replace it.
- **Q18 - Collection storage.** A query parameter selects an IDC collection. The deployment
  stores the study list of a collection at `collections/<id>/studies[/<offset>]`, in pages of
  1000 studies. The collection list is also the allowlist for population.
- **Q19 - Queries that the stored indexes do not answer.** For an exact-UID query with no
  stored index, the proxy does the upstream QIDO query, writes the index file, and returns it.
  Other queries go to the upstream with a short TTL (for example 60 s) and the query string in
  the cache key. The proxy does not store them in S3.
- **Q20 - Permitted variants.** The deployment stores the rule transfer syntax as multipart
  (default), and the single-part raw codestream of the same transfer syntax on request. The
  proxy computes the original upstream transfer syntax, and does not store it. Lossy variants
  of lossless data are not permitted, unless the configuration adds them. Without the Lambda
  function, the CloudFront Function maps only to stored variants, and maps other requests to
  the default form. The deployment configuration holds the list.
- **Q21 - Conversion of an existing CDK stack.** The conversion uses a resource import: retain
  the resources, delete the old stack, import the resources into the new stack, and switch to
  OAC. `--dry-run` prints each step (`PRX-IMP-20`).
- **Q22 - Configuration and package layout.** The deploy script reads `static-wado.json5` with
  the existing key names. `s3-deploy` keeps `S3Ops` and drops the CDK packages. The proxy is a
  new package, and the `S3Ops` key rules move to a shared module (`PRX-IMP-21`).
- **Q23 - Resources to carry over.** The templates keep all resources of the CDK stacks except
  DocumentDB. The conversion deletes the DocumentDB cluster (`PRX-IMP-19`).
- **Q24 - Changes to dcmjs-commands.** dcmjs-commands gets three changes: a subpath export
  (for example `@dcmjs/commands/pixel`) of the per-frame codec API, the header helpers, and
  the transfer syntax table; JPEG-LS lossless (`.80`) and HTJ2K lossless (`.201`) in the
  target table, with tests; and the compression rule as a pure function
  `selectTargetSyntax(metadata, rules)` with a default table. D2 removed the
  `dcmjs transcode --to auto` option.
- **Q25 - Writer and metadata rewrite.** The proxy uses small functions of this repository:
  the BulkDataURI rewrite (the `SeriesSummary.updateLocation` logic), the multipart wrap
  (`MultipartStreamWriter`), and the `S3Ops` key rules. The proxy uses dcmjs-commands only for
  the codec and the rule. An alignment of the two Static-DICOMweb writers is a separate task.
- **Q26 - Upstream client.** dcmjs-commands gets a small `fetch`-based client, with
  configurable headers, streaming bodies, and a per-request `transfer-syntax` parameter. The
  proxy, the collection build command, `dicomwebjs download`, and the bulk transfer use the
  client. dicomweb-client should also change to `fetch`, because browsers and Node.js both
  have `fetch`
  ([dcmjs-org/dicomweb-client#141](https://github.com/dcmjs-org/dicomweb-client/issues/141)).
- **Q27 - Video.** The proxy detects video by SOP class and by video transfer syntax. The
  proxy keeps the upstream video data unchanged, for a video stream and for decoded frames:
  no re-encode. The Lambda functions have no `ffmpeg`, and the deployment makes no thumbnail
  for video now. A stored video is one object, and the per-frame rule does not apply.
- **Q28 - Collection query.** A CLI command builds the collection pages offline: it reads
  `idc-index`, queries the upstream by StudyInstanceUID, and writes the pages. The CloudFront
  Function maps the collection query to the stored keys, and a miss returns 404. The
  parameter name comes from configuration (`PRX-IMP-17`).
- **Q29 - Default upstream.** The IDC public proxy is the default, and the Google Healthcare
  store is an option. The 15 GB daily quota is small for a population cache, but a typical
  miss fetches only the metadata and one image frame for a thumbnail. Clients can fetch the
  other images directly from the upstream. Bulk transfers use a personal access token and an
  S3 upload.
- **Q30 - Missing incoming transfer syntax.** The rule assumes Explicit VR Little Endian for
  images and JPEG baseline (`.50`) for WSI studies. The metadata rewrite does not write
  `AvailableTransferSyntaxUID` when the upstream does not give it. The proxy does not fetch an
  extra frame.
- **Q31 - BulkDataURI and direct frame access.** The metadata rewrite always makes BulkDataURI
  values relative, so that they resolve through CloudFront. A client that fetches frames from
  the upstream sets its frame root in its own configuration. The proxy also serves frames.
- **Q32 - What the proxy asks the upstream for.** The proxy asks for no fixed transfer syntax
  for images. The rule decides per frame from the transfer syntax of the response. Frame
  requests prefer `multipart/related; type="image/*"`, then
  `multipart/related; type="application/octet-stream"`, with no `transfer-syntax=*`. Part 10
  requests use `multipart/related; type="application/dicom"; transfer-syntax=*`. The
  assumptions of Q30 apply only when no response gives a transfer syntax (`PRX-IMP-24`).
- **Q33 - Upstream errors and the quota.** The proxy passes the upstream status to the client,
  and stores nothing on an error. CloudFront keeps a 404 for 5 minutes, and a 429 or 5xx for
  10 seconds. The proxy passes the `Retry-After` header through, and logs each 429 with the
  request key. S3 holds no negative marker, and the proxy has no global stop flag
  (`PRX-IMP-25`).
- **Q34 - Change of upstream data.** Stored data is final, and the deployment does no
  invalidation. The IDC collections do not change per study now, so the deployment needs no
  `refresh` command now. An operator can delete a study prefix in S3 by hand (`PRX-IMP-26`).
- **Q35 - Granularity of stored metadata.** One upstream series metadata response writes the
  series metadata and every instance metadata file. The writes run in parallel, with a limit
  (`PRX-IMP-27`).
- **D1 - Releases.** Release 1 is the proxy only, and deploys the proxy onto an existing
  deployment. The replacement of the CDK moves to Release 2.
- **D2 - Removed work.** No requirement needs three items, so the design removes them: the
  upstream rate limit setting (this changes `PRX-USR-9`), `dcmjs transcode --to auto`, and the
  fix of the `dicomwebjs dump` defect. The defect is a separate issue.
- **D3 - Cloud interfaces.** Code that touches a cloud service goes through an interface,
  because an Azure deployment can be necessary within 6 months (`PRX-IMP-28`).
- **D4 - dcmjs 1.0 beta.** The change of Static-DICOMweb to the dcmjs 1.0 beta merges before
  the proxy work completes. The proxy uses dcmjs only through `@dcmjs/commands`, so the proxy
  work does not wait for that change.
- **D5 - Frame request (changes Q32).** The stored instance metadata holds the final form of
  the frames in (0008,3002) (D6). The proxy reads that metadata for every frame miss, because
  the transform also needs it (for example the bit depth). The proxy requests the form that
  gives the final form:
  1. JPEG baseline (`.50`) for JPEG XL JPEG Recompression (`.111`).
  2. Explicit VR Little Endian for a final form that the upstream does not send.
  3. The final form itself for a final form that the upstream sends.

  Metadata with no transfer syntax gives the Q30 assumption: JPEG baseline for WSI, else
  Explicit VR Little Endian. After a 406 or 500, the proxy uses the Q32 order. The IDC check
  of 2026-11-05 showed that the Q32 order gives JPEG Lossless for every frame.
- **D6 - Transfer syntax in the stored metadata.** (0002,0010) counts as a transfer syntax
  from the upstream. The proxy never stores group 0002 elements, because DICOMweb metadata
  must not hold them. The proxy writes AvailableTransferSyntaxUID (0008,3002): the destination
  transfer syntax when the proxy will recompress the frames, else the stored transfer syntax.
- **D7 - Key of proxied bulkdata.** Proxied non-pixel bulkdata uses the instance key
  `instances/<sop>/bulkdata/<tagpath>`, from the upstream tag path, and no content hash.
- **D8 - Exact-UID instance query.** The instance level passes through to the upstream, and the
  proxy does not store it. `create-dicomweb` writes no index file for one instance.

