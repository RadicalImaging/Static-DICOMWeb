const must = require("must");
const { bilinear } = require("../../lib/image/bilinear");

describe("bilinear tests", () => {
  it('identityTransform', async () => {
    const src = createImage(5, 7);
    for (let y = 0; y < src.rows; y++) {
      for (let x = 0; x < src.columns; x++) {
        src.pixelData[y * src.columns + x] = y * src.columns + x;
      }
    }
    const dest = createImage(5, 7);
    bilinear(src, dest);
    for (let y = 0; y < src.rows; y++) {
      for (let x = 0; x < src.columns; x++) {
        must(dest.pixelData[y * src.columns + x]).be.equal(y * src.columns + x);
      }
    }
  });

  it('fixedScale', async () => {
    const src = createImage(2, 2);
    src.pixelData[0] = 5;
    src.pixelData[1] = 12;
    src.pixelData[2] = 65_535;
    src.pixelData[3] = 32_768;
    const dest = createImage(3, 5);
    bilinear(src, dest);
    must(dest.pixelData[0]).equal(src.pixelData[0]);
    must(dest.pixelData[1]).equal(Math.floor(src.pixelData[0] / 2 + src.pixelData[1] / 2));
    must(dest.pixelData[3]).equal(Math.floor(src.pixelData[0] * 0.75 + src.pixelData[2] * 0.25));
    must(dest.pixelData[4]).equal(
      Math.floor(
        (src.pixelData[0] * 0.75) / 2 +
          (src.pixelData[1] * 0.75) / 2 +
          (src.pixelData[2] * 0.25) / 2 +
          (src.pixelData[3] * 0.25) / 2
      )
    );
  });
});

function createImage(columns, rows) {
  return {
    rows,
    columns,
    pixelData: new Uint16Array(columns * rows),
  };
}
