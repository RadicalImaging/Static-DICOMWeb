function validateMetadata(options) {
  // console.log("validateMetadata options", options)
  return function (id, result, buffer) {
    console.verbose("Validating metadata", id, result, buffer)
    if (id.studyInstanceUid.length > 64) {
      throw new Error(`StudyInstanceUID too long: ${id.studyInstanceUid}`)
    }
    if (id.seriesInstanceUid.length > 64) {
      throw new Error(`SeriesInstanceUID too long: ${id.studyInstanceUid}`)
    }
    // TODO - add check here
  }
}

module.exports = validateMetadata
