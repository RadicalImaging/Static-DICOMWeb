# @radicalimaging/static-wado-lambda

The DICOMweb read-through proxy between CloudFront and S3: the platform-neutral core. See the
[specification](../../docs/specs/lambda-proxy.md) and the
[implementation requirements](../../docs/implementation/lambda-proxy.md).

The proxy runs only when the storage has no object for a request (CloudFront origin group
failover). It gets the resource from the upstream DICOMweb service, stores it, and returns it.

## Layout

| File | Purpose |
|---|---|
| `lib/router.mjs` | `route(path, query)`: the path relative to the DICOMweb root to `{ kind, studyUID, seriesUID, sopUID, frames, variant, tagPath, collection, offset, query }` |
| `lib/handle.mjs` | `handle(Request, context) -> Response`: route, allowlist, handler table, error mapping (`PRX-IMP-25`) |
| `lib/handlers/index.mjs` | The handler table, route kind to handler |
| `lib/context.mjs` | `loadConfig()` and `createContext({ config, store })` |
| `lib/upstream.mjs` | The upstream client (`@dcmjs/commands/dicomweb-fetch`), token, and allowlist |
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

A frame miss asks the upstream for a form of the final syntax in (0008,3002) of the stored
metadata: JPEG baseline for `.111`, the syntax itself when the upstream sends it
(`upstreamSyntaxes`), else Explicit VR Little Endian. Metadata with no (0008,3002) asks for JPEG
baseline for WSI, else Explicit VR Little Endian. After a 406 or 500 it asks with the default
`Accept`. The rule (`selectTargetSyntax` of
`@dcmjs/commands/pixel`) then reads the syntax of the response. The metadata handlers write the
destination syntax of the rule to (0008,3002) when the rule recompresses.

The metadata handlers rewrite the BulkDataURI values to the relative storage form. Other
queries, and every instance query, pass through with `Cache-Control: max-age=60` and are not
stored.

## Configuration

One JSON object in the environment variable `STATIC_WADO_PROXY_CONFIG`:

| Key | Default | Meaning |
|---|---|---|
| `root` | `/dicomweb` | The path of the DICOMweb root, and the S3 key prefix |
| `upstream` | the IDC public proxy | The upstream DICOMweb root |
| `auth` | none | `{ "source": "env", "variable": "<NAME>" }` or `{ "source": "secretsManager", "secretId": "<name or ARN>" }`. The upstream gets `Authorization: Bearer <token>` |
| `allow` | none (all studies) | `{ "studies": [<uid>], "collections": [<id>] }`. A collection permits the studies of its stored pages `collections/<id>/studies[/<offset>]` |
| `bucket` | | The S3 bucket (Lambda entry only) |
| `variants` | none | The permitted single-part frame extensions, for example `["jls"]` |
| `collectionParameter` | none | The query key of a collection query, `studies?<key>=<id>` (edge mapping) |
| `upstreamSyntaxes` | the IDC list | The frame syntaxes that the upstream sends, `{ "<uid>": "<media type>" }` |
| `rules` | `DEFAULT_RULES` | The compression rule table, in the shape of `DEFAULT_RULES` of `@dcmjs/commands/pixel` |

## Local server

```sh
STATIC_WADO_PROXY_CONFIG='{"allow":{"studies":["1.2.3"]}}' pnpm start -- --dir ./proxy-store --port 5050
```

The server answers `http://localhost:5050/dicomweb/...`. A GET with no query string that the
store holds comes from the store. Other requests go to `handle`.

## Temporary dependency

`@dcmjs/commands` is a `link:` to a local checkout of dcmjs-commands
(`../../../dcmjs-commands`) that holds the branches `feat/pixel-export-select-target` and
`feat/dicomweb-fetch-client`. Change it to the published version when `@dcmjs/commands`
publishes `pixel` and `dicomweb-fetch`.
