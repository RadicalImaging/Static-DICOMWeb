const fs = require('fs');
const path = require('path');
const handleHomeRelative = require('../handleHomeRelative');
const { Stats } = require('../stats');
const WriteStream = require('./WriteStream');

/** Writes out JSON files to the given file name.  Automatically GZips them, and adds the extension */
const JSONWriter = async (
  dirSrc,
  name,
  data,
  options = { gzip: true, brotli: false, index: true, overwrite: true }
) => {
  const fileName = options.index
    ? 'index.json.gz'
    : name + ((options.gzip && '.gz') || (options.brotli && '.br') || '');
  const dir = handleHomeRelative(dirSrc);
  const dirName = options.index ? path.join(dir, name) : dir;

  if (options.overwrite === false && fs.existsSync(`${dirName}/${fileName}`)) {
    console.verbose(
      `File already exists. Skipping JSON file creation at "${dirName}" named "${fileName}"`
    );

    Stats.StudyStats.add('JSON not written', `Did not write JSON file ${name}`, 1000);

    return;
  }

  const writeStream = WriteStream(dirName, fileName, {
    ...options,
    mkdir: true,
  });
  await writeStream.write(JSON.stringify(data));
  await writeStream.close();
  console.verbose(`Created JSON file at "${dirName}" named "${fileName}"`);
  Stats.StudyStats.add('Write JSON', `Write JSON file ${name}`, 1000);
};

module.exports = JSONWriter;
