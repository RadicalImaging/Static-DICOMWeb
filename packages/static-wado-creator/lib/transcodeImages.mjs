import {
  Tags,
  readBulkData,
  handleHomeRelative,
  readBulkDataValue,
  readAllBulkData,
} from "@radicalimaging/static-wado-util";
import dcmjs from "dcmjs";

import StaticWado from "./StaticWado";
import { transcodeImageFrame } from "./operation/adapter/transcodeImage";
import adaptProgramOpts from "./util/adaptProgramOpts";
import WriteStream from "./writer/WriteStream";

const UncompressedLEIExplicit = "1.2.840.10008.1.2.1";
const { DicomDict, DicomMetaDictionary } = dcmjs.data;

const fileMetaInformationVersionArray = new Uint8Array(2);
fileMetaInformationVersionArray[1] = 1;

export async function transcodeImages(options, program) {
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
  console.noQuiet("Creating alternate for", studyInstanceUid, dir);
  const study = await importer.callback.scanStudy(studyInstanceUid);
  const outputPath = `./studies/${studyInstanceUid}`;
  const { sopInstanceUid, seriesInstanceUid } =
    options;
  const sops = sopInstanceUid ? new Set() : null;
  if (sopInstanceUid) {
    for (const sop of sopInstanceUid.split(",").map((s) => s.trim())) {
      sops.add(sop);
    }
  }
  const promises = [];

  const writeAlternate = async (id, buffer) => {
    console.verbose("Write alternate", id, buffer);
    await importer.callback.thumbWriter(
      id.sopInstanceRootPath,
      "thumbnail",
      buffer
    );
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

    await readAllBulkData(dir, instance, codecOptions);

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

    const targetId = {
      transferSyntaxUid: "1.2.840.10008.1.2.4.70",
    };
    const transcodedFrame = await transcodeImageFrame(
      id,
      targetId,
      frame,
      instance,
      { ...options, forceTranscode: true }
    );
    console.warn("Got transcoded frame", transcodedFrame);

    // const promise = importer.callback.internalGenerateImage(
    //   frame,
    //   null,
    //   instance,
    //   id.transferSyntaxUid,
    //   writeAlternate.bind(null, id)
    // );
    const promise = null;
    console.warn("TODO - call alternate to generate alternate representation");
    promises.push(promise);
  }
  await Promise.all(promises);
}

export default transcodeImages;