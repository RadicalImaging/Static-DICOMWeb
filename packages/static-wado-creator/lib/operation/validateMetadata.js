const { Tags } = require("@radicalimaging/static-wado-util")

function validateMetadata(options) {
  console.verbose("validateMetadata options", options)
  const serviceUrl = ""

  return function (id, result) {
    const getValue = Tags.getValue.bind(null, result.metadata)
    console.verbose("Validating metadata", id, result)
    if (id.studyInstanceUid.length > 64) {
      throw new Error(`StudyInstanceUID too long: ${id.studyInstanceUid}`)
    }
    if (id.seriesInstanceUid.length > 64) {
      throw new Error(`SeriesInstanceUID too long: ${id.studyInstanceUid}`)
    }
    const RetrieveURL = `${serviceUrl}${id.studyInstanceUid}/series/${id.seriesInstanceUid}/instances/${id.sopInstanceUid}`

    // TODO - add check here from plugin to add remote query checks, eg kheops or similar
    const successMessage = {
      ReferencedSOPSequence: [
        {
          ReferencedSOPClassUID: getValue(Tags.SOPClassUID),
          ReferencedSOPInstanceUID: id.sopInstanceUid,
          RetrieveURL,
        },
      ],
    }
    const responseMessage = JSON.stringify(successMessage)
    console.log(
      "--boundary-response\r\n\r\n" +
        responseMessage +
        "\r\n--boundary-response--\r\n"
    )
  }
}

module.exports = validateMetadata
