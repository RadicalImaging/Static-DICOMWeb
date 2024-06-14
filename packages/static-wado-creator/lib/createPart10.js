/* eslint-disable no-param-reassign */
const { Tags, readBulkData } = require("@radicalimaging/static-wado-util");
const dcmjs = require("dcmjs");

const StaticWado = require("./StaticWado");
const adaptProgramOpts = require("./util/adaptProgramOpts");
const WriteStream = require("./writer/WriteStream");

const UncompressedLEIExplicit = "1.2.840.10008.1.2.1";
const { DicomDict, DicomMetaDictionary } = dcmjs.data;

const fileMetaInformationVersionArray = new Uint8Array(2);
fileMetaInformationVersionArray[1] = 1;

const createFmi = (instance) => {
  // Assume the TSUID is in the value 0
  const TransferSyntaxUID = Tags.getValue(instance, Tags.AvailableTransferSyntaxUID) || UncompressedLEIExplicit;
  const MediaStorageSOPClassUID = Tags.getValue(instance, Tags.MediaStorageSOPClassUID);
  const SOPInstanceUID = Tags.getValue(instance, Tags.SOPInstanceUID);
  const naturalFmi = {
    MediaStorageSOPClassUID,
    MediaStorageSOPInstanceUID: SOPInstanceUID,
    ImplementationVersionName: "mkdicomweb",
    TransferSyntaxUID,
    ImplementationClassUID: "2.25.984723498557234098.001",
    FileMetaInformationVersion: fileMetaInformationVersionArray.buffer,
  };
  const denaturalized = DicomMetaDictionary.denaturalizeDataset(naturalFmi);
  return denaturalized;
};

const readBulkDataValue = async (studyDir, instance, value) => {
  const { BulkDataURI } = value;
  value.vr = "OB";
  const seriesUid = Tags.getValue(instance, Tags.SeriesInstanceUID);
  const numberOfFrames = Tags.getValue(instance, Tags.NumberOfFrames) || 1;
  const dir = `${studyDir}/series/${seriesUid}`;
  if (BulkDataURI.indexOf("/frames") !== -1) {
    // Really only support a limited number of frames based on memory size
    value.Value = [];
    for (let frame = 1; frame <= numberOfFrames; frame++) {
      const bulk = await readBulkData(dir, BulkDataURI, frame);
      if (!bulk) break;
      value.Value.push(bulk);
    }
  } else {
    value.Value = [new ArrayBuffer(await readBulkData(dir, BulkDataURI))];
  }
};

const readBinaryData = async (dir, instance) => {
  for (const tag of Object.keys(instance)) {
    const v = instance[tag];
    if (v.BulkDataURI) {
      await readBulkDataValue(dir, instance, v);
      continue;
    }
    if (!v.vr) {
      const value0 = v.Value?.[0];
      if (typeof value0 === "string") {
        v.vr = "LT";
      } else {
        console.log("Deleting", tag, v.Value, v);
        delete instance[tag];
      }
      continue;
    }
    if (v.vr === "SQ") {
      await Promise.all(v.Values.map(readBinaryData));
      continue;
    }
  }
};

const writeBuffer = (dir, fileName, buffer) => {
  const writeStream = WriteStream(dir, fileName, {
    mkdir: true,
    gzip: false,
  });
  writeStream.write(buffer);
  return writeStream.close();
};

module.exports = async function createMain(options, program) {
  const finalOptions = adaptProgramOpts(options, {
    ...this,
    // Instance metadata is the instances/<sopUID>/metadata.gz files
    isInstance: false,
    // Deduplicated data is single instance deduplicated data
    isDeduplicate: false,
    // Group data is the group file directories
    isGroup: false,
    isStudyData: false,
    isDeleteInstances: false,
  });
  const importer = new StaticWado(finalOptions);
  const studyInstanceUid = program.args[0];
  const dir = `${importer.options.rootDir}/studies/${studyInstanceUid}`;
  console.log("Creating part 10 for", studyInstanceUid, dir);
  const study = await importer.callback.scanStudy(studyInstanceUid);
  const outputPath = `./studies/${studyInstanceUid}`;
  for (const sop of study.getSopUids()) {
    const instance = await study.recombine(sop);
    const fmi = createFmi(instance);

    console.log("Processing sop", sop);
    const dicomDict = new DicomDict(fmi);
    await readBinaryData(dir, instance);
    dicomDict.dict = instance;
    const buffer = Buffer.from(dicomDict.write());
    writeBuffer(outputPath, sop, buffer);
  }
};
