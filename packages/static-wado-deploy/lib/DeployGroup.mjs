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
    this.baseDir = handleHomeRelative(this.group.dir);
    if( this.group.index ) {
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
   */
  async store(parentDir = "", name = "") {
    const fileName = path.join(this.baseDir, parentDir, name);
    const lstat = await fs.promises.lstat(fileName);
    const relativeName = (name && `${parentDir}/${name}`) || parentDir || "";
    if (lstat.isDirectory()) {
      console.log("Reading directory", fileName);
      const names = await fs.promises.readdir(fileName);
      for (const childName of names) {
        await this.store(relativeName, childName);
      }
      // await Promise.all(names.map((childName) => this.store(relativeName, childName)));
    } else {
      await this.ops.upload(this.baseDir, relativeName, null, lstat.size);
    }
  }

  /**
   * Retrieves the contents of uri into the local baseDir, preserving the original naming/directory structure
   */
  async retrieve(options = {}, parentDir = "", name = "") {
    const { remoteUri } = options;
    const fileName = joinUri(remoteUri, parentDir, name);
    // URI syntax uses a slash at the end to distinguish directories from paths
    const isDirectory = fileName[fileName.length - 1] == "/";
    const relativeName = joinUri(parentDir, name);
    console.log("relativeName", relativeName);
    if (isDirectory) {
      console.log("Reading directory", fileName);
      const contents = await this.ops.dir(fileName);
      if (!contents) {
        console.log("Directory does not exist:", fileName);
        return;
      }
      for (const item of contents) {
        await this.retrieve(options, item.Key);
      }
    } else {
      console.log("remoteUri", remoteUri);
      console.log("relativeName", relativeName);
      console.log("baseDir", this.baseDir);
      await this.ops.retrieve(remoteUri, relativeName, this.baseDir);
    }
  }
}

export default DeployGroup;
