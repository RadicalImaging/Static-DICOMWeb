import { boxAverage, createPixelValueModel } from '@radicalimaging/static-wado-util';
import { boxAverage2x2x2, halveSize } from '../lib/alternates/boxFilter3d.mjs';

describe('boxAverage2x2x2', () => {
  it('averages a known 2x2x2 input', () => {
    // Two 2x2 planes; the eight values average to 4.5, which rounds to 5
    const planes = [new Uint16Array([1, 2, 3, 4]), new Uint16Array([5, 6, 7, 8])];
    const dest = new Uint16Array(1);

    boxAverage2x2x2(
      { planes, columns: 2, rows: 2, model: undefined },
      {
        pixelData: dest,
        columns: 1,
        rows: 1,
      }
    );

    expect(dest[0]).toBe(5);
  });

  it('reduces a 4x4x2 volume to 2x2x1 by independent 2x2x2 boxes', () => {
    // Plane values are the flat index; plane 2 adds 100 to each
    const planeA = new Uint16Array(16);
    const planeB = new Uint16Array(16);
    for (let i = 0; i < 16; i++) {
      planeA[i] = i;
      planeB[i] = i + 100;
    }
    const dest = new Uint16Array(4);

    boxAverage2x2x2(
      { planes: [planeA, planeB], columns: 4, rows: 4 },
      {
        pixelData: dest,
        columns: 2,
        rows: 2,
      }
    );

    // Top-left box: planeA 0,1,4,5 and planeB 100,101,104,105 -> mean 52.5 -> 53
    expect(Array.from(dest)).toEqual([53, 55, 61, 63]);
  });

  it('averages only the source plane when z is odd', () => {
    const planes = [new Uint16Array([10, 20, 30, 40])];
    const dest = new Uint16Array(1);

    boxAverage2x2x2({ planes, columns: 2, rows: 2 }, { pixelData: dest, columns: 1, rows: 1 });

    expect(dest[0]).toBe(25);
  });

  it('keeps the edge samples of an odd sized axis', () => {
    // 3 columns reduce to 2; the last destination column averages the single leftover column
    const planes = [new Uint16Array([1, 3, 9, 1, 3, 9])];
    const dest = new Uint16Array(2);

    boxAverage2x2x2({ planes, columns: 3, rows: 2 }, { pixelData: dest, columns: 2, rows: 1 });

    expect(Array.from(dest)).toEqual([2, 9]);
    expect(halveSize(3)).toBe(2);
  });

  it('excludes padding values from the average', () => {
    const model = createPixelValueModel({
      bitsAllocated: 16,
      bitsStored: 16,
      pixelRepresentation: 0,
      pixelPaddingValue: 0,
    });
    // Six of the eight samples are padding; the average must be of the other two only
    const planes = [new Uint16Array([100, 0, 0, 0]), new Uint16Array([200, 0, 0, 0])];
    const dest = new Uint16Array(1);

    boxAverage2x2x2(
      { planes, columns: 2, rows: 2, model },
      {
        pixelData: dest,
        columns: 1,
        rows: 1,
      }
    );

    expect(dest[0]).toBe(150);
  });

  it('excludes a padding range, not just the padding value', () => {
    const model = createPixelValueModel({
      bitsAllocated: 16,
      pixelRepresentation: 0,
      pixelPaddingValue: 0,
      pixelPaddingRangeLimit: 10,
    });
    const planes = [new Uint16Array([40, 5, 10, 0]), new Uint16Array([60, 3, 7, 1])];
    const dest = new Uint16Array(1);

    boxAverage2x2x2(
      { planes, columns: 2, rows: 2, model },
      {
        pixelData: dest,
        columns: 1,
        rows: 1,
      }
    );

    expect(dest[0]).toBe(50);
  });

  it('writes padding when the whole box is padding', () => {
    const model = createPixelValueModel({
      bitsAllocated: 16,
      pixelRepresentation: 0,
      pixelPaddingValue: 7,
    });
    const planes = [new Uint16Array([7, 7, 7, 7])];
    const dest = new Uint16Array([999]);

    boxAverage2x2x2(
      { planes, columns: 2, rows: 2, model },
      {
        pixelData: dest,
        columns: 1,
        rows: 1,
      }
    );

    expect(dest[0]).toBe(7);
  });

  it('averages signed values as signed', () => {
    const model = createPixelValueModel({ bitsAllocated: 16, pixelRepresentation: 1 });
    const planes = [new Int16Array([-1000, -1000, 1000, 1000])];
    const dest = new Int16Array(1);

    boxAverage2x2x2(
      { planes, columns: 2, rows: 2, model },
      {
        pixelData: dest,
        columns: 1,
        rows: 1,
      }
    );

    expect(dest[0]).toBe(0);
  });

  it('picks a label rather than averaging one, for a label map', () => {
    const model = createPixelValueModel({ bitsAllocated: 8, isLabelMap: true });
    // Segments 1 and 3 in one box: the mean would be segment 2, which is neither of them
    const planes = [new Uint8Array([1, 1, 3, 3]), new Uint8Array([1, 3, 3, 1])];
    const dest = new Uint8Array(1);

    boxAverage2x2x2(
      { planes, columns: 2, rows: 2, model },
      {
        pixelData: dest,
        columns: 1,
        rows: 1,
      }
    );

    expect([1, 3]).toContain(dest[0]);
  });

  it('keeps a thin segment visible instead of diluting it', () => {
    const model = createPixelValueModel({ bitsAllocated: 8, isLabelMap: true });
    // One occupied voxel out of eight; an average would round it away to background
    const planes = [new Uint8Array([0, 0, 0, 0]), new Uint8Array([0, 0, 0, 5])];
    const dest = new Uint8Array(1);

    boxAverage2x2x2(
      { planes, columns: 2, rows: 2, model },
      {
        pixelData: dest,
        columns: 1,
        rows: 1,
      }
    );

    expect(dest[0]).toBe(5);
  });

  it('reduces an all background box of a label map to background', () => {
    const model = createPixelValueModel({ bitsAllocated: 8, isLabelMap: true });
    const planes = [new Uint8Array([0, 0, 0, 0])];
    const dest = new Uint8Array([9]);

    boxAverage2x2x2(
      { planes, columns: 2, rows: 2, model },
      {
        pixelData: dest,
        columns: 1,
        rows: 1,
      }
    );

    expect(dest[0]).toBe(0);
  });

  it('averages a FRACTIONAL segmentation, whose samples are occupancy not labels', () => {
    const model = createPixelValueModel({
      bitsAllocated: 8,
      sopClassUid: '1.2.840.10008.5.1.4.1.1.66.4',
      segmentationType: 'FRACTIONAL',
    });
    expect(model.isLabelMap).toBe(false);

    const planes = [new Uint8Array([0, 0, 100, 100])];
    const dest = new Uint8Array(1);

    boxAverage2x2x2(
      { planes, columns: 2, rows: 2, model },
      {
        pixelData: dest,
        columns: 1,
        rows: 1,
      }
    );

    expect(dest[0]).toBe(50);
  });

  it('derives isLabelMap from the SOP Class', () => {
    const binarySeg = createPixelValueModel({
      bitsAllocated: 8,
      sopClassUid: '1.2.840.10008.5.1.4.1.1.66.4',
      segmentationType: 'BINARY',
    });
    const labelMapSeg = createPixelValueModel({
      bitsAllocated: 8,
      sopClassUid: '1.2.840.10008.5.1.4.1.1.66.7',
    });
    const ct = createPixelValueModel({
      bitsAllocated: 16,
      sopClassUid: '1.2.840.10008.5.1.4.1.1.2',
    });

    expect(binarySeg.isLabelMap).toBe(true);
    expect(labelMapSeg.isLabelMap).toBe(true);
    expect(ct.isLabelMap).toBe(false);
  });

  it('interprets a stored sample using BitsStored and HighBit', () => {
    // 12 bits stored in the low bits of a 16 bit word, signed: 0xFFF is -1, 0x001 is 1
    const model = createPixelValueModel({
      bitsAllocated: 16,
      bitsStored: 12,
      highBit: 11,
      pixelRepresentation: 1,
    });

    expect(model.normalize(0xfff)).toBe(-1);
    expect(model.normalize(0x001)).toBe(1);
    expect(model.normalize(0x800)).toBe(-2048);
    expect(model.pack(-1) & 0xffff).toBe(0xfff);
    expect(model.pack(model.normalize(0x7ff))).toBe(0x7ff);
  });
});

describe('boxAverage (2D)', () => {
  it('averages a 4x4 box, which is the thumbnail reduction', () => {
    const columns = 8;
    const rows = 8;
    const pixelData = new Uint16Array(columns * rows);
    for (let i = 0; i < pixelData.length; i++) {
      pixelData[i] = i;
    }
    const dest = new Uint16Array(4);

    boxAverage(
      { rows, columns, pixelData, samplesPerPixel: 1 },
      { rows: 2, columns: 2, pixelData: dest }
    );

    // Top-left 4x4 box holds rows 0-3 of columns 0-3: mean of 0..3,8..11,16..19,24..27 = 13.5 -> 14
    expect(Array.from(dest)).toEqual([14, 18, 46, 50]);
  });

  it('leaves padding out of the reduced image', () => {
    const model = createPixelValueModel({
      bitsAllocated: 16,
      pixelRepresentation: 0,
      pixelPaddingValue: 0,
    });
    const columns = 4;
    const rows = 4;
    const pixelData = new Uint16Array(columns * rows);
    // One real sample of 400 in a field of padding
    pixelData[0] = 400;
    const dest = new Uint16Array(1);

    boxAverage(
      { rows, columns, pixelData, samplesPerPixel: 1, pixelValueModel: model },
      { rows: 1, columns: 1, pixelData: dest }
    );

    expect(dest[0]).toBe(400);
  });

  it('picks a label for a label map thumbnail rather than averaging', () => {
    const model = createPixelValueModel({ bitsAllocated: 8, isLabelMap: true });
    const columns = 4;
    const rows = 4;
    const pixelData = new Uint8Array(columns * rows);
    // A single occupied pixel; averaging over 16 would round it to background
    pixelData[5] = 7;
    const dest = new Uint8Array(1);

    boxAverage(
      { rows, columns, pixelData, samplesPerPixel: 1, pixelValueModel: model },
      { rows: 1, columns: 1, pixelData: dest }
    );

    expect(dest[0]).toBe(7);
  });

  it('averages each colour sample independently', () => {
    // 2x1 RGB: red pair (10, 30), green pair (20, 40), blue pair (60, 80)
    const pixelData = new Uint8Array([10, 20, 60, 30, 40, 80]);
    const dest = new Uint8Array(3);

    boxAverage(
      { rows: 1, columns: 2, pixelData, samplesPerPixel: 3 },
      { rows: 1, columns: 1, pixelData: dest }
    );

    expect(Array.from(dest)).toEqual([20, 30, 70]);
  });
});
