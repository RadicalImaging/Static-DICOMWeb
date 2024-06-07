const path = require("path");
const fs = require("fs");
const hashFactory = require("node-object-hash");
const { JSONReader, JSONWriter } = require("@radicalimaging/static-wado-util");
const { Tags } = require("@radicalimaging/static-wado-util");
const TagLists = require("../model/TagLists");

const { getValue, setValue, getList, setList } = Tags;
const hasher = hashFactory.hasher();

const getSeriesInstanceUid = (seriesInstance) => getValue(seriesInstance, Tags.SeriesInstanceUID);

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
  constructor({ studyInstanceUid, studyPath, deduplicatedPath, deduplicatedInstancesPath }, { isGroup, clean }) {
    this.studyInstanceUid = studyInstanceUid;
    this.studyPath = studyPath;
    this.isGroup = isGroup;
    this.deduplicatedPath = deduplicatedPath;
    this.deduplicatedInstancesPath = deduplicatedInstancesPath;
    this.clean = clean;
    this.clear();
  }

  clear() {
    this.deduplicated = [];
    this.extractData = {};
    // The list of already existing files read in to create this object
    this.existingFiles = [];
    // The read hashes is the hashes of the files that are read, both as groups and internally
    this.readHashes = {};
    // The deduplicated hashes are just the hashes for individual items
    this.deduplicatedHashes = {};
    this.sopInstances = {};
    this.instanceFiles = 0;

    // Used to track if new instances have been added.
    this.newInstancesAdded = 0;
  }

  /**
   * Clean the directory, and/or read existing data in the isInstances or isGroup files.
   * TODO - implement this.
   */
  async init({ clean }) {
    if (clean) {
      // Wipe out the study directory entirely, as well as the deduplicatedRoot and instancesRoot
    }
    this.groupFiles = 0;
    const studyDeduplicated = await JSONReader(this.studyPath, "deduplicated/index.json.gz", []);
    const info = studyDeduplicated[0];
    if (info) {
      const hash = getValue(info, Tags.DeduppedHash);
      console.log("Reading studies/<studyUID>/deduplicated/index.json.gz");
      this.readDeduplicatedData("index.json.gz", studyDeduplicated, hash);
    } else {
      console.log("No deduplicated/index.json to read in", this.studyPath, "/deduplicated/index.json.gz");
    }
    if (this.deduplicatedPath) {
      this.groupFiles = await this.readDeduplicated(this.deduplicatedPath);
      console.verbose("Read groupFiles:", this.groupFiles);
    }
    if (this.deduplicatedInstancesPath) {
      this.instanceFiles = await this.readDeduplicated(this.deduplicatedInstancesPath);
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
    return this.newInstancesAdded > 0 || this.existingFiles.length > 1 || this.instanceFiles > 0;
  }

  async dirtyMetadata() {
    if (this.dirty) {
      console.verbose("dirtyMetadata::Group data is dirty");
      return true;
    }
    if (this.groupFiles > 0) {
      console.verbose("dirtyMetadata::Study level deduplicated doesn't match group files");
    }
    try {
      const studyFile = await JSONReader(this.studyPath, "index.json.gz", null);
      if (!studyFile) {
        console.verbose("dirtyMetadata::studyIndex");
        return true;
      }
      const hashValue = getValue(studyFile, Tags.DeduppedHash);
      if (this.existingFiles[0].indexOf(hashValue) == -1) {
        return false;
      }
      console.verbose("dirtyMetadata::Dedupped hash missing");
      return true;
    } catch (e) {
      console.verbose("dirtyMetadata::Exception, assume study metadata is dirty", e);
      return true;
    }
  }

  async reject(seriesInstanceUid, sopInstanceUid /* , reason */) {
    // TODO - actually add a reject note...
    this.newInstancesAdded += 1;
    for (let i = 0; i < this.deduplicated.length; i++) {
      const recombined = await this.recombine(i);
      const reSeriesUid = getValue(recombined, Tags.SeriesInstanceUID);
      if (reSeriesUid !== seriesInstanceUid) continue;
      const reSop = getValue(recombined, Tags.SOPInstanceUID);
      if (!reSop) continue;
      if (sopInstanceUid && reSop !== sopInstanceUid) continue;
      setValue(this.deduplicated[i], Tags.DeduppedType, "deleted");
    }
  }

  async delete() {
    await fs.rmSync(this.studyPath, { recursive: true, force: true });
    await fs.rmSync(this.deduplicatedInstancesPath, { recursive: true, force: true });
    await fs.rmSync(this.deduplicatedPath, { recursive: true, force: true });
    this.clear();
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

  assignUndefined(ret, item) {
    if (!item) return;
    Object.keys(item).forEach((key) => {
      if (ret[key]) return;
      ret[key] = item[key];
    });
  }

  /**
   * Create a full study instance data for instance at index
   */
  async recombine(indexOrSop) {
    const index = typeof indexOrSop === "string" ? this.sopInstances[indexOrSop] : indexOrSop;
    const deduplicated = this.deduplicated[index];
    if (index < 0 || index >= this.deduplicated.length) {
      throw new Error(`Can't read index ${index}, out of bounds [0..${this.deduplicated.length})`);
    }
    const refs = getList(deduplicated, Tags.DeduppedRef);
    if (!refs) {
      console.log("No refs for", deduplicated);
      return deduplicated;
    }
    const ret = { ...deduplicated };
    for (const hashKey of refs) {
      const item = await this.getOrLoadExtract(hashKey);
      this.assignUndefined(ret, item);
    }
    return ret;
  }

  async addExtracted(callback, hashKey, item) {
    if (this.extractData[hashKey]) {
      if (this.verbose) console.log("Already have extracted", hashKey, getValue(item, Tags.DeduppedType));
      return;
    }
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
    const sopValue = getValue(data, Tags.SOPInstanceUID);
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
    let readCount = 0;
    try {
      const files = await this.listJsonFiles(deduplicatedDirectory);
      if (!files || !files.length) {
        console.verbose("No deduplicated for", deduplicatedDirectory);
        return 0;
      }
      console.verbose("There are", files.length, "files to check");
      for (let i = 0; i < files.length; i++) {
        const stat = files[i];
        const { hash } = stat;
        if (this.readHashes[hash]) {
          continue;
        }
        readCount += 1;
        await this.readDeduplicatedFile(deduplicatedDirectory, stat);
      }
      console.verbose("Done checking", deduplicatedDirectory);
    } catch (e) {
      // No-op console.log(e);
    }
    return readCount;
  }

  async readDeduplicatedFile(dir, stat) {
    const { hash, name } = stat;
    try {
      if (this.verbose) console.log("Reading deduplicated file", name);
      const data = await JSONReader(dir, name);
      this.readDeduplicatedData(name, data, hash);
    } catch (e) {
      console.error("Unable to read", dir, name);
    }
  }

  readDeduplicatedData(name, data, hash) {
    this.readHashes[hash] = name;
    this.existingFiles.push(name);
    const listData = (Array.isArray(data) && data) || [data];
    listData.forEach((item) => {
      const type = getValue(item, Tags.DeduppedType);
      if (type === Tags.InstanceType || type === Tags.DeletedType) {
        this.internalAddDeduplicated(item, name);
      } else if (type == "info") {
        const refs = getList(item, Tags.DeduppedRef);
        if (refs) {
          refs.forEach((hashValue) => {
            this.readHashes[hashValue] = `${hashValue}.gz`;
          });
        }
      } else {
        const hashValue = getValue(item, Tags.DeduppedHash);
        if (hashValue) {
          this.extractData[hashValue] = item;
        }
      }
    });
  }

  async writeMetadata() {
    const anInstance = await this.recombine(0);
    const series = {};

    for (let i = 0; i < this.numberOfInstances; i++) {
      const seriesInstance = await this.recombine(i);
      const type = getValue(seriesInstance, Tags.DeduppedType);
      if (type == "deleted") {
        console.log("Skipping deleted instance", type, getValue(seriesInstance, Tags.SeriesInstanceUID));
        continue;
      }
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
      const modality = getValue(seriesQuery, Tags.Modality);
      seriesList.push(seriesQuery);
      if (modalitiesInStudy.indexOf(modality) == -1) modalitiesInStudy.push(modality);
      await JSONWriter(seriesPath, "metadata", instances, {
        gzip: true,
        index: false,
      });
      // Write out a series singleton that has just the series response for a single series.
      await JSONWriter(seriesPath, "series-singleton.json", [seriesQuery], { gzip: true, index: false });
      await JSONWriter(seriesPath, "instances", instancesQuery);
    }

    await JSONWriter(this.studyPath, "series", seriesList);
    console.log("Wrote series with", seriesList.length);

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
    setValue(data, Tags.DeduppedHash, hashValue);
    setValue(data, Tags.DeduppedType, "info");
    return data;
  }

  /* eslint-disable-next-line class-methods-use-this */
  removeGz(name) {
    const gzIndex = name.indexOf(".gz");
    return (gzIndex > 0 && name.substring(0, gzIndex)) || name;
  }

  async deleteInstancesReferenced() {
    const deduplicatedDirectory = this.deduplicatedInstancesPath;
    if (!fs.existsSync(deduplicatedDirectory)) return;
    console.log("Deleting instances referenced in", this.studyInstanceUid, this.deduplicatedInstancesPath);
    const files = await this.listJsonFiles(deduplicatedDirectory);
    console.log("Deleting", files.length, "files");
    let deleteCount = 0;
    for (let i = 0; i < files.length; i++) {
      const stat = files[i];
      const { hash } = stat;
      if (this.readHashes[hash]) {
        console.log("Deleting", deduplicatedDirectory, stat.name);
        try {
          fs.unlinkSync(path.join(deduplicatedDirectory, stat.name));
          deleteCount += 1;
        } catch (e) {
          console.log("Delete failed", e);
        }
      }
    }
    if (deleteCount === files.length) {
      console.log("Deleting instances directory", deduplicatedDirectory);
      fs.rmdirSync(deduplicatedDirectory);
    }
  }

  /** Writes the deduplicated group */
  async writeDeduplicatedGroup() {
    const data = this.createInfo();
    const hashValue = getValue(data, Tags.DeduppedHash);
    console.log(
      "Writing deduplicated hash data set data with",
      Object.values(this.extractData).length,
      "extract items and",
      this.deduplicated.length,
      "instance items"
    );
    setList(
      data,
      Tags.DeduppedRef,
      Object.keys(this.readHashes).filter(() => this.deduplicatedHashes[hashValue] == undefined)
    );
    const deduplicatedList = [data, ...Object.values(this.extractData), ...this.deduplicated];
    // const naturalList = deduplicatedList.map(Tags.naturalizeDataset);
    // // console.log("naturalList=", JSON.stringify(naturalList,null,2));
    // console.log("Going to write study data", naturalList.length);
    // await JSONWriter(this.deduplicatedPath, hashValue, naturalList, { gzip: true, index: false });
    await JSONWriter(this.deduplicatedPath, hashValue, deduplicatedList, { gzip: true, index: false });
    console.log("Wrote naturalized dataset");
  }

  getSopUids() {
    return Object.keys(this.sopInstances);
  }
}

module.exports = StudyData;
