const dicomCodec = require("@cornerstonejs/dicom-codec");
const staticCS = require("@radicalimaging/static-cs-lite");
const StaticWado = require("@radicalimaging/static-wado-creator");
const { Stats, handleHomeRelative, asyncIterableToBuffer } = require("@radicalimaging/static-wado-util");
const CsvReadableStream = require("csv-reader");
const dicomParser = require("dicom-parser");
const fs = require("fs");
const { renderTemplate } = require("./render/template");
const assertTruthy = require("./utils/assertTruthy");
const canvasImageToBuffer = require("./utils/canvasImageToBuffer");
const FileWriter = require("./writer/FileWriter");

function parsePoints(arr, dim = 2) {
  return arr.reduce((acc, value, index) => {
    const pIdx = index % dim;
    if (!acc[pIdx]) {
      acc[pIdx] = [];
    }
    acc[pIdx].push(Number(value));
    return acc;
  }, []);
}

const renderData = (template, dataObj, enabledElement) => {
  const { image } = enabledElement;
  const positionProperties = {
    bl: {
      propX: undefined,
      multX: 1,
      propY: "height",
      multY: -1,
    },
    tl: {
      propX: undefined,
      multX: 1,
      propY: "height",
      multY: 1,
    },
  };

  function adaptData(data, posX = 0, posY = 0) {
    if (data.position) {
      data.position = [(data.position[0] || 0) + posX, (data.position[1] || 0) + posY];
    }
  }

  const positionMap = new Map();
  template.forEach(({ name, reference, referenceDirection = "bl", x, y }) => {
    const referenceOp = positionProperties[referenceDirection] || {};
    const { multX = 1, multY = 1, propX, propY } = referenceOp;
    const data = dataObj[name];

    if (!data) {
      return;
    }

    let posX;
    let posY;

    switch (reference) {
      case "image":
        posX = (image[propX] || 0) + multX * x;
        posY = (image[propY] || 0) + multY * y;
        adaptData(data, posX, posY);
        break;
      default:
        if (reference) {
          const referencedObj = positionMap.get(reference);
          if (referencedObj) {
            posX = (referencedObj.x || 0) + multX * x;
            posY = (referencedObj.y || 0) + multY * y;
            adaptData(data, posX, posY);
          }
        }
    }

    const renderResult = staticCS.renderToCanvas(enabledElement, data);

    if (renderResult) {
      positionMap.set(name, {
        x: data.position[0],
        y: data.position[1],
        width: renderResult.width,
        height: renderResult.height,
      });
    }
  });
};

class TestdataCreator {
  constructor(configuration) {
    const { rootDir = "./output", verbose } = configuration;

    dicomCodec.setConfig({ verbose });
    const directoryName = handleHomeRelative(rootDir);

    this.options = {
      ...configuration,
      directoryName,
    };
    this.callback = {
      writeFile: FileWriter(this.options),
    };
  }

  async importBinaryDicom(dicomp10stream, params) {
    // Read dicomp10 stream into buffer
    const buffer = await asyncIterableToBuffer(dicomp10stream);

    // Parse it
    const dataSet = dicomParser.parseDicom(buffer, params);

    const studyInstanceUid = dataSet.string("x0020000d");

    if (!studyInstanceUid) {
      console.log("No study UID, can't import file", params.file, dataSet.elements);

      return undefined;
    }

    // Extract uids
    const id = {
      studyInstanceUid,
      seriesInstanceUid: dataSet.string("x0020000e"),
      sopInstanceUid: dataSet.string("x00080018"),
      transferSyntaxUid: dataSet.string("x00020010"),
      file: params.file,
    };

    return { id, dataSet, buffer };
  }

  readFile(fileName, callback) {
    const inputStream = fs.createReadStream(fileName, "utf8");

    inputStream
      .pipe(new CsvReadableStream({ delimiter: ";", trim: true }))
      .on("data", this.processCSVRow.bind(this))
      .on("end", () => {
        console.log("No more rows!");
        callback();
      });
  }

  async readDicomContent(dicomFile, params) {
    const dicomp10stream = fs.createReadStream(dicomFile);
    const result = await this.importBinaryDicom(dicomp10stream, {
      ...params,
      file: dicomFile,
    });

    return result;
  }

  async processCSVRow(row) {
    const getCSVRowContent = (row) => {
      const [dicomFile, id, description = "", strPoints, zoomLength, calibrationLength] = row;

      if (!assertTruthy([dicomFile, id, description, strPoints, zoomLength, calibrationLength])) {
        console.log("Missing params for:", id);
        return;
      }

      const pointsList = strPoints.split(",");
      const points = parsePoints(pointsList, pointsList.length / 2);

      return {
        dicomFile,
        id,
        description,
        points,
        zoomLength,
        calibrationLength,
      };
    };

    const content = getCSVRowContent(row);

    if (!content) {
      return;
    }

    const { dicomFile } = content;
    const dicomContent = await this.readDicomContent(dicomFile, this.options);

    this.createMeasurementsTestdata(content, dicomContent);
  }

  async createMeasurementsTestdata(content, dicomContent) {
    const { dataSet, id } = dicomContent;
    const { zoomLength, calibrationLength, id: testId, description: testDescription, points: testPoints } = content;

    if (!assertTruthy([dataSet, id])) {
      console.log("Missing dataSet for:", testId, dataSet, id);
      return;
    }

    const doneCallback = (_, enabledElement) => {
      const { columnPixelSpacing } = enabledElement.image;
      // print content
      const idText = {
        position: [],
        text: testId,
        type: "text",
      };
      const testDescriptionText = {
        name: "description",
        position: [],
        text: testDescription,
        type: "text",
      };

      const zoomLinePixels = zoomLength / columnPixelSpacing;
      const zoom = {
        name: "zoom",
        position: [],
        width: zoomLinePixels,
        height: 2,
        type: "hLine",
      };
      const calibrationLinePixels = calibrationLength / columnPixelSpacing;
      const calibration = {
        name: "calibration",
        position: [],
        width: calibrationLinePixels,
        height: 2,
        type: "hLine",
      };

      const points = {
        name: "points",
        points: testPoints,
        type: "points",
        strategy: "cross",
      };

      const dataObj = {
        calibrationLength: calibration,
        zoomLength: zoom,
        description: testDescriptionText,
        id: idText,
        points,
      };

      renderData(renderTemplate, dataObj, enabledElement);

      const _buffer = canvasImageToBuffer(enabledElement.canvas);

      this.callback.writeFile(`data-${testId}.jpg`, _buffer);
    };

    const framesToUse = [];
    const generator = {
      bulkdata: async (bulkData, options) => undefined,
      imageFrame: async (originalImageFrame) => {
        if (framesToUse.length) {
          return;
        }

        // considering only one
        framesToUse.push(originalImageFrame);
      },
      videoWriter: async (_dataSet) => undefined,
    };

    const result = await StaticWado.getDataSet(dataSet, generator, this.options);

    StaticWado.internalGenerateImage(framesToUse[0], dataSet, result.metadata, id.transferSyntaxUid, doneCallback);
  }

  async executeCommand([input]) {
    this.readFile(input, async () => {
      await this.close();
    });
  }

  async close() {
    Stats.OverallStats.summarize("Completed Processing");
  }
}

module.exports = TestdataCreator;
