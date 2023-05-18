const dataExtractor = /^(.*studies)?[\\/]?([0-9.a-zA-Z]+)[\\/](series[\\/])?([0-9.a-zA-Z]+)([\\/]instances[\\/]([0-9.a-zA-Z]*))?$/;

module.exports = () =>
  async function rejectInstanceWithOptions(args) {
    let studyInstanceUid = args[0];
    let seriesInstanceUid;
    let sopInstanceUid;
    const reason = args[2] || "REJECT";
    const extracted = args[0].match(dataExtractor);
    if (extracted) {
      studyInstanceUid = extracted[2];
      seriesInstanceUid = extracted[4];
      sopInstanceUid = extracted[6];
      console.log("Extracted", studyInstanceUid, seriesInstanceUid, sopInstanceUid, reason);
    } else {
      console.log("Not extracting from URL", studyInstanceUid, seriesInstanceUid, reason);
      seriesInstanceUid = args[1];
    }
    const studyData = await this.scanStudy(studyInstanceUid);
    console.verbose("Trying to reject", seriesInstanceUid, "because", reason);
    await studyData.reject(seriesInstanceUid, sopInstanceUid, reason);
    await studyData.writeDeduplicatedGroup();
    return studyData.writeMetadata();
  };
