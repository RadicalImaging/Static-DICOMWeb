import commonMain from './commonMain.mjs';
import uploadDeploy from './uploadDeploy.mjs';
import retrieveDeploy from './retrieveDeploy.mjs';

export default async function (studyUID, options) {
  if (!studyUID) throw new Error('Must provide a studyUID to upload/download');
  const studyDirectory = `deduplicated/${studyUID}`;
  //  TODO - use deduplicatedGroup if present, or fall back to root otherwise?
  if (options.retrieve) {
    console.log('Retrieving deduplicated files for studyUID', studyUID);
    await commonMain(this, 'root', options, retrieveDeploy.bind(null, studyDirectory));
  } else {
    console.log('Storing deduplicated files for studyUID', studyUID);
    await commonMain(this, 'root', options, uploadDeploy.bind(null, studyDirectory));
  }
}
