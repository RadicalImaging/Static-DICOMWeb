import {Tags} from "../dictionary/Tags";
import readBulkData from "./readBulkData";

export const readBulkDataValue = async (studyDir, instance, value, options) => {
  const { BulkDataURI } = value;
  value.vr = "OB";
  const seriesUid = Tags.getValue(instance, Tags.SeriesInstanceUID);
  const numberOfFrames = Tags.getValue(instance, Tags.NumberOfFrames) || 1;
  if (BulkDataURI.indexOf("/frames") !== -1) {
    const seriesDir = `${studyDir}/series/${seriesUid}`;
    if (options?.frame === false) {
      return;
    }
    // Really only support a limited number of frames based on memory size
    value.Value = [];
    if (typeof options?.frame === "number") {
      console.noQuiet("Reading frame", options.frame);
      const bulk = await readBulkData(seriesDir, BulkDataURI, options.frame);
      if (!bulk) {
        return;
      }
      value.Value[options.frame - 1] = bulk.binaryData;
      value.transferSyntaxUid = bulk.transferSyntaxUid;
      value.contentType = bulk.contentType;
      return;
    }
    console.noQuiet("Reading frames", 1, "...", numberOfFrames);
    for (let frame = 1; frame <= numberOfFrames; frame++) {
      const bulk = await readBulkData(seriesDir, BulkDataURI, frame);
      if (!bulk) break;
      value.Value.push(bulk.binaryData);
      value.transferSyntaxUid = bulk.transferSyntaxUid;
      value.contentType = bulk.contentType;
    }
  } else {
    const bulk = await readBulkData(studyDir, BulkDataURI);
    value.Value = [new ArrayBuffer(bulk.binaryData)];
    value.contentType = bulk.contentType;
  }
};

export default readBulkDataValue;