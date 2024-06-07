const hashFactory = require("node-object-hash");

const hasher = hashFactory.hasher();
const { JSONWriter } = require("@radicalimaging/static-wado-util");
const { Tags } = require("@radicalimaging/static-wado-util");
const TagLists = require("../model/TagLists");

async function writeDeduplicatedFile(dir, data, hashValueSrc) {
  const hashValue = hashValueSrc || hasher.hash(data);
  // Write it direct in the deduplicated directory, not as a sub-directory or index file
  await JSONWriter(dir, hashValue, data, { gzip: true, index: false });
  return hashValue;
}

const perInstanceWriter = async (id, data) => {
  const { deduplicatedInstancesPath } = id;
  const hashValue = TagLists.addHash(data, Tags.InstanceType);
  return writeDeduplicatedFile(deduplicatedInstancesPath, [data], hashValue);
};

/** Writes out JSON files to the given file name.  Automatically GZips them, and adds the extension */
const DeduplicateWriter = (options) =>
  async function DeduplicateWriterInstance(id, data) {
    const studyData = await this.completeStudy.getCurrentStudyData(this, id);

    if (options.isDeduplicate) {
      if (options.verbose) console.log("Writing single instance", id.studyInstanceUid);
      await perInstanceWriter(id, data);
    } else if (options.verbose) {
      console.log("Not writing single instance deduplicated");
    }
    studyData.addDeduplicated(data, id.filename);
  };

module.exports = DeduplicateWriter;
