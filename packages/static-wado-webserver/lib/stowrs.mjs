import formidable from "formidable";
import childProcess from "child_process";
import util from "util";
import fs from "fs";

const exec = util.promisify(childProcess.exec);

/**
 * Handles an incoming stow-rs POST data, either in application/dicom (single instance), or in
 * multipart/related with JSON data elements.
 *
 * TODO: Handle bulkdata and images, in addition to the raw JSON data.
 */

const stowrsGenerator = (params) => {
  const { stowCommands, verbose } = params;
  const createCommandLine = (files, commandName) => files.reduce((p, c) => `${p} ${c.filepath}`, commandName);

  const stowrs = (req, res, next) => {
    const form = formidable({multiples: true});
    form.parse(req, (err, fields, files) => {
      if (err) {
        console.log("Couldn't parse because", err);
        next(err);
        return;
      }
      try {
        const listFiles = Object.values(files).reduce((prev, curr) => prev.concat(curr), []);
        if (verbose)
          console.log(
            "Storing files",
            listFiles.map((item) => item.filepath)
          );

        const promises = [];
        for (const commandName of stowCommands) {
          const command = createCommandLine(listFiles, commandName);
          const commandPromise = exec(command);
          commandPromise.then(({ stdout, stderr }) => console.log(stdout, stderr));
          promises.push(commandPromise);
        }
        Promise.all(promises).then(() => {
          listFiles.forEach((item) => {
            const { filepath } = item;
            if (verbose) console.log("Unlinking", filepath);
            fs.unlink(filepath, () => null);
          });
        });
        console.log("Returning empty result - TODO, generate references");
        res.status(200).json({});
      } catch (e) {
        console.log(e);
        res.status(500).text(`Unable to handle ${e}`);
      }
    });
  };
  return stowrs;
};

export default stowrsGenerator;
