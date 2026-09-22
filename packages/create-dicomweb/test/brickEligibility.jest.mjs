import {
  UNCOMPRESSED_TRANSFER_SYNTAX_UIDS,
  isUncompressedGrayscale,
  isUncompressedTransferSyntax,
} from '../lib/alternates/imageAttributes.mjs';
import { MIN_BRICK_SLICES, buildSeriesGeometry } from '../lib/alternates/seriesGeometry.mjs';

/**
 * Builds instance metadata for one axial slice at a given z, as DICOM JSON.
 * @param {Object} params - Instance parameters
 * @returns {Object} - Instance metadata
 */
function instance({
  z,
  index,
  samplesPerPixel = 1,
  photometricInterpretation = 'MONOCHROME2',
  orientation = [1, 0, 0, 0, 1, 0],
  x = 0,
  y = 0,
  numberOfFrames,
}) {
  const metadata = {
    '00080018': { vr: 'UI', Value: [`1.2.3.${index}`] },
    '00200013': { vr: 'IS', Value: [index] },
    '00280002': { vr: 'US', Value: [samplesPerPixel] },
    '00280004': { vr: 'CS', Value: [photometricInterpretation] },
    '00280010': { vr: 'US', Value: [64] },
    '00280011': { vr: 'US', Value: [64] },
    '00280100': { vr: 'US', Value: [16] },
    '00280101': { vr: 'US', Value: [16] },
    '00280103': { vr: 'US', Value: [0] },
    '00200032': { vr: 'DS', Value: [x, y, z] },
    '00200037': { vr: 'DS', Value: orientation },
    '00083002': { Value: ['1.2.840.10008.1.2.1'] },
  };
  if (numberOfFrames !== undefined) {
    metadata['00280008'] = { vr: 'IS', Value: [numberOfFrames] };
  }
  return metadata;
}

/**
 * Builds a regular axial stack.
 * @param {number} count - Number of slices
 * @param {number} [spacing=1] - Slice spacing in mm
 * @param {Object} [overrides] - Per-instance overrides
 * @returns {Object[]}
 */
function stack(count, spacing = 1, overrides = {}) {
  return Array.from({ length: count }, (_, index) =>
    instance({ z: index * spacing, index, ...overrides })
  );
}

describe('brick eligibility', () => {
  it('accepts a regular grayscale axial stack', () => {
    const geometry = buildSeriesGeometry(stack(20));

    expect(geometry.eligible).toBe(true);
    expect(geometry.sizeZ).toBe(20);
    expect(geometry.spacing).toBeCloseTo(1);
    expect(geometry.nonSpatialSize).toBe(1);
    expect(geometry.volumes).toHaveLength(1);
    expect(geometry.volumes[0].frames).toHaveLength(20);
    expect(geometry.axes.map(axis => axis.name)).toEqual(['x', 'y', 'z']);
  });

  it('rejects a series whose third index is temporal rather than spatial', () => {
    // A cine acquisition: every frame at the same table position
    const cine = Array.from({ length: 40 }, (_, index) => instance({ z: 0, index }));
    const geometry = buildSeriesGeometry(cine);

    expect(geometry.eligible).toBe(false);
    expect(geometry.reason).toMatch(/third index is temporal/);
  });

  it('rejects a multiframe instance whose frames share one position', () => {
    const geometry = buildSeriesGeometry([instance({ z: 0, index: 1, numberOfFrames: 60 })]);

    expect(geometry.eligible).toBe(false);
    expect(geometry.reason).toMatch(/third index is temporal/);
  });

  it('rejects irregular slice spacing', () => {
    const instances = stack(20);
    // Push one slice off the grid by a quarter of the pitch
    instances[10]['00200032'].Value = [0, 0, 10.25];
    const geometry = buildSeriesGeometry(instances);

    expect(geometry.eligible).toBe(false);
    expect(geometry.reason).toMatch(/irregular slice spacing/);
  });

  it('rejects a sheared stack, as a gantry tilted acquisition produces', () => {
    // Each slice steps 1mm through plane but also 0.2mm in plane
    const instances = Array.from({ length: 20 }, (_, index) =>
      instance({ z: index, x: index * 0.2, index })
    );
    const geometry = buildSeriesGeometry(instances);

    expect(geometry.eligible).toBe(false);
    expect(geometry.reason).toMatch(/sheared/);
  });

  it('rejects non-coplanar frames', () => {
    const instances = stack(20);
    instances[5]['00200037'].Value = [1, 0, 0, 0, 0.9, 0.1];
    const geometry = buildSeriesGeometry(instances);

    expect(geometry.eligible).toBe(false);
    expect(geometry.reason).toMatch(/not coplanar/);
  });

  it('rejects colour series', () => {
    const geometry = buildSeriesGeometry(
      stack(20, 1, { samplesPerPixel: 3, photometricInterpretation: 'RGB' })
    );

    expect(geometry.eligible).toBe(false);
    expect(geometry.reason).toMatch(/not grayscale/);
  });

  it('rejects palette colour, which is one sample but not grayscale', () => {
    const geometry = buildSeriesGeometry(
      stack(20, 1, { photometricInterpretation: 'PALETTE COLOR' })
    );

    expect(geometry.eligible).toBe(false);
    expect(geometry.reason).toMatch(/not grayscale/);
  });

  it(`rejects fewer than ${MIN_BRICK_SLICES} slices`, () => {
    const geometry = buildSeriesGeometry(stack(MIN_BRICK_SLICES - 1));

    expect(geometry.eligible).toBe(false);
    expect(geometry.reason).toMatch(/fewer than/);
  });

  it('rejects a single frame series', () => {
    const geometry = buildSeriesGeometry([instance({ z: 0, index: 1 })]);

    expect(geometry.eligible).toBe(false);
    expect(geometry.reason).toMatch(/single frame/);
  });

  it('indexes a 4D series rather than subsampling its time axis', () => {
    // Two acquisitions of the same 20 slice stack
    const instances = [
      ...stack(20),
      ...stack(20).map((metadata, index) => ({
        ...metadata,
        '00080018': { vr: 'UI', Value: [`1.2.3.second.${index}`] },
      })),
    ];
    const geometry = buildSeriesGeometry(instances);

    expect(geometry.eligible).toBe(true);
    expect(geometry.sizeZ).toBe(20);
    expect(geometry.nonSpatialSize).toBe(2);
    expect(geometry.volumes).toHaveLength(2);
    const timeAxis = geometry.axes.find(axis => axis.name === 't');
    expect(timeAxis).toEqual({ name: 't', type: 'time', size: 2, subsample: false });
  });

  it('rejects ragged non-spatial sampling', () => {
    const instances = [...stack(20), instance({ z: 0, index: 100 })];
    const geometry = buildSeriesGeometry(instances);

    expect(geometry.eligible).toBe(false);
    expect(geometry.reason).toMatch(/ragged/);
  });
});

describe('uncompressed grayscale predicate', () => {
  const grayscale = {
    samplesPerPixel: 1,
    photometricInterpretation: 'MONOCHROME2',
    bitsAllocated: 16,
  };

  it('accepts every native transfer syntax', () => {
    for (const tsuid of UNCOMPRESSED_TRANSFER_SYNTAX_UIDS) {
      expect(isUncompressedTransferSyntax(tsuid)).toBe(true);
      expect(isUncompressedGrayscale(grayscale, tsuid).ok).toBe(true);
    }
  });

  it('accepts MONOCHROME1 as well as MONOCHROME2', () => {
    expect(
      isUncompressedGrayscale(
        { ...grayscale, photometricInterpretation: 'MONOCHROME1' },
        '1.2.840.10008.1.2.1'
      ).ok
    ).toBe(true);
  });

  it('accepts 8 bit as well as 16 bit', () => {
    expect(
      isUncompressedGrayscale({ ...grayscale, bitsAllocated: 8 }, '1.2.840.10008.1.2.1').ok
    ).toBe(true);
  });

  it('rejects depths JPEG-LS cannot carry', () => {
    // A 1 bit segmentation bitmap is grayscale and uncompressed but has no JPEG-LS form
    const oneBit = isUncompressedGrayscale(
      { ...grayscale, bitsAllocated: 1 },
      '1.2.840.10008.1.2.1'
    );
    expect(oneBit.ok).toBe(false);
    expect(oneBit.reason).toMatch(/BitsAllocated 1/);
    expect(
      isUncompressedGrayscale({ ...grayscale, bitsAllocated: 32 }, '1.2.840.10008.1.2.1').ok
    ).toBe(false);
  });

  it('rejects already-compressed transfer syntaxes', () => {
    for (const tsuid of [
      '1.2.840.10008.1.2.4.80', // JPEG-LS lossless - the target, so nothing to do
      '1.2.840.10008.1.2.4.70', // JPEG lossless
      '1.2.840.10008.1.2.4.50', // JPEG baseline
      '1.2.840.10008.1.2.4.90', // JPEG 2000
      '1.2.840.10008.1.2.4.201', // HTJ2K
      '1.2.840.10008.1.2.5', // RLE
    ]) {
      expect(isUncompressedTransferSyntax(tsuid)).toBe(false);
      expect(isUncompressedGrayscale(grayscale, tsuid).ok).toBe(false);
    }
  });

  it('rejects colour and palette colour even when uncompressed', () => {
    expect(
      isUncompressedGrayscale(
        { ...grayscale, samplesPerPixel: 3, photometricInterpretation: 'RGB' },
        '1.2.840.10008.1.2.1'
      ).ok
    ).toBe(false);
    expect(
      isUncompressedGrayscale(
        { ...grayscale, photometricInterpretation: 'PALETTE COLOR' },
        '1.2.840.10008.1.2.1'
      ).ok
    ).toBe(false);
  });

  it('rejects an absent transfer syntax rather than guessing', () => {
    expect(isUncompressedTransferSyntax(undefined)).toBe(false);
    expect(isUncompressedGrayscale(grayscale, undefined).ok).toBe(false);
  });
});
