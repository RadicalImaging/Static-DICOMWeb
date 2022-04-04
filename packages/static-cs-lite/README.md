# `@ohif/static-cs-lite`

Lite and simplified version of cornerstone package which allows simulating server rendering.
It uses JSDOM to support cornerstone to use server rendering approach.
The sandbox configuration MUST be revisited for each new cornerstone integration.

## Pre-requisites
View root pre-requisites section [pre-requisites](../../README.md#pre-requisites)

## Development
View root development section [development](../../README.md#development)

## Usage

```
const staticCsLite = require('@ohif/static-cs-lite');

...
const doneCallback = (imageBuffer) => {
  // write on disk imageBuffer (thumbnail)
}
// simulate image rendering on server side
staticCsLite.simulateRendering(transferSyntaxUid,
  decodedPixelData,
  rawDataset,
  doneCallback)
```
