const dataExtractor = /^(.*studies)?[\\/]?([^/\\]+)[\\/](series[\\/])?([^/\\]+)([\\/]instances[\\/]([^/\\]*))?$/;

module.exports = (options) =>
  async function (rejectPath, reason) {
    console.log("Reject instance", rejectPath, reason);
    const extracted = rejectPath.match(dataExtractor);
    if (!extracted) {
      console.log("Unable to reject", rejectPath, "because it isn't in the format studies/<studyUID>/series/<seriesUID>");
      return;
    }
    const [, , studyInstanceUid, , seriesInstanceUid, , sopInstanceUid] = extracted;
    const studyData = await this.scanStudy("studies", studyInstanceUid);
    if (options.verbose) console.log("Trying to reject", seriesInstanceUid, "because", reason);
    await studyData.reject(seriesInstanceUid, sopInstanceUid, reason);
    await studyData.writeDeduplicatedGroup();
    return studyData.writeMetadata();
  };
