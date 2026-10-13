const { createCanvas } = require('canvas');
// The package entry installs the window shim the cornerstone CPU renderer needs.
const { getRenderedBuffer } = require('@radicalimaging/cs3d');
const { createImage } = require('@radicalimaging/cs3d/image/createImage');

const EXPLICIT_LITTLE_ENDIAN = '1.2.840.10008.1.2.1';
const CR_IMAGE_STORAGE = '1.2.840.10008.5.1.4.1.1.1';
const CT_IMAGE_STORAGE = '1.2.840.10008.5.1.4.1.1.2';
const MR_IMAGE_STORAGE = '1.2.840.10008.5.1.4.1.1.4';
const ENHANCED_CT_IMAGE_STORAGE = '1.2.840.10008.5.1.4.1.1.2.1';

const base64 = typedArray => Buffer.from(typedArray.buffer).toString('base64');

function lutItem({
  descriptor = [4, 10, 16],
  descriptorVR = 'US',
  data = new Uint16Array([0, 1000, 2000, 4095]),
} = {}) {
  return {
    '00283002': Array.isArray(descriptor) ? { vr: descriptorVR, Value: descriptor } : descriptor,
    '00283003': { vr: 'LO', Value: ['TEST'] },
    '00283006':
      data instanceof Uint16Array || data instanceof Uint8Array
        ? { vr: 'OW', InlineBinary: base64(data) }
        : { vr: 'OW', ...data },
  };
}

function metadata({
  sopClassUID = CR_IMAGE_STORAGE,
  photometric = 'MONOCHROME1',
  pixelRepresentation = 0,
  extra = {},
} = {}) {
  return {
    '00080016': { vr: 'UI', Value: [sopClassUID] },
    '00280002': { vr: 'US', Value: [1] },
    '00280004': { vr: 'CS', Value: [photometric] },
    '00280010': { vr: 'US', Value: [4] },
    '00280011': { vr: 'US', Value: [4] },
    '00280100': { vr: 'US', Value: [16] },
    '00280101': { vr: 'US', Value: [12] },
    '00280102': { vr: 'US', Value: [11] },
    '00280103': { vr: 'US', Value: [pixelRepresentation] },
    '00281050': { vr: 'DS', Value: [2048] },
    '00281051': { vr: 'DS', Value: [4096] },
    ...extra,
  };
}

const withVOILUT = (item, options = {}) =>
  metadata({ ...options, extra: { ...options.extra, '00283010': { vr: 'SQ', Value: [item] } } });

const pixelData = (values = new Array(16).fill(0).map((_, i) => i * 250)) =>
  new Uint16Array(values);

const imageFrom = md => createImage(EXPLICIT_LITTLE_ENDIAN, pixelData(), md, createCanvas(4, 4));

describe('Modality and VOI LUT Sequences', () => {
  it('passes an inline-binary VOI LUT to cornerstone as a lut array', () => {
    expect(imageFrom(withVOILUT(lutItem())).voiLUT).toEqual({
      id: '1',
      firstValueMapped: 10,
      numBitsPerEntry: 16,
      lut: [0, 1000, 2000, 4095],
    });
  });

  it('reads a LUT Descriptor that arrives as InlineBinary', () => {
    const descriptor = { vr: 'US|SS', InlineBinary: base64(new Uint16Array([4, 10, 16])) };

    expect(imageFrom(withVOILUT(lutItem({ descriptor }))).voiLUT).toMatchObject({
      firstValueMapped: 10,
      lut: [0, 1000, 2000, 4095],
    });
  });

  it('reads LUT Data that arrives as decoded values', () => {
    const data = { vr: 'US', Value: [0, 1000, 2000, 4095] };

    expect(imageFrom(withVOILUT(lutItem({ data }))).voiLUT.lut).toEqual([0, 1000, 2000, 4095]);
  });

  it('keeps LUT entries unsigned for signed pixel data', () => {
    const data = new Uint16Array([0, 20000, 40000, 65535]);

    expect(imageFrom(withVOILUT(lutItem({ data }), { pixelRepresentation: 1 })).voiLUT.lut).toEqual(
      [0, 20000, 40000, 65535]
    );
  });

  // 0xfc18 is -1000 when the VOI LUT is indexed by signed values, 64536 otherwise. Each
  // row pins one part of the rule: getting that part wrong fails the row. Signed pixels
  // here have 12 bits stored, so the lowest stored value is -2048.
  const SIGNED = -1000;
  const UNSIGNED = 64536;
  const rescale = (intercept, slope = 1) => ({
    '00281052': { vr: 'DS', Value: [intercept] },
    '00281053': { vr: 'DS', Value: [slope] },
  });
  const noValue = { '00281052': { vr: 'DS' }, '00281053': { vr: 'DS' } };
  const modalityLUTSequence = items => ({ '00283000': { vr: 'SQ', Value: items } });
  const MR = MR_IMAGE_STORAGE;
  it.each([
    [
      'CT, ahead of a positive rescale',
      { sopClassUID: CT_IMAGE_STORAGE, extra: rescale(5000) },
      SIGNED,
    ],
    ['Enhanced CT', { sopClassUID: ENHANCED_CT_IMAGE_STORAGE, extra: rescale(5000) }, SIGNED],
    ['a negative intercept on unsigned pixels', { sopClassUID: MR, extra: rescale(-1000) }, SIGNED],
    ['a rescale written as strings', { sopClassUID: MR, extra: rescale('-1000', '1') }, SIGNED],
    [
      'a positive intercept that the lowest signed stored value outweighs',
      { sopClassUID: MR, pixelRepresentation: 1, extra: rescale(1000) },
      SIGNED,
    ],
    [
      'a positive intercept above the signed range',
      { sopClassUID: MR, pixelRepresentation: 1, extra: rescale(5000) },
      UNSIGNED,
    ],
    [
      'a negative slope on signed pixels',
      { sopClassUID: MR, pixelRepresentation: 1, extra: rescale(0, -1) },
      UNSIGNED,
    ],
    [
      'a rescale with no values on signed pixels',
      { sopClassUID: MR, pixelRepresentation: 1, extra: noValue },
      SIGNED,
    ],
    [
      'a Modality LUT Sequence on signed pixels',
      { pixelRepresentation: 1, extra: modalityLUTSequence([lutItem({ descriptor: [4, 0, 16] })]) },
      UNSIGNED,
    ],
    [
      'an empty Modality LUT Sequence on signed pixels',
      { pixelRepresentation: 1, extra: modalityLUTSequence([]) },
      SIGNED,
    ],
    ['signed pixels and no rescale', { pixelRepresentation: 1 }, SIGNED],
    ['unsigned pixels and no rescale', {}, UNSIGNED],
  ])('reads the VOI first value mapped for %s', (_, options, expected) => {
    const md = withVOILUT(lutItem({ descriptor: [4, 0xfc18, 16] }), options);

    expect(imageFrom(md).voiLUT.firstValueMapped).toBe(expected);
  });

  it('keeps a positive first value mapped when the modality output is signed', () => {
    const md = withVOILUT(lutItem({ descriptor: [4, 10, 16] }), { sopClassUID: CT_IMAGE_STORAGE });

    expect(imageFrom(md).voiLUT.firstValueMapped).toBe(10);
  });

  it.each(['SS', 'US'])(
    'reads a decoded negative first value mapped when the descriptor is labelled %s',
    descriptorVR => {
      const md = withVOILUT(lutItem({ descriptor: [4, -1000, 16], descriptorVR }));

      expect(imageFrom(md).voiLUT.firstValueMapped).toBe(-1000);
    }
  );

  it('reads 8 bit entries stored one per word', () => {
    const data = new Uint16Array([0, 80, 160, 255]);

    expect(imageFrom(withVOILUT(lutItem({ descriptor: [4, 0, 8], data }))).voiLUT.lut).toEqual([
      0, 80, 160, 255,
    ]);
  });

  it('reads 8 bit entries stored one per byte', () => {
    const data = new Uint8Array([0, 80, 160, 255]);

    expect(imageFrom(withVOILUT(lutItem({ descriptor: [4, 0, 8], data }))).voiLUT.lut).toEqual([
      0, 80, 160, 255,
    ]);
  });

  it('reads 8 bit entries packed two per US word', () => {
    const data = { vr: 'US', Value: [80 << 8, (255 << 8) | 160] };

    expect(imageFrom(withVOILUT(lutItem({ descriptor: [4, 0, 8], data }))).voiLUT.lut).toEqual([
      0, 80, 160, 255,
    ]);
  });

  it('reads 65536 entries when the descriptor says 0', () => {
    const data = new Uint16Array(65536).map((_, i) => i);

    const { lut } = imageFrom(withVOILUT(lutItem({ descriptor: [0, 0, 16], data }))).voiLUT;

    expect(lut.length).toBe(65536);
    expect(lut[65535]).toBe(65535);
  });

  it('reads 65536 packed 8 bit entries when the descriptor says 0', () => {
    const data = new Uint8Array(65536).map((_, i) => i & 0xff);

    const { lut } = imageFrom(withVOILUT(lutItem({ descriptor: [0, 0, 8], data }))).voiLUT;

    expect(lut.length).toBe(65536);
    expect(lut.slice(254, 258)).toEqual([254, 255, 0, 1]);
  });

  it('ignores LUT Data beyond the number of entries', () => {
    const data = new Uint16Array([0, 1000, 2000, 4095, 7, 7]);

    expect(imageFrom(withVOILUT(lutItem({ data }))).voiLUT.lut).toEqual([0, 1000, 2000, 4095]);
  });

  it.each([
    ['a short descriptor', { descriptor: [4, 10] }],
    ['LUT Data too short for one 16 bit entry', { data: new Uint8Array([7]) }],
    ['LUT Data that is not inline', { data: { BulkDataURI: 'instances/1/bulkdata/00283006' } }],
  ])('leaves no VOI LUT, so the window applies, for %s', (_, item) => {
    expect(imageFrom(withVOILUT(lutItem(item))).voiLUT).toBeFalsy();
  });

  it('reads LUT Data with a single decoded value', () => {
    const data = { vr: 'US', Value: [4095] };

    expect(imageFrom(withVOILUT(lutItem({ descriptor: [1, 0, 16], data }))).voiLUT.lut).toEqual([
      4095,
    ]);
  });

  it('converts a Modality LUT Sequence the same way', () => {
    const md = metadata({
      photometric: 'MONOCHROME2',
      extra: { '00283000': { vr: 'SQ', Value: [lutItem({ descriptor: [4, 0, 16] })] } },
    });

    expect(imageFrom(md).modalityLUT).toEqual({
      id: '1',
      firstValueMapped: 0,
      numBitsPerEntry: 16,
      lut: [0, 1000, 2000, 4095],
    });
  });

  it.each([
    [1, -1000],
    [0, 64536],
  ])(
    'reads the Modality LUT first value mapped by pixel representation %i',
    (pixelRepresentation, expected) => {
      const md = metadata({
        pixelRepresentation,
        extra: { '00283000': { vr: 'SQ', Value: [lutItem({ descriptor: [4, 0xfc18, 16] })] } },
      });

      const { modalityLUT } = imageFrom(md);

      // A positive start is moved to 0 by padding, so the start shows in the padding length.
      expect(modalityLUT.firstValueMapped + modalityLUT.lut.length - 4).toBe(expected);
    }
  );

  it('pads a Modality LUT so it starts at 0', () => {
    const md = metadata({
      extra: {
        '00283000': {
          vr: 'SQ',
          Value: [
            lutItem({ descriptor: [4, 3, 16], data: new Uint16Array([7, 1000, 2000, 4095]) }),
          ],
        },
      },
    });

    expect(imageFrom(md).modalityLUT).toMatchObject({
      firstValueMapped: 0,
      lut: [7, 7, 7, 7, 1000, 2000, 4095],
    });
  });

  it.each([
    ['a fractional slope', rescale(0, 0.5)],
    ['a fractional intercept', rescale(0.5, 1)],
  ])('leaves no VOI LUT, so the window applies, for %s', (_, extra) => {
    expect(imageFrom(withVOILUT(lutItem(), { extra })).voiLUT).toBeFalsy();
  });

  it.each([
    ['an integer rescale written as strings', rescale('-10', '1')],
    [
      'a fractional rescale behind a Modality LUT',
      {
        ...rescale(0, 0.5),
        '00283000': { vr: 'SQ', Value: [lutItem({ descriptor: [4, 0, 16] })] },
      },
    ],
  ])('keeps the VOI LUT for %s', (_, extra) => {
    expect(imageFrom(withVOILUT(lutItem(), { extra })).voiLUT).toMatchObject({
      lut: [0, 1000, 2000, 4095],
    });
  });

  // Renders a 4x4 image of one stored value and returns the red channel at the centre.
  async function renderedCentre(md, storedValue) {
    let rendered;
    await getRenderedBuffer(
      EXPLICIT_LITTLE_ENDIAN,
      pixelData(new Array(16).fill(storedValue)),
      md,
      (buffer, canvas) => {
        rendered = { buffer, pixel: canvas.getContext('2d').getImageData(8, 8, 1, 1).data };
      },
      { quality: 0.6, width: 16, height: 16 }
    );
    expect(rendered.buffer.length).toBeGreaterThan(0);
    return rendered.pixel[0];
  }

  it('renders a thumbnail through the VOI LUT', async () => {
    // Every pixel maps to the LUT's top entry, so the thumbnail is white. The window alone
    // would render these low values near black.
    const md = withVOILUT(
      lutItem({ descriptor: [4, 0, 16], data: new Uint16Array([4095, 4095, 4095, 4095]) }),
      { photometric: 'MONOCHROME2' }
    );

    expect(await renderedCentre(md, 2)).toBeGreaterThan(200);
  });

  it('renders a thumbnail through a Modality LUT that starts above 0', async () => {
    // Stored value 13 is the last entry of a LUT starting at 10, which maps to the top of
    // the window. Read as lut[13] of the unpadded LUT, it would fall off the end.
    const md = metadata({
      photometric: 'MONOCHROME2',
      extra: {
        '00283000': {
          vr: 'SQ',
          Value: [lutItem({ descriptor: [4, 10, 16], data: new Uint16Array([0, 0, 0, 4095]) })],
        },
      },
    });

    expect(await renderedCentre(md, 13)).toBeGreaterThan(200);
  });
});
