const fs = require("fs");
const { execSync } = require("child_process");

// same level at package folder
const junoDir = `${OUTPUT_TEMP_PATH}/studies/1.2.840.113619.2.5.1762583153.215519.978957063.78`;
const junoSeriesDir = `${junoDir}/series/1.2.840.113619.2.5.1762583153.215519.978957063.121`;
const junoInstancesDir = `${junoSeriesDir}/instances/1.2.840.113619.2.5.1762583153.215519.978957063.122`;

const junoStudiesFile = `${junoDir}/index.json.gz`;
const junoSeriesFile = `${junoDir}/series/index.json.gz`;
const junoInstancesFile = `${junoSeriesDir}/instances/index.json.gz`;
const junoFramesFile = `${junoInstancesDir}/frames/1.gz`;

describe("index", () => {
  const processes = {};

  function assertExists(fileOrDir, exists = true) {
    fs.existsSync(fileOrDir).must.be.eql(exists);
  }

  beforeEach(() => {
    fs.mkdirSync(OUTPUT_TEMP_PATH, { recursive: true });

    assertExists(OUTPUT_TEMP_PATH, true);
  });

  const createJuno = () => {
    if (processes.createJuno) return;
    execSync(
      `node bin/mkdicomweb.js -o ${OUTPUT_TEMP_PATH} ${TEST_DATA_PATH}/dcm/MisterMr/1.2.840.113619.2.5.1762583153.215519.978957063.122`,
      (error, stdout, stderr) => {
        if (error) {
          console.log(`error: ${error.message}`);
          return;
        }
        if (stderr) {
          console.log(`stderr: ${stderr}`);
          return;
        }
        console.log(`stdout: ${stdout}`);
      }
    );
    processes.createJuno = true;
  };

  it("basic exists test", async () => {
    createJuno();

    assertExists(junoDir);
    assertExists(junoStudiesFile);
    assertExists(junoSeriesFile);
    assertExists(junoInstancesFile);
    assertExists(junoFramesFile);
  });
});
