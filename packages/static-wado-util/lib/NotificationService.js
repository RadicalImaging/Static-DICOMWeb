const fs = require("fs");
const sleep = require("./sleep");
const JSONWriter = require("./writer/JSONWriter");
const handleHomeRelative = require("./handleHomeRelative");
const JSONReader = require("./reader/JSONReader");

/**
 * Implements a notification service.  This is a very coarse notification service which
 * is just file based and creates files to track actions to apply.  The notifications are in the
 * <rootDir>/notifications/<serviceName> directory.
 *
 * Notifications are json .notify files.  Other file extensions are ignored.
 */

class NotificationService {
  constructor(dir, name = "update") {
    if (!dir) {
      return;
    }
    this.dir = handleHomeRelative(dir);
    this.name = name;
    fs.mkdirSync(dir, { recursive: true });
  }

  /**
   *
   * @param {Func} callback function taking the JSON object data.  If it throws, the failure funciton will be called
   * @param {number} options.delay - if defined will sleep the given length of time between scans.  Otherwise only one scan is performed.
   * @param {number} options.retries - how many retries to apply 
   * @returns a promise that can be awaited to wait until the end of the scan, or until shutdown is completed.
   */
  async scan(callback, options = {}) {
    const { retries, delay = 5000 } = options;
    console.log("Scan", this.dir);
    for (let i = 0; i < retries; i++) {
      if (i > 0) await sleep(delay);
      await this.scanOnce(callback);
    }
  }

  async scanOnce(callback) {
    const contents = fs.readdirSync(this.dir);
    for (const item of contents) {
      await this.scanItem(callback, item);
    }
  }

  async scanItem(callback, name) {
    if (name.indexOf(".notify") === -1) return;
    const newName = `${this.dir}/${name.substring(0, name.length - 6)}progress`;
    console.log("Scanning item", name);
    try {
      fs.renameSync(`${this.dir}/${name}`, newName);
    } catch (e) {
      // Somebody else handled it
      return;
    }
    try {
      const jsonData = await JSONReader(newName, "");
      callback(newName, jsonData);
    } catch (e) {
      console.warn("Caught error processing", name, e);
      // callback is supposed to deal with creating new events, so can just proceed
    }
    fs.unlinkSync(newName);
  }

  /**
   * Write the given message to a notification.
   * Will JSON.stringify the message
   *
   * @param {JSON} message
   * @returns notify file name
   */
  notify(message, id) {
    if (!this.dir) return "";
    console.log("Notify", message);
    const name = `${id}-${Math.floor(Math.random() * 1000000)}.notify`;
    JSONWriter(this.dir, name, message, { gzip: false });
    return name;
  }

  /** Notifies on the given study */
  notifyStudy(studyUID, options = {}) {
    if (!this.dir) return;
    this.notify({
      ...options,
      StudyInstanceUID: studyUID,
      action: options.action || "update",
    }, studyUID);
  }
}

module.exports = NotificationService;
