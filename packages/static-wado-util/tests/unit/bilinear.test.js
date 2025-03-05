const must = require("must");
const { bilinear } = require("../../lib/image/bilinear");

describe("bilinear tests", () => {
  it("identityTransform", async () => {
    const src = createImage(5, 7);
    for (let y = 0; y < src.rows; y++) {
      for (let x = 0; x < src.columns; x++) {
        src.data[y * src.columns + x] = y * src.columns + x;
      }
    }
    const dest = createImage(5, 7);
    bilinear(src, dest);
    for (let y = 0; y < src.rows; y++) {
      for (let x = 0; x < src.columns; x++) {
        must(dest.data[y * src.columns + x]).be.equal(y * src.columns + x);
      }
    }
  });

  it("fixedScale", async () => {
    const src = createImage(2, 2);
    src.data[0] = 5;
    src.data[1] = 12;
    src.data[2] = 65_535;
    src.data[3] = 32_768;
    const dest = createImage(3, 5);
    bilinear(src, dest);
    must(dest.data[0]).equal(src.data[0]);
    must(dest.data[1]).equal(Math.floor(src.data[0] / 2 + src.data[1] / 2));
    must(dest.data[3]).equal(
      Math.floor(src.data[0] * 0.75 + src.data[2] * 0.25),
    );
    must(dest.data[4]).equal(
      Math.floor(
        (src.data[0] * 0.75) / 2 +
          (src.data[1] * 0.75) / 2 +
          (src.data[2] * 0.25) / 2 +
          (src.data[3] * 0.25) / 2,
      ),
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
