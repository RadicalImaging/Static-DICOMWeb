import fs from "fs";
import { configGroup, handleHomeRelative } from "@radicalimaging/static-wado-util";
import path from "path";
import { plugins } from "@radicalimaging/static-wado-plugins";
import joinUri from "./joinUri.mjs";

/**
 * Deployment class.
 * Knows how to configure/load the deploy operations and then use them to
 * create/store deployments.
 *
 * Note, the buckets MUST already be configured in order to setup the deployment.
 * Copies things from the source file to the destination file.
 */

class DeployGroup {
  constructor(config, groupName, options, deployPlugin) {
    this.config = config;
    this.deployPlugin = deployPlugin;
    this.groupName = groupName;
    this.options = options;
    this.group = configGroup(config, groupName);
    if (!this.group) throw new Error(`No group ${groupName}`);
    this.baseDir = handleHomeRelative(this.group.dir);
    if (this.group.index) {
      this.indexFullName = `studies/${this.group.index}.json.gz`;
      config.indexFullName = this.indexFullName;
    }
  }

  // Loads the ops
  async loadOps() {
    const imported = await import(plugins[this.deployPlugin || "s3Plugin"]);
    const { createPlugin: CreatePlugin } = imported.default || imported;
    this.ops = new CreatePlugin(this.config, this.groupName, this.options);
  }

  /**
   * Stores the entire directory inside basePath / subdir.
   * asynchronous function
   * @params parentDir is the part of the path to include in the upload name
   * @params name is the item to add
   * @throws exception when the file isnt found or it can't upload
   */
  async store(parentDir = "", name = "", excludeExisting = {}) {
    const fileName = path.join(this.baseDir, parentDir, name);
    const lstat = await fs.promises.lstat(fileName);
    const relativeName = (name && `${parentDir}/${name}`) || parentDir || "";
    let count = 0;
    if (lstat.isDirectory()) {
      const names = await fs.promises.readdir(fileName);
      for (const childName of names) {
        count += await this.store(relativeName, childName, excludeExisting);
      }
      return count;
    }

    const { exclude = ["temp"] } = this.options;
    const isExcluded = exclude.find((it) => relativeName.indexOf(it) !== -1);
    if (isExcluded) {
      return 0;
    }

    if (await this.ops.upload(this.baseDir, relativeName, null, lstat.size, excludeExisting)) {
      count += 1;
    }
    return count;
  }

  async dir(uri) {
    const list = await this.ops.dir(uri);
    return list.reduce((acc, value) => {
      acc[value.Key] = value;
      return acc;
    }, {});
  }

  /**
   * Retrieves the contents of uri into the local baseDir, preserving the original naming/directory structure
   */
  async retrieve(options = {}, parentDir = "", name = "") {
    const { remoteUri } = options;
    const relativeName = joinUri(parentDir, name);
    if (remoteUri) {
      console.log("Retrieving specific URI", remoteUri);
      await this.ops.retrieve(joinUri(remoteUri, relativeName), path.join(this.baseDir, relativeName));
      return { skippedItems: 0, retrieved: 1 };
    }

    // Doing a directory index here
    console.verbose("Reading directory", relativeName);
    const contents = await this.ops.dir(relativeName);
    let skippedItems = 0;
    let retrieved = 0;
    if (!contents) {
      console.log("Directory does not exist:", relativeName);
      return { skippedItems, retrieved };
    }
    const { include = [], exclude = ["temp"], force } = options;
    for (const item of contents) {
      // item is an object containing information about this object
      if (!item.relativeUri) throw new Error("Nothing to retrieve");
      const destName = path.join(this.baseDir, item.fileName);
      if (include.length) {
        const foundItem = include.find((it) => destName.indexOf(it) !== -1);
        // Not skipped or retrieved, this is just out of scope
        if (!foundItem) {
          console.verbose("Skipping", destName, "because it includes", foundItem);
          continue;
        }
      }
      const isExcluded = exclude.find((it) => destName.indexOf(it) !== -1);
      if (isExcluded) {
        continue;
      }
      if (fs.existsSync(destName) && !force) {
        if (this.ops.shouldSkip(item, destName)) {
          console.verbose("Skipping", destName);
          skippedItems += 1;
          continue;
        }
      }
      await this.ops.retrieve(item.relativeUri, destName);
      retrieved += 1;
    }
    console.log("Retrieved", retrieved, "items to", this.baseDir, "and skipped", skippedItems);
    return { skippedItems, retrieved };
  }
}

export default DeployGroup;
