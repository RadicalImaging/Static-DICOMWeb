import {
  fileToKey,
  rewriteBulkDataUris,
  splitSeriesMetadata,
  wrapMultipart,
  unwrapMultipart,
} from '../../lib/storageFormat/index.mjs';

const study = '1.2.3';
const series = '1.2.3.4';
const upstream = 'https://upstream.example/dicomWeb';

const instance = sop => ({
  '0020000D': { vr: 'UI', Value: [study] },
  '0020000E': { vr: 'UI', Value: [series] },
  '00080018': { vr: 'UI', Value: [sop] },
  '7FE00010': {
    vr: 'OB',
    BulkDataURI: `${upstream}/studies/${study}/series/${series}/instances/${sop}/bulkdata/7FE00010`,
  },
  '00420011': {
    vr: 'OB',
    BulkDataURI: `${upstream}/studies/${study}/series/${series}/instances/${sop}/bulkdata/00420011`,
  },
  // Icon pixel data in a sequence is bulkdata, not the frames of the instance
  '00880200': {
    vr: 'SQ',
    Value: [{ '7FE00010': { vr: 'OB', BulkDataURI: '../../../../bulkdata/ab/cd/icon.mht.gz' } }],
  },
});

const bulkDataUris = metadata => {
  const uris = [];
  JSON.stringify(metadata, (key, value) => {
    if (key === 'BulkDataURI') uris.push(value);
    return value;
  });
  return uris;
};

describe('storageFormat API contract', () => {
  it('fileToKey strips the compression, multipart and index parts', () => {
    expect(fileToKey('studies/1/series/2/instances/3/frames/1.mht.gz')).toBe(
      'studies/1/series/2/instances/3/frames/1'
    );
    expect(fileToKey('studies\\1\\index.json.gz')).toBe('studies/1');
    expect(fileToKey('index.json.gz')).toBe('');
  });

  it('rewriteBulkDataUris makes each URI relative at the instance level', () => {
    expect(bulkDataUris(rewriteBulkDataUris(instance('5'), 'instance'))).toEqual([
      './frames',
      './bulkdata/00420011',
      '../../../../bulkdata/ab/cd/icon',
    ]);
  });

  it('rewriteBulkDataUris makes each URI relative at the series level', () => {
    expect(bulkDataUris(rewriteBulkDataUris([instance('5')], 'series'))).toEqual([
      './instances/5/frames',
      './instances/5/bulkdata/00420011',
      '../../bulkdata/ab/cd/icon',
    ]);
  });

  it('rewriteBulkDataUris maps IDC-style upstream URIs to instance bulkdata keys', () => {
    const base = `https://proxy.example/bulk/current/viewer/dicomWeb/studies/${study}/series/${series}/instances/7/bulkdata`;
    const idc = {
      '0020000D': { vr: 'UI', Value: [study] },
      '0020000E': { vr: 'UI', Value: [series] },
      '00080018': { vr: 'UI', Value: ['7'] },
      '00131010': { vr: 'UN', BulkDataURI: `${base}/00131010` },
      '00480105': {
        vr: 'SQ',
        Value: [{ '00282000': { vr: 'OB', BulkDataURI: `${base}/00480105/0/00282000` } }],
      },
      '7FE00010': { vr: 'OB', BulkDataURI: `${base}/7FE00010` },
    };
    expect(bulkDataUris(rewriteBulkDataUris([idc], 'series'))).toEqual([
      './instances/7/bulkdata/00131010',
      './instances/7/bulkdata/00480105/0/00282000',
      './instances/7/frames',
    ]);
    expect(bulkDataUris(rewriteBulkDataUris(idc, 'instance'))).toEqual([
      './bulkdata/00131010',
      './bulkdata/00480105/0/00282000',
      './frames',
    ]);
  });

  it('splitSeriesMetadata gives one instance-level document per instance', () => {
    const split = splitSeriesMetadata([instance('5'), instance('6')]);
    expect(split.map(it => it.sopInstanceUID)).toEqual(['5', '6']);
    expect(split[1].metadata).toEqual([rewriteBulkDataUris(instance('6'), 'instance')]);
  });

  it('unwrapMultipart reads the parts that wrapMultipart writes', () => {
    const parts = [
      {
        body: Buffer.from([1, 2, 3]),
        contentType: 'image/jls',
        transferSyntaxUid: '1.2.840.10008.1.2.4.80',
      },
      { body: Buffer.from('--x'), contentType: 'application/octet-stream' },
    ];
    const { body, contentType } = wrapMultipart(parts, 'B');
    expect(contentType).toBe('multipart/related; type="image/jls"; boundary=B');
    expect(unwrapMultipart(body)).toEqual([
      { ...parts[0] },
      { ...parts[1], transferSyntaxUid: null },
    ]);
    expect(unwrapMultipart(Buffer.from([1, 2, 3]))).toBeNull();
  });
});

describe('storageFormat user behaviour', () => {
  it('every BulkDataURI of the series metadata resolves to the key of the written file', () => {
    const seriesUrl = `https://cdn.example/dicomweb/studies/${study}/series/${series}/metadata`;
    const root = 'https://cdn.example/dicomweb/';
    const written = [
      `studies/${study}/series/${series}/instances/5/frames/1.mht.gz`,
      `studies/${study}/series/${series}/instances/5/bulkdata/00420011`,
      `studies/${study}/bulkdata/ab/cd/icon.mht.gz`,
    ];
    const uris = bulkDataUris(rewriteBulkDataUris([instance('5')], 'series'));
    const keys = uris.map((uri, i) =>
      new URL(i === 0 ? `${uri}/1` : uri, seriesUrl).href.substring(root.length)
    );
    expect(keys).toEqual(written.map(fileToKey));
  });
});
