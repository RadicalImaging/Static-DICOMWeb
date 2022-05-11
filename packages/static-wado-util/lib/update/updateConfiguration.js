const fs = require("fs");
const json5Writer = require("json5-writer");
const configDiff = require("./configDiff");

const updateConfiguration = (configurationFile, config) => {
  const delta = configDiff(config) || {};
  let updated = JSON.stringify({ staticWadoConfig: delta }, null, 2);
  if (fs.existsSync(configurationFile)) {
    const sourceConfig = fs.readFileSync(configurationFile, "utf-8");
    const writer = json5Writer.load(sourceConfig);
    writer.write({ staticWadoConfig: delta });
    updated = writer.toSource();
  }
  fs.writeFileSync(configurationFile, updated, "utf-8");
};

module.exports = updateConfiguration;
