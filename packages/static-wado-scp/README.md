# `@radicalimaging/static-wado-scp`

A DIMSE SCP (`dicomwebscp`) that stores received instances in the Static DICOMweb layout.

| Service | Behaviour |
| ------- | --------- |
| C-ECHO | Answers Success. |
| C-STORE | Imports the received dataset bytes unchanged (no decode and encode in dcmjs-dimse). |
| C-FIND | Study level, through the `studyQuery` plugin (default `studiesQueryByIndex`). |
| C-GET | Sends the matching study, series or instance as C-STORE sub-operations on the same association. |
| C-MOVE | Sends the matching instances to the move destination. The destination AE title must be a key of `aeConfig` (static-wado-util), with `host` and `port`. |

C-GET and C-MOVE rebuild each instance as Part 10 from the stored metadata and bulk data. When the
receiver accepts only another transfer syntax, dcmjs-dimse transcodes the instance.


## Pre-requisites
View root pre-requisites section [pre-requisites](../../README.md#pre-requisites)

## Development
View root development section [development](../../README.md#development)

## Usage

```
const staticWadoScp = require('@radicalimaging/static-wado-scp');

// TODO: DEMONSTRATE API
```
