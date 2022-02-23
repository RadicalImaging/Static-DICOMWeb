const fs = require("fs");
const asyncIteratorToBuffer = require("../../lib/operation/adapter/asyncIterableToBuffer");

describe("asyncIterableToBuffer", () => {
  let dicomp10stream;

  beforeEach(async () => {
    dicomp10stream = fs.createReadStream(`${TEST_DATA_PATH}/dcm/Juno/1.3.6.1.4.1.25403.345050719074.3824.20170125113606.8`);
  });

  it("copies child elements correctly", async () => {
    const buffer = await asyncIteratorToBuffer(dicomp10stream);
    const dest = new Uint8Array(132);
    // D character in DICM prefix
    buffer[128].must.be.eql(68);
    buffer.copy(dest, 0, 0, 132);
    // Should have copied

    dest[128].must.be.eql(buffer[128]);
  });

  it("re-assembles buffers correctly", async () => {
    const buffer = await asyncIteratorToBuffer(dicomp10stream);
    const start = 3215 + 8;
    const len = 526728 - start;

    const subBuffer = buffer.slice(start, start + len);
    for (let i = 0; i < len; i++) {
      const bufVal = buffer[i + start];
      const subVal = subBuffer[i];
      if (bufVal != subVal) {
        console.log(`At position ${i} relative to ${start} buffer is ${bufVal} but subVal is ${subVal}`);
      }
      buffer[i + start].must.be.eql(subBuffer[i]);
    }
  });
});
