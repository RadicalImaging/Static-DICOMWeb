import commonMain from './commonMain.mjs';

async function uploadLei(sourcePath, config, name, options, deployer) {
  console.warn('Uploading to', sourcePath);
  const results = deployer.store(sourcePath);
}

export default async function (studyUid, options) {
  if (!studyUid) {
    console.log('requiredParameter missing', studyUid, options);
    return;
  }
  await commonMain(this, 'upload', options, uploadLei.bind(null, `lei/${studyUid}`));
}
