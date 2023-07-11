# `@radicalimaging/testdata-creator`

Package to create several different testdata at server side. It uses static-cs-lite to generate the image and operations are done on top of it.

## Pre-requisites
View root pre-requisites section [pre-requisites](../../README.md#pre-requisites)

## Development
View root development section [development](../../README.md#development)

## Usage
// TODO
```
const dataCreator = require('@radicalimaging/testdata-creator');

...
const doneCallback = (imageBuffer) => {
  // write on disk imageBuffer (thumbnail)
}
// simulate image rendering on server side
dataCreator.simulateRendering(transferSyntaxUid,
  decodedPixelData,
  rawDataset,
  doneCallback)
```
