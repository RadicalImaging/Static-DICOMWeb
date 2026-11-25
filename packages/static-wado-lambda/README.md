# @radicalimaging/static-wado-lambda

The DICOMweb read-through proxy between CloudFront and S3: the platform-neutral core. See the
[specification](../../docs/specs/lambda-proxy.md) and the
[implementation requirements](../../docs/implementation/lambda-proxy.md).

The proxy runs only when the storage has no object for a request (CloudFront origin group
failover). It gets the resource from the upstream DICOMweb service, stores it, and returns it.

The upstream can be any DICOMweb service that meets the requirements below. The default is the
IDC public proxy. The proxy is a read-through cache for fast access to the studies that clients
open. It is not a tool to export a whole archive: for a bulk copy, upload the data to the bucket
with the Static DICOMweb upload tools.

## Layout

| File | Purpose |
|---|---|
| `lib/router.mjs` | `route(path, query)`: the path relative to the DICOMweb root to `{ kind, studyUID, seriesUID, sopUID, frames, variant, tagPath, collection, offset, query }` |
| `lib/handle.mjs` | `handle(Request, context) -> Response`: route, allowlist, handler table, error mapping (`PRX-IMP-25`) |
| `lib/handlers/index.mjs` | The handler table, route kind to handler |
| `lib/context.mjs` | `loadConfig()` and `createContext({ config, store })` |
| `lib/upstream.mjs` | The upstream client (`@dcmjs-org/commands/dicomweb-fetch`), token, and allowlist |
| `lib/stores/s3.mjs`, `lib/stores/directory.mjs` | Object store: `get`, `put`, `exists` |
| `lib/stores/putFile.mjs` | Writes a file of the local layout with the storage-format key, type, and encoding |
| `lib/secrets/awsSecretsManager.mjs`, `lib/secrets/env.mjs` | Secret source: `getToken()` |
| `lib/entries/awsFunctionUrl.mjs` | Lambda function URL entry, with response streaming |
| `lib/edge/mapRequest.mjs` | The edge mapping of a request to the storage key (`PRX-IMP-2`) |
| `lib/edge/cloudfrontFunction.mjs` | `buildCloudFrontFunction(options)`: the CloudFront Function code of the edge mapping |
| `lib/localServer.mjs`, `bin/local.mjs` | A local server: the edge mapping, the directory store, then `handle` |

## Handlers

A handler is `async (route, request, context) => Response`. Add it to the table in
`lib/handlers/index.mjs` under its route kind. A kind with no handler returns 404. `handle`
checks the allowlist for `route.studyUID` before the handler runs. A handler throws the
`DicomWebFetchError` of the upstream unchanged.

`context` holds:

- `config`: the configuration below.
- `store`: the object store. Keys are relative to the DICOMweb root.
- `upstream`: a `DicomWebFetch` (`search`, `retrieveMetadata`, `retrieveFrames`,
  `retrieveInstance`, `retrieveBulkData`), and `isAllowed(studyUID)`.
- `secrets`: the secret source, or undefined.
- `compute`: `encode({ frame, imageInfo, sourceUid, targetUid })`. The default is the
  in-process implementation (`lib/compute/inProcess.mjs`).

The handlers store the files that `create-dicomweb` writes, gzipped, through `putFile`:

| Route kind | Request | Stored file |
|---|---|---|
| `seriesMetadata` | `studies/<s>/series/<x>/metadata` | `studies/<s>/series/<x>/metadata.gz`, and `instances/<sop>/metadata.gz` of each instance |
| `instanceMetadata` | `.../instances/<sop>/metadata` | `studies/<s>/series/<x>/instances/<sop>/metadata.gz` |
| `studyQuery` | `studies/<s>`, `studies?StudyInstanceUID=<s>` | `studies/<s>/index.json.gz` |
| `seriesQuery` | `studies/<s>/series/<x>`, `[studies/<s>/]series?SeriesInstanceUID=<x>` | `studies/<s>/series/<x>/series-singleton.json.gz` |
| `frames` | `.../instances/<sop>/frames/<n>` | `.../frames/<n>`: multipart, in the syntax of the compression rule |
| `frames` | `.../frames/<n>.<extension>` (a permitted variant) | `.../frames/<n>.<extension>`: single-part, only for the stored syntax |
| `bulkdata` | `.../instances/<sop>/bulkdata/<tagpath>` | the same key, multipart |
| `part10` | `.../instances/<sop>` | `.../instances/<sop>/index.mht.gz` |
| `thumbnail` | `studies/<s>[/series/<x>[/instances/<sop>]]/thumbnail` | the same key, `image/jpeg`. A study uses the first series, by SeriesNumber, that gives a thumbnail; it skips `NON_IMAGE_MODALITIES` (SEG, SR, DOC, PR, RTSTRUCT, RTPLAN, KO). No thumbnail for video |

A frame miss asks the upstream for a form of the final syntax in (0008,3002) of the stored
metadata: JPEG baseline for `.111`, the syntax itself when the upstream sends it
(`upstreamSyntaxes`), else Explicit VR Little Endian. Metadata with no (0008,3002) asks for JPEG
baseline for WSI, else Explicit VR Little Endian. After a 406 or 500 it asks with the default
`Accept`. The rule (`selectTargetSyntax` of
`@dcmjs-org/commands/pixel`) then reads the syntax of the response. The metadata handlers write the
destination syntax of the rule to (0008,3002) when the rule recompresses.

The metadata handlers rewrite the BulkDataURI values to the relative storage form. Other
queries, and every instance query, pass through with `Cache-Control: max-age=60` and are not
stored. When `allow` is set, these pass-through queries get 403, because their answer can name
studies outside the allowlist.

## Configuration

One JSON object in the environment variable `STATIC_WADO_PROXY_CONFIG`:

| Key | Default | Meaning |
|---|---|---|
| `root` | `/dicomweb` | The path of the DICOMweb root, and the S3 key prefix |
| `upstream` | the IDC public proxy | The upstream DICOMweb root |
| `auth` | none | `{ "source": "env", "variable": "<NAME>" }` or `{ "source": "secretsManager", "secretId": "<name or ARN>" }`. The upstream gets `Authorization: Bearer <token>` |
| `allow` | none (all studies) | `{ "studies": [<uid>], "collections": [<id>] }`. A collection permits the studies of its stored pages `collections/<id>/studies[/<offset>]`. With `allow`, a request for another study, and a query that no stored index answers, get 403 |
| `bucket` | | The S3 bucket (Lambda entry only) |
| `variants` | none | The permitted single-part frame extensions, for example `["jls"]` |
| `collectionParameter` | none | The query key of a collection query, `studies?<key>=<id>` (edge mapping) |
| `upstreamSyntaxes` | the IDC list | The frame syntaxes that the upstream sends, `{ "<uid>": "<media type>" }` |
| `rules` | `DEFAULT_RULES` | The compression rule table, in the shape of `DEFAULT_RULES` of `@dcmjs-org/commands/pixel` |

## Local server

```sh
STATIC_WADO_PROXY_CONFIG='{"allow":{"studies":["1.2.3"]}}' pnpm start -- --dir ./proxy-store --port 5050
```

The server answers `http://localhost:5050/dicomweb/...`. A GET with no query string that the
store holds comes from the store. Other requests go to `handle`.

## Deploy to AWS

`deploy/proxy-site.yaml` creates a new S3 bucket and a CloudFront distribution. The bucket is
the primary origin, and the proxy function URL is the failover origin on 403 and 404. The
template also creates the function (`nodejs24.x`, response streaming), the OACs, the edge
function, and a cache policy with the query string in the cache key. Use a region that has
Lambda function URLs (`ca-west-1` does not).

```sh
pnpm build:lambda   # dist/lambda (bundle + codecs) and dist/proxy-site.yaml (edge code inlined)
aws cloudformation package --region <region> --template-file dist/proxy-site.yaml \
  --s3-bucket <artifact bucket in that region> --output-template-file dist/proxy-site.packaged.yaml
aws cloudformation deploy --region <region> --template-file dist/proxy-site.packaged.yaml \
  --stack-name <name> --capabilities CAPABILITY_IAM \
  [--parameter-overrides AllowStudies=<uid>,<uid>]
```

The output `DicomWebRoot` is the DICOMweb root for a client. The bucket has
`DeletionPolicy: Retain`, so a stack delete keeps the stored data.

Thumbnails come from the upstream `frames/<n>/rendered?viewport=256,256`, which the IDC public
proxy supports.

## Upstream requirements, storage, and auditing

### What the upstream must support

| Use | Upstream request | Needed for |
|---|---|---|
| Metadata | WADO-RS `studies/<s>/series/<x>[/instances/<sop>]/metadata` | every resource; the frame and thumbnail handlers read the stored metadata |
| Queries | QIDO-RS `studies`, `series`, `instances`, with `StudyInstanceUID` and `SeriesInstanceUID` | exact-UID indexes, pass-through queries, study thumbnails |
| Frames | WADO-RS `frames/<n>` with `multipart/related; type=...; transfer-syntax=...`, and a fallback with the default `Accept` after a 406 or 500 | frames, and the source of the compression rule. List the syntaxes that the upstream sends in `upstreamSyntaxes` |
| Bulkdata | the BulkDataURI values of the upstream metadata | non-pixel bulkdata |
| Part 10 | WADO-RS instance with `transfer-syntax=*` | Part 10 retrieve |
| Rendered | `frames/<n>/rendered?viewport=256,256` with `Accept: image/jpeg` | thumbnails. An upstream with no rendered resource gives no thumbnails |
| Auth | none, or `Authorization: Bearer <token>` | `auth` in the configuration. A 401 reads the token again and repeats the request one time |

The proxy sends the bearer token only to the origin of the `upstream` URL. An absolute
BulkDataURI on another host gets no token.

### What the operator must check

- **Terms of the upstream.** The proxy stores what clients request, permanently. Check that the
  terms of the upstream permit a cache. The IDC public proxy permits a cache, and refuses
  requests after its daily quota (about 15 GB). The proxy passes a 429 or 5xx to the client with
  `max-age=10` and stores nothing.
- **Data in the bucket.** Stored data is final: there is no expiry and no invalidation. Delete a
  study prefix (`dicomweb/studies/<uid>/`) by hand to get a fresh copy. The bucket has the S3
  default encryption (SSE-S3) and `DeletionPolicy: Retain`. For identifiable data, add the
  encryption, retention, and bucket policies that your rules require.
- **Who can read.** The distribution has no viewer authentication. Any client with the URL can
  read the stored data, and can cause the proxy to fetch and store a study. Set `AllowStudies`
  (or `allow`) to limit the studies that the proxy fetches. For data that is not public, put
  viewer authentication in front of the distribution (for example a CloudFront signed URL or
  signed cookie, or an authorizing edge function).
- **Auditing.** The template keeps the Lambda logs for 30 days (`/aws/lambda/<function>`). The
  logs hold each upstream 429 with the request key, each encode failure, and each proxy failure.
  The template enables no access log. For an audit trail of who read what, enable the CloudFront
  standard logs, the S3 server access logs or CloudTrail data events on the bucket, and set
  their retention.
