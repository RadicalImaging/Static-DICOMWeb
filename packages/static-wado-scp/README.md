# `@radicalimaging/static-wado-scp`

A DIMSE SCP (`dicomwebscp`) that stores received instances in the Static DICOMweb layout.

| Service | Behaviour                                                                                       |
| ------- | ----------------------------------------------------------------------------------------------- |
| C-ECHO  | Answers Success.                                                                                |
| C-STORE | Imports the received dataset bytes unchanged (no decode and encode in dcmjs-dimse).             |
| C-FIND  | Study level, through the `studyQuery` plugin (default `studiesQueryByIndex`).                   |
| C-GET   | Sends the matching study, series or instance as C-STORE sub-operations on the same association. |
| C-MOVE  | Sends the matching instances to the move destination AE.                                        |

C-GET and C-MOVE:

- The identifier must give the unique keys of its QueryRetrieveLevel (STUDY, SERIES or IMAGE) as
  valid UIDs. Otherwise the SCP answers `0xA900`.
- An identifier that matches no instance gives Success with 0 completed sub-operations.
- The SERIES level accepts a list of SeriesInstanceUID values, and the IMAGE level accepts a list
  of SOPInstanceUID values.
- An instance that the SCP cannot rebuild counts as a failed sub-operation. So does an instance
  that has no accepted storage context on a C-GET association. A sub-operation with a warning
  status (`0xBxxx`) counts as a warning.
- The final status is Success when all sub-operations succeed. It is `0xB000` when there are
  failures or warnings and at least one instance is stored, and `0xA702` when all fail.
- An empty element of the stored metadata stays in the Part 10 output with zero length, so an empty
  Type 2 attribute is kept.
- The SCP rebuilds each instance as Part 10 from the stored metadata and bulk data. The rebuild
  leaves out the internal deduplication block (private creator `dedupped`) of the store.
- When the receiver accepts only another transfer syntax, dcmjs-dimse transcodes the instance. A
  conversion from a compressed syntax removes the private data elements (dcmjs-dimse 0.3.4). The SCP
  stores uncompressed data as JPEG-LS by default, so an SCU that accepts only uncompressed data gets
  no private data elements.
- The SCP selects one transfer syntax for each proposed storage context when it accepts the
  association, before the C-GET request arrives. Thus the SCP cannot select the stored syntax. An
  SCU that proposes one context for each syntax gets the stored syntax with no transcode. On a C-GET
  association, the SCP does not accept a video syntax (MPEG-2, MPEG-4) for an image SOP class.
- The SCP writes all instances of a request to temporary files before the first sub-operation, so
  the temporary disk use is the size of the request.

A C-MOVE destination AE title must be a key of `aeConfig`, with `host` and `port`. Give it in
`static-wado.json5`, or for one AE with `-a NAME@host:port`:

```json5
{
  aeConfig: {
    PACS: { host: '10.0.0.5', port: 11112 },
  },
}
```

## Pre-requisites

View root pre-requisites section [pre-requisites](../../README.md#pre-requisites)

## Development

View root development section [development](../../README.md#development)

## Usage

```
const staticWadoScp = require('@radicalimaging/static-wado-scp');

// TODO: DEMONSTRATE API
```
