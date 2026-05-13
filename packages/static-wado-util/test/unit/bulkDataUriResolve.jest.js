const {
  resolveBulkDataLocation,
  bulkDataHttpPathUnderRoot,
  rewriteBulkDataUriForSeriesMetadata,
  bulkDataUriRelativeFromInstance,
} = require('../../lib/reader/bulkDataUriResolve.js');

describe('resolveBulkDataLocation', () => {
  const studyUID = '1.2.3.4.5';
  const seriesUID = '1.2.3.4.6';
  const instanceUID = '1.2.3.4.7';

  it('resolves instance-relative ./frames', () => {
    const spec = resolveBulkDataLocation('./frames', {
      studyUID,
      seriesUID,
      instanceUID,
      frameNumber: 2,
    });
    expect(spec.kind).toBe('readBulkData');
    expect(spec.dirSuffix).toBe(`studies/${studyUID}/series/${seriesUID}/instances/${instanceUID}`);
    expect(spec.baseName).toBe('./frames');
    expect(spec.frame).toBe(2);
  });

  it('resolves series-relative ./instances/.../frames', () => {
    const uri = `./instances/${instanceUID}/frames`;
    const spec = resolveBulkDataLocation(uri, {
      studyUID,
      seriesUID,
      instanceUID,
      frameNumber: 1,
    });
    expect(spec.kind).toBe('readBulkData');
    expect(spec.dirSuffix).toBe(`studies/${studyUID}/series/${seriesUID}`);
    expect(spec.baseName).toBe(uri);
    expect(spec.frame).toBe(1);
  });

  it('anchors non-frame bulkdata relative to series directory', () => {
    const spec = resolveBulkDataLocation('./bulkdata/ab/cd/file.mht.gz', {
      studyUID,
      seriesUID,
      instanceUID,
    });
    expect(spec.kind).toBe('readBulkData');
    expect(spec.dirSuffix).toBe(`studies/${studyUID}/series/${seriesUID}`);
    expect(spec.baseName).toBe('./bulkdata/ab/cd/file.mht.gz');
  });

  it('returns httpAbsolute for https URLs', () => {
    const spec = resolveBulkDataLocation('https://example.com/pixel', {
      studyUID,
      seriesUID,
      frameNumber: 3,
    });
    expect(spec.kind).toBe('httpAbsolute');
    expect(spec.url).toBe('https://example.com/pixel/3');
  });
});

describe('bulkDataHttpPathUnderRoot', () => {
  const studyUID = '1.2.3';
  const seriesUID = '1.2.4';
  const instanceUID = '1.2.5';

  it('builds path for instance frames', () => {
    const spec = resolveBulkDataLocation('./frames', {
      studyUID,
      seriesUID,
      instanceUID,
      frameNumber: 1,
    });
    const p = bulkDataHttpPathUnderRoot(spec);
    expect(p).toBe(`studies/${studyUID}/series/${seriesUID}/instances/${instanceUID}/frames/1`);
  });
});

describe('rewriteBulkDataUriForSeriesMetadata', () => {
  it('rewrites ./frames to series-relative instances path', () => {
    expect(rewriteBulkDataUriForSeriesMetadata('./frames', '1.2.3')).toBe('./instances/1.2.3/frames');
  });
  it('shortens instance bulkdata relative path', () => {
    expect(
      rewriteBulkDataUriForSeriesMetadata('../../../../bulkdata/ab/cd/x.mht.gz', '1.2.3')
    ).toBe('../../bulkdata/ab/cd/x.mht.gz');
  });
});

describe('bulkDataUriRelativeFromInstance', () => {
  it('matches legacy relative depth', () => {
    expect(bulkDataUriRelativeFromInstance('ab/cd/ef.mht.gz')).toBe('../../../../bulkdata/ab/cd/ef.mht.gz');
  });
});
