const {
  Tags,
  readBulkData,
  handleHomeRelative,
  readBulkDataValue,
} = require("@radicalimaging/static-wado-util");
const dcmjs = require("dcmjs");

const StaticWado = require("./StaticWado");
const adaptProgramOpts = require("./util/adaptProgramOpts");
const WriteStream = require("./writer/WriteStream");

const UncompressedLEIExplicit = "1.2.840.10008.1.2.1";
const { DicomDict, DicomMetaDictionary } = dcmjs.data;

const fileMetaInformationVersionArray = new Uint8Array(2);
fileMetaInformationVersionArray[1] = 1;

const readBinaryData = async (dir, instance, options = { frame: true }) => {
  for (const tag of Object.keys(instance)) {
    const v = instance[tag];
    if (v.BulkDataURI) {
      await readBulkDataValue(dir, instance, v, options);
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
    if (v.vr === "SQ" && v.Values?.length) {
      await Promise.all(v.Values.map(readBinaryData));
      continue;
    }
  }
};

module.exports = async function createThumbnail(options, program) {
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
  console.noQuiet("Creating thumbnail for", studyInstanceUid, dir);
  const study = await importer.callback.scanStudy(studyInstanceUid);
  const outputPath = `./studies/${studyInstanceUid}`;
  const { sopInstanceUid, seriesInstanceUid, seriesThumbnail, studyThumbnail } =
    options;
  const sops = sopInstanceUid ? new Set() : null;
  if (sopInstanceUid) {
    for (const sop of sopInstanceUid.split(",").map((s) => s.trim())) {
      sops.add(sop);
    }
  }
  const promises = [];

  const writeThumbnail = async (id, buffer) => {
    console.verbose("Write thumbnail", id, buffer);
    await importer.callback.thumbWriter(
      id.sopInstanceRootPath,
      "thumbnail",
      buffer
    );
    if (seriesThumbnail) {
      await importer.callback.thumbWriter(
        id.seriesRootPath,
        "thumbnail",
        buffer
      );
    }
    if (studyThumbnail) {
      await importer.callback.thumbWriter(id.studyPath, "thumbnail", buffer);
    }
  };

  // TODO - choose middle frame of multiframe and choose middle image of
  // series for series thumbnail, and first series for study thumbnail
  const codecOptions = { frame: 1 };

  for (const sop of study.getSopUids()) {
    if (sops && !sops.has(sop)) {
      continue;
    }
    const instance = await study.recombine(sop);

    if (
      seriesInstanceUid &&
      Tags.getValue(instance, Tags.SeriesInstanceUID) !== seriesInstanceUid
    ) {
      continue;
    }

    await readBinaryData(dir, instance, codecOptions);

    const availableTransferSyntaxUID = Tags.getValue(
      instance,
      Tags.AvailableTransferSyntaxUID
    );
    const pixelData = Tags.getValue(instance, Tags.PixelData);
    if (!pixelData) {
      console.warn("No pixel data found in instance");
      continue;
    }
    const transferSyntaxUid =
      instance[Tags.PixelData].transferSyntaxUid || availableTransferSyntaxUID;
    const frame = Array.isArray(pixelData.Value)
      ? pixelData.Value[0]
      : pixelData;
    console.verbose("Use transfer syntax uid:", transferSyntaxUid);
    const id = importer.callback.uids({
      studyInstanceUid,
      seriesInstanceUid: Tags.getValue(instance, Tags.SeriesInstanceUID),
      sopInstanceUid: sop,
      transferSyntaxUid,
    });

    const promise = importer.callback.internalGenerateImage(
      frame,
      null,
      instance,
      id.transferSyntaxUid,
      writeThumbnail.bind(null, id)
    );
    promises.push(promise);
    if (seriesThumbnail) {
      break;
    }
  }
  await Promise.all(promises);
};