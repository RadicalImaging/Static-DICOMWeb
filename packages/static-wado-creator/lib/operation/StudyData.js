const path = require("path");
const fs = require("fs");
const hashFactory = require("node-object-hash");
const { JSONReader } = require("@ohif/static-wado-util");
const Tags = require("../dictionary/Tags");
const TagLists = require("../model/TagLists");
const JSONWriter = require("../writer/JSONWriter");

const hasher = hashFactory();

const getSeriesInstanceUid = (seriesInstance) =>
  seriesInstance[Tags.SeriesInstanceUID] && seriesInstance[Tags.SeriesInstanceUID].Value && seriesInstance[Tags.SeriesInstanceUID].Value[0];

/**
 * StudyData contains information about the grouped study data.  It is used to create
 * study level information such as study or series level metadata, and to group things
 * together during processing, such as handling the study level deduplicated group
 * files.
 *
 * It also has methods on performing study level operations such as patient name updates
 * or instance remove operations, and has methods to handle avoiding needing to store instance
 * level data multiple times when it already exists.
 */
class StudyData {
  constructor({ studyInstanceUid, studyPath, deduplicatedPath, deduplicatedInstancesPath }, { isGroup }) {
    this.deduplicated = [];
    this.extractData = {};
    // The list of already existing files read in to create this object
    this.existingFiles = [];
    // The read hashes is the hashes of the files that are read, both as groups and internally
    this.readHashes = {};
    // The deduplicated hashes are just the hashes for individual items
    this.deduplicatedHashes = {};
    this.sopInstances = {};

    // Used to track if new instances have been added.
    this.newInstancesAdded = 0;
    this.studyInstanceUid = studyInstanceUid;
    this.studyPath = studyPath;
    this.isGroup = isGroup;
    this.deduplicatedPath = deduplicatedPath;
    this.deduplicatedInstancesPath = deduplicatedInstancesPath;
  }

  /**
   * Clean the directory, and/or read existing data in the isInstances or isGroup files.
   * TODO - implement this.
   */
  async init({ clean }) {
    if (clean) {
      // Wipe out the study directory entirely, as well as the deduplicatedRoot and instancesRoot
    }
    if (this.deduplicatedPath) {
      await this.readDeduplicated(this.deduplicatedPath);
    }
    if (this.deduplicatedInstancesPath) {
      await this.readDeduplicated(this.deduplicatedInstancesPath);
    }
  }

  get numberOfInstances() {
    return this.deduplicated.length;
  }

  /**
   * Indicate if this study is 'dirty', that is, has been updated.
   * That is NOT to say that the metadata files generated from this study data are up to date, that is
   * a separate type of check.
   */
  get dirty() {
    return this.newInstancesAdded > 0 || this.existingFiles.length > 1;
  }

  async dirtyMetadata() {
    if (this.dirty) {
      console.log("Study data is dirty - need to write updated file");
      return true;
    }
    try {
      const deduplicatedTopFile = await JSONReader(this.studyPath, "deduplicated.gz", null);
      if (!deduplicatedTopFile) {
        return true;
      }
      const info = deduplicatedTopFile[0];
      if (!info || !info[Tags.DeduppedHash] || info[Tags.DeduppedType].Value[0] != "info") {
        return true;
      }
      const hashValue = info[Tags.DeduppedHash].Value[0];
      return this.existingFiles[0].indexOf(hashValue) == -1;
    } catch (e) {
      console.log("Assume study metadata is dirty", e);
      return true;
    }
  }

  async getOrLoadExtract(hashKey) {
    let item = this.extractData[hashKey];
    if (!item) {
      item = await JSONReader.readHashData(this.studyPath, hashKey);
      if (!item) {
        console.error("Unable to read hashdata", hashKey);
        return item;
      }
      this.extractData[hashKey] = item;
    }
    return item;
  }

  /**
   * Create a full study instance data for instance at index
   */
  async recombine(index) {
    const deduplicated = this.deduplicated[index];
    if (index < 0 || index >= this.deduplicated.length) {
      throw new Error(`Can't read index ${index}, out of bounds [0..${this.deduplicated.length})`);
    }
    const refs = deduplicated[Tags.DeduppedRef];
    if (!refs) {
      console.log("No refs for", deduplicated);
      return deduplicated;
    }
    const ret = { ...deduplicated };
    for (const hashKey of refs.Value) {
      const item = await this.getOrLoadExtract(hashKey);
      Object.assign(ret, item);
    }
    return ret;
  }

  async addExtracted(callback, hashKey, item) {
    if (this.extractData[hashKey]) return;
    await callback.bulkdata(this, hashKey, item);
    this.extractData[hashKey] = item;
  }

  sopExists(sopUID) {
    const sopValue = (sopUID && sopUID.Value && sopUID.Value[0]) || sopUID;
    return sopValue && this.sopInstances[sopValue] !== undefined;
  }

  addDeduplicated(data, filename) {
    if (!this.isGroup) return;
    // TODO - check the hash code on the added data, if it has already been seen then ignore this item.
    if (this.internalAddDeduplicated(data, filename)) {
      this.newInstancesAdded += 1;
    }
  }

  /** Add the instance if not already present */
  internalAddDeduplicated(data, filename = "internal") {
    const hashValue = TagLists.addHash(data, Tags.InstanceType);
    if (!hashValue || this.deduplicatedHashes[hashValue]) {
      // console.log('Not adding', hashValue, 'because the hash exists');
      return false;
    }
    const sopUID = data[Tags.SOPInstanceUID];
    const sopValue = (sopUID && sopUID.Value && sopUID.Value[0]) || sopUID;
    const sopIndex = this.sopInstances[sopValue];
    if (!sopValue) {
      console.warn("No sop value in", filename, "reading", data);
      return false;
    }
    this.deduplicatedHashes[hashValue] = data;
    this.readHashes[hashValue] = filename;
    if (sopIndex !== undefined) {
      console.log("Replacing SOP", sopValue, "at index", sopIndex);
      this.deduplicated[sopIndex] = data;
    } else {
      this.sopInstances[sopValue] = this.deduplicated.length;
      this.deduplicated.push(data);
    }

    return !!hashValue;
  }

  async listJsonFiles(dir) {
    const names = await fs.promises.readdir(dir);
    if (!names || names.length == 0) return [];
    const gzNames = names.filter((name) => name.indexOf(".gz") > 0);
    const statInfo = gzNames
      .map((name) => {
        const stat = fs.statSync(path.join(dir, name));
        return {
          ...stat,
          name,
          hash: this.removeGz(name),
        };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    return statInfo;
  }

  /**
   * Reads the deduplicated directory, finding the newest file in the directory of type JSON,
   * and then reads it in.  It then reads in all un-referenced files, and adds references to those to the
   * current path, NOT changing the hash value of the top level element.
   *
   * Records the files read in referencedFiles list.
   * Sets the dirty deduplicated flag if at least two instances were read.
   *
   * Does NOT call the readInstances, which is a separate step which can be executed after this one.
   *
   * @param {*} deduplicatedDirectory
   */
  async readDeduplicated(deduplicatedDirectory) {
    try {
      const files = await this.listJsonFiles(deduplicatedDirectory);
      if (!files || !files.length) {
        console.log("No deduplicated for", deduplicatedDirectory);
        return;
      }
      console.log("There are", files.length, "files to check");
      for (let i = 0; i < files.length; i++) {
        const stat = files[i];
        const { hash } = stat;
        if (this.readHashes[hash]) {
          continue;
        }
        await this.readDeduplicatedFile(deduplicatedDirectory, stat);
      }
      console.log("Done checking", deduplicatedDirectory);
    } catch (e) {
      // No-op console.log(e);
    }
  }

  async readDeduplicatedFile(dir, stat) {
    const { hash, name } = stat;
    try {
      if (this.verbose) console.log("Reading deduplicated file", name);
      const data = await JSONReader(dir, name);
      this.readHashes[hash] = name;
      this.existingFiles.push(name);
      const listData = (Array.isArray(data) && data) || [data];
      listData.forEach((item) => {
        const typeEl = item[Tags.DeduppedType];
        const type = typeEl && typeEl.Value[0];
        if (type == Tags.InstanceType) {
          this.internalAddDeduplicated(item, name);
        } else if (type == "info") {
          const refs = item[Tags.DeduppedRef];
          if (refs && refs.Value) {
            refs.Value.forEach((hashValue) => {
              this.readHashes[hashValue] = `${hashValue}.gz`;
            });
          }
        } else {
          const hashValue = item[Tags.DeduppedHash] && item[Tags.DeduppedHash].Value[0];
          if (hashValue) {
            this.extractData[hashValue] = item;
          }
        }
      });
    } catch (e) {
      console.error("Unable to read", dir, name);
    }
  }

  async writeMetadata() {
    const anInstance = await this.recombine(0);
    const series = {};

    for (let i = 0; i < this.numberOfInstances; i++) {
      const seriesInstance = await this.recombine(i);
      const seriesInstanceUid = getSeriesInstanceUid(seriesInstance);
      if (!seriesInstanceUid) {
        console.log("Cant get seriesUid from", Tags.SeriesInstanceUID, seriesInstance);
        continue;
      }
      if (!series[seriesInstanceUid]) {
        const seriesQuery = TagLists.extract(seriesInstance, "series", TagLists.SeriesQuery);
        const seriesPath = path.join(this.studyPath, "series", seriesInstanceUid);
        series[seriesInstanceUid] = {
          seriesPath,
          seriesQuery,
          instances: [],
          instancesQuery: [],
        };
      }
      series[seriesInstanceUid].instances.push(seriesInstance);
      series[seriesInstanceUid].instancesQuery.push(TagLists.extract(seriesInstance, "instance", TagLists.InstanceQuery));
    }

    const seriesList = [];
    const modalitiesInStudy = [];
    let numberOfInstances = 0;
    let numberOfSeries = 0;
    for (const seriesUid of Object.keys(series)) {
      const singleSeries = series[seriesUid];
      const { seriesQuery, seriesPath, instances, instancesQuery } = singleSeries;
      seriesQuery[Tags.NumberOfSeriesRelatedInstances] = {
        vr: "IS",
        Value: [instances.length],
      };
      numberOfInstances += instances.length;
      numberOfSeries += 1;
      seriesList.push(seriesQuery);
      const modality = seriesQuery[Tags.Modality].Value[0];
      if (modalitiesInStudy.indexOf(modality) == -1) modalitiesInStudy.push(modality);
      await JSONWriter(seriesPath, "metadata", instances, {
        gzip: true,
        index: false,
      });
      await JSONWriter(seriesPath, "series", [seriesQuery]);
      await JSONWriter(seriesPath, "instances", instancesQuery);
    }

    await JSONWriter(this.studyPath, "series", seriesList);

    const studyQuery = TagLists.extract(anInstance, "study", TagLists.PatientStudyQuery);
    studyQuery[Tags.ModalitiesInStudy] = { Value: modalitiesInStudy, vr: "CS" };
    studyQuery[Tags.NumberOfStudyRelatedInstances] = {
      Value: [numberOfInstances],
      vr: "IS",
    };
    studyQuery[Tags.NumberOfStudyRelatedSeries] = {
      Value: [numberOfSeries],
      vr: "IS",
    };
    // Write the index.json directly in the studyPath directory.
    await JSONWriter(this.studyPath, "index.json", [studyQuery], {
      gzip: true,
      index: false,
    });

    const infoItem = this.createInfo();
    console.log("Writing deduplicated study data with", Object.values(this.extractData).length, "extract items and", this.deduplicated.length, "instance items");
    await JSONWriter(this.studyPath, "deduplicated", [infoItem, ...Object.values(this.extractData), ...this.deduplicated]);

    return studyQuery;
  }

  /**
   * Creates an information item containing the hash value of this item type.
   */
  createInfo() {
    const data = {};
    const hashValue = hasher.hash(this.deduplicated);
    data[Tags.DeduppedTag] = { vr: "CS", Value: [Tags.DeduppedCreator] };
    data[Tags.DeduppedHash] = { vr: "CS", Value: [hashValue] };
    data[Tags.DeduppedType] = { vr: "CS", Value: ["info"] };
    return data;
  }

  /* eslint-disable-next-line class-methods-use-this */
  removeGz(name) {
    const gzIndex = name.indexOf(".gz");
    return (gzIndex > 0 && name.substring(0, gzIndex)) || name;
  }

  /** Writes the deduplicated group */
  async writeDeduplicatedGroup() {
    const data = this.createInfo();
    const hashValue = data[Tags.DeduppedHash].Value[0];
    console.log(
      "Writing deduplicated hash data set data with",
      Object.values(this.extractData).length,
      "extract items and",
      this.deduplicated.length,
      "instance items"
    );
    data[Tags.DeduppedRef] = {
      vr: "CS",
      Value: Object.keys(this.readHashes).filter(() => this.deduplicatedHashes[hashValue] == undefined),
    };
    await JSONWriter(this.deduplicatedPath, hashValue, [data, ...Object.values(this.extractData), ...this.deduplicated], { gzip: true, index: false });
  }
}

module.exports = StudyData;
