import { route } from '../lib/router.mjs';

const series = 'studies/1.2.3/series/4.5';
const instance = `${series}/instances/6.7`;

// API contract: one case per route kind
describe('route', () => {
  it.each([
    ['studies', { kind: 'studyQuery' }],
    ['studies/1.2.3', { kind: 'studyQuery', studyUID: '1.2.3' }],
    ['studies/1.2.3/series', { kind: 'seriesQuery', studyUID: '1.2.3' }],
    [series, { kind: 'seriesQuery', studyUID: '1.2.3', seriesUID: '4.5' }],
    [`${series}/instances`, { kind: 'instanceQuery', studyUID: '1.2.3', seriesUID: '4.5' }],
    [`${series}/metadata`, { kind: 'seriesMetadata', studyUID: '1.2.3', seriesUID: '4.5' }],
    [`${instance}/metadata`, { kind: 'instanceMetadata', sopUID: '6.7' }],
    [`${instance}/frames/1,3`, { kind: 'frames', sopUID: '6.7', frames: [1, 3] }],
    [`${instance}/frames/2.jls`, { kind: 'frames', frames: [2], variant: 'jls' }],
    [
      `${instance}/bulkdata/00480105/0/00282000`,
      { kind: 'bulkdata', tagPath: '00480105/0/00282000' },
    ],
    ['studies/1.2.3/thumbnail', { kind: 'thumbnail', studyUID: '1.2.3' }],
    [`${instance}/thumbnail`, { kind: 'thumbnail', seriesUID: '4.5', sopUID: '6.7' }],
    [instance, { kind: 'part10', studyUID: '1.2.3', seriesUID: '4.5', sopUID: '6.7' }],
    ['collections/tcga_luad/studies', { kind: 'collection', collection: 'tcga_luad' }],
    ['collections/tcga_luad/studies/1000', { kind: 'collection', offset: 1000 }],
  ])('%s', (path, expected) => {
    expect(route(path)).toMatchObject(expected);
  });

  it('keeps the query', () => {
    const query = new URLSearchParams('StudyInstanceUID=1.2.3');
    expect(route('studies', query).query.get('StudyInstanceUID')).toBe('1.2.3');
  });

  it.each([
    'studies/1.2.3/metadata',
    'studies/../secret',
    'studies/1.2.x',
    `${instance}/frames/0x`,
    `${instance}/bulkdata/../../x`,
    'collections/../studies',
  ])('returns undefined (404) for %s', path => {
    expect(route(path)).toBeUndefined();
  });
});
