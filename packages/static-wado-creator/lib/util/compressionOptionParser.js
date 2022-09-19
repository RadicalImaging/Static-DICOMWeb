const { program } = require("@radicalimaging/static-wado-util");
const { getDestinationTranscoder } = require("../operation/adapter/transcodeImage");

module.exports = function compressionOptionParser(value) {
  const destination = getDestinationTranscoder(value);
  if (destination) {
    console.log("Found destination transferSyntax ", destination.transferSyntaxUid, "for ", value);
  } else {
    console.log("No transcoder destination for ", value);
    throw new program.InvalidArgumentError(`No transcoder destination for ${value}`);
  }
  return destination.transferSyntaxUid;
};
