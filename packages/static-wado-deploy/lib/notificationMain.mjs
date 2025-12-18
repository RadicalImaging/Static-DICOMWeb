import { NotificationService } from '@radicalimaging/static-wado-util';
import updateConsistency from './updateConsistencyMain.mjs';

/**
 * Scans the notification directory for updates and runs the specified
 * command on notification.
 *
 * Runs notification checks on the specified directory by:
 *   0. Startup (TODO - this is cleaner for future work)
 *      a. If can claim specified URL port, then do so
 *      b. If not, then send ping notification port to process
 *      c. Repeat until a or b is succeeds, or failure count hit
 *   1. Finds a notify file that is ready to be processed
 *      a. If notifications exist, but are not ready yet, then sleep till T+4-6 seconds
 *      b. If notifications exist, in progress, then sleep till T+4-6 seconds and check again
 *      c. If notifications do not exist for at least 4 checks, then exit
 *   3. Reads the notify file and gets the studyUID to update.
 *      a. If the studyUID is already in progress, then delete the notify file
 *   4. Runs a study update on the specified study with 10 second interval, and 3 retries
 *      a. On success, delete the provided notify file and do NOT create a new one
 *      b. On failure, create a new notify file for T+1 minute and failure count +1
 *
 */
export default async function (options) {
  const { notificationDir } = this;
  if (!notificationDir) {
    console.warn('Please specify notificationDir in static-wado configuration');
    return -1;
  }
  const notificationService = new NotificationService(notificationDir);
  console.log('Using notification dir', notificationService.dir);

  const updateFunction = (name, data) => {
    const { StudyInstanceUID } = data;
    updateConsistency.call(this, StudyInstanceUID, options);
  };

  notificationService.scan(updateFunction, options);
}
