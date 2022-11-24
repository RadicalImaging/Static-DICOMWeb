import fs from "fs";
import { asyncIterableToBuffer } from "@radicalimaging/static-wado-util";
import dicomParser from "dicom-parser";

const RawSopInstanceUID = "x00080018";

export default async function extractSop(file) {
  try {
    const dicomp10stream = fs.createReadStream(file);
    // Read dicomp10 stream into buffer
    const buffer = await asyncIterableToBuffer(dicomp10stream);
    // Parse it
    const options = { TransferSyntaxUID: "1.2.840.10008.1.2" };
    const dataSet = dicomParser.parseDicom(buffer, options);
    const sop = dataSet.string(RawSopInstanceUID);
    return sop;
  } catch (e) {
    console.log("File", file, "isn't DICOM", e);
    return;
  }
}