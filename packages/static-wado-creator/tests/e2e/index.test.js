const fs = require("fs");
const { execSync } = require("child_process");
const { JSONReader, Tags } = require("@radicalimaging/static-wado-util");
const must = require("must");

// same level at package folder
const junoDir = `${OUTPUT_TEMP_PATH}/studies/1.2.840.113619.2.5.1762583153.215519.978957063.78`;
const junoSeriesDir = `${junoDir}/series/1.2.840.113619.2.5.1762583153.215519.978957063.121`;
const junoInstancesDir = `${junoSeriesDir}/instances/1.2.840.113619.2.5.1762583153.215519.978957063.122`;

const junoStudiesFile = `${junoDir}/index.json.gz`;
const junoSeriesFile = `${junoDir}/series/index.json.gz`;
const junoInstancesFile = `${junoSeriesDir}/instances/index.json.gz`;
const junoFramesFile = `${junoInstancesDir}/frames/1`;

const cwd = process.cwd();
const root = cwd.indexOf("static-wado-creator") == -1 ? cwd : `${cwd}/../..`;

describe("index", () => {
  const processes = {};
  let metadataJuno;
  let objJuno;

  function assertExists(fileOrDir, exists = true) {
    must(fs.existsSync(fileOrDir), `File ${fileOrDir} ${exists ? "does not" : ""} exist`).be.eql(exists);
  }

  beforeEach(() => {
    fs.mkdirSync(OUTPUT_TEMP_PATH, { recursive: true });

    assertExists(OUTPUT_TEMP_PATH, true);
  });

  const createJuno = async () => {
    if (processes.createJuno) {
      return;
    }
    execSync(
      `node ${root}/packages/static-wado-creator/bin/mkdicomweb.js -o ${OUTPUT_TEMP_PATH} ${TEST_DATA_PATH}/dcm/MisterMr/1.2.840.113619.2.5.1762583153.215519.978957063.122`,
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
    metadataJuno = await JSONReader(junoSeriesDir, "metadata.gz");
    objJuno = metadataJuno[0];
  };

  it("basic exists test", async () => {
    jest.setTimeout(25000);
    await createJuno();

    assertExists(junoDir);
    assertExists(junoStudiesFile);
    assertExists(junoSeriesFile);
    assertExists(junoInstancesFile);
    assertExists(junoFramesFile);
  });

  it("removedAttributes", async () => {
    await createJuno();
    must(objJuno["00090000"]).be.undefined();
  });

  it("check values", async () => {
    await createJuno();
    must(objJuno["00180022"]).eql({
      vr: "CS",
      Value: ["SAT_GEMS\\NPW \\VB_GEMS \\PFF \\SP"],
    });
  });

  it("check vr types", async () => {
    await createJuno();
    const vrs = {};
    for (const key of Object.keys(objJuno)) {
      const item = objJuno[key];
      const { vr } = item;
      if (vrs[vr]) continue;
      vrs[vr] = key;
    }

    objJuno["00181310"].vr.must.eql("US");
    Tags.getValue(objJuno, "00181310").must.eql([0, 512, 192, 0]);
  });
});
