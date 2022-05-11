/**
 * Implements a notification service.  This is a very coarse notification service which
 * is just file based and creates files to track actions to apply.  The notifications are in the
 * <rootDir>/notifications/<serviceName> directory.
 *
 * Notifications are .json files.  Other file extensions are ignored.
 * The process being notified must be idempotent - that is, a null action when a subsequent notification is processed
 * on the same parameters.
 */

class NotificationService {
  constructor(dir, name) {
    this.dir = dir;
    this.name = name;
  }

  /**
   *
   * @param {Func} callback function taking the JSON object data.  If it throws, the failure funciton will be called
   * @param {Func} failure is a function to call on failure.  If none is provided, a retry function is default that
   *     creates another json object notification, and deletes the old notification.
   * @param {number} sleep, if defined will sleep the given length of time between scans.  Otherwise only one scan is performed.
   * @returns a promise that can be awaited to wait until the end of the scan, or until shutdown is completed.
   */
  scan(callback, failure, sleep) {
    console.log("Scan", callback, failure, sleep);
  }

  /**
   * Write the given message to a notification.
   * Will JSON.stringify the message
   *
   * @param {JSON} message
   * @returns promise that is the message id
   */
  notify(message) {
    console.log("Notify", message);
  }
}

module.exports = NotificationService;
