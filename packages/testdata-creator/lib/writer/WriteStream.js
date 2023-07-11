const fs = require("fs");
const path = require("path");

/** Write files,
 * where the write operations are performed in order executed,
 * and don't require synchronization, only the 'close' operation
 * requires syncing.
 */
const WriteStream = (dir, nameSrc, options = {}) => {
  if (options.mkdir) fs.mkdirSync(dir, { recursive: true });

  const tempName = path.join(dir, `tempFile-${Math.round(Math.random() * 1000000000)}`);
  const finalName = path.join(dir, nameSrc);
  const rawStream = fs.createWriteStream(tempName);
  const closePromise = new Promise((resolve) => {
    rawStream.on("close", () => {
      resolve("closed");
    });
  });

  const writeStream = rawStream;

  async function close() {
    await this.writeStream.end();
    await this.closePromise;
    await fs.rename(tempName, finalName, () => true); // console.log('Renamed', tempName,finalName));
  }

  return {
    writeStream,
    closePromise,

    write(data) {
      return this.writeStream.write(data);
    },

    close,
  };
};

module.exports = WriteStream;
