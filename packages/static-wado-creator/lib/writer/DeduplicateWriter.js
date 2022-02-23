const hashFactory = require("node-object-hash");

const hasher = hashFactory();
const JSONWriter = require("./JSONWriter");
const Tags = require("../dictionary/Tags");
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
      await perInstanceWriter(id, data);
    }
    studyData.addDeduplicated(data);
  };

module.exports = DeduplicateWriter;
