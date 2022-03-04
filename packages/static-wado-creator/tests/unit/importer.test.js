// const fs = require("fs");
const StaticWado = require("../../lib");

describe("index", () => {
  // let dicomp10stream;

  const importer = new StaticWado({
    isStudyData: true,
    isGroup: true,
  });

  beforeEach(async () => {
    // dicomp10stream = fs.createReadStream('../dagcom-test-data/dicom/WG04/compsamples_refanddir/IMAGES/REF/CT1_UNC')
    /*
    dicomp10stream = await fs.createReadStream(
      `${TEST_DATA_PATH}/dcm/MisterMr/1.2.840.113619.2.5.1762583153.215519.978957063.101`
    );
    */
    // dicomp10stream = fs.createReadStream('../dagcom-test-data/dicom/encoding-variants/pixel-data/US_MF_RGB.implicit_little_endian.dcm')
  });

  it("exports", () => {
    importer.must.not.be.undefined();
  });

  // TODO - add integration tests
});
