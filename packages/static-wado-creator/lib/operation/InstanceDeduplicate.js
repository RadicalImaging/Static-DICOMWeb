// TODO review returning type of some methods
const JSONWriter = require("../writer/JSONWriter");
const TagLists = require("../model/TagLists");
const Tags = require("../dictionary/Tags");

const extractors = {
  patient: TagLists.PatientQuery,
  study: TagLists.StudyQuery,
  series: TagLists.SeriesExtract,
  image: TagLists.ImageExtract,
};

/**
 * This is an instance listener - the way this one works is that it listens for instance metadata.
 * Every time an instance metadata event is fired, it deduplicates a bunch of data, firing deduplicate events,
 * and then collects the deduplicate data into a list.
 * Whenever the study UID changes, a new event is fired to indicate the deduplicated data is ready.
 */
async function deduplicateSingleInstance(id, imageFrame) {
  if (!imageFrame) return {};
  const studyData = await this.completeStudy.getCurrentStudyData(this, id);
  const seriesUID = imageFrame[Tags.SeriesInstanceUID];
  const sopUID = imageFrame[Tags.SOPInstanceUID];
  if (!sopUID) {
    console.warn("No sop instance UID in", imageFrame);
    return {};
  }
  if (studyData.sopExists(sopUID)) {
    // console.log('SOP Instance UID', sopUID.Value[0], 'already exists, skipping');
    // TODO - allow replace as an option
    return {};
  }
  const deduplicated = { ...imageFrame };

  if (!this.extractors) this.extractors = extractors;
  for (const key of Object.keys(this.extractors)) {
    const extracted = TagLists.extract(deduplicated, key, this.extractors[key], TagLists.RemoveExtract);
    const hashKey = extracted[Tags.DeduppedHash].Value[0];
    await studyData.addExtracted(this, hashKey, extracted);
  }

  // Restore the series and SOP UIDs
  deduplicated[Tags.SeriesInstanceUID] = seriesUID;
  deduplicated[Tags.SOPInstanceUID] = sopUID;
  TagLists.addHash(deduplicated, Tags.InstanceType);

  return deduplicated;
}

/** Canonicalize the JSON data, making Values always arrays, remote "undefined" from the tags etc */
const canonicalize = (json) => {
  if (!json) return;
  if (Array.isArray(json)) {
    return json.map(canonicalize);
  }
  Object.keys(json).forEach((tag) => {
    if (!tag || tag === "undefined") {
      // console.error('Got an undefined tag:', tag, typeof(tag));
      // TODO check returning value
      return;
    }
    const val = json[tag];
    const { Value } = val || {};
    if (Value && !Array.isArray(Value)) {
      val.Value = [Value];
    }
  });
  return json;
};

const InstanceDeduplicate = (options) =>
  async function run(id, sourceImageFrame) {
    // Notify the existing listeners, if any
    const imageFrame = canonicalize(sourceImageFrame);
    if (options.isInstanceMetadata) {
      await JSONWriter(id.sopInstanceRootPath, "metadata", imageFrame);
    }
    if (!options.isDeduplicate && !options.isGroup) {
      return;
    }

    if (!this.deduplicateSingleInstance) {
      this.deduplicateSingleInstance = deduplicateSingleInstance;
    }

    const deduppedInstance = await this.deduplicateSingleInstance(id, imageFrame);
    if (deduppedInstance) {
      // this refers to callee
      await this.deduplicated(id, deduppedInstance);
    }
  };

module.exports = InstanceDeduplicate;
