import commonMain from './commonMain.mjs';

export default async function themeMain(options) {
  await commonMain(this, 'client', options, 'theme');
}
