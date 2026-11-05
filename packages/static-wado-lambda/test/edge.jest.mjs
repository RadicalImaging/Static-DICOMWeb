import { fileToKey } from '@radicalimaging/static-wado-util/storageFormat/index.mjs';
import { mapRequest } from '../lib/edge/mapRequest.mjs';
import { buildCloudFrontFunction } from '../lib/edge/cloudfrontFunction.mjs';

const options = { root: '/dicomweb', variants: ['jls', 'jpeg'], collectionParameter: 'collection' };
const frame = '/dicomweb/studies/1.2/series/1.3/instances/1.4/frames/1';

/** A CloudFront event request from a path, a query object, and an Accept header */
const request = (uri, query = {}, accept) => ({
  uri,
  querystring: Object.fromEntries(Object.entries(query).map(([k, value]) => [k, { value }])),
  headers: accept ? { accept: { value: accept } } : {},
});
const map = (...args) => mapRequest(request(...args), options);

// API contract: PRX-IMP-2, PRX-IMP-17, Q20, Q28
describe('mapRequest', () => {
  it('maps a single-part Accept of a permitted variant to the frame suffix', () => {
    expect(map(frame, {}, 'image/jls').uri).toBe(`${frame}.jls`);
    expect(map(frame, {}, 'image/jp2').uri).toBe(frame);
    expect(map(frame, {}, 'multipart/related; type="image/jls"').uri).toBe(frame);
    expect(map(frame).uri).toBe(frame);
  });

  it('gives each variant key the key that fileToKey gives for the stored file', () => {
    for (const extension of options.variants) {
      const accept = extension === 'jls' ? 'image/jls' : 'image/jpeg';
      const key = map(frame, {}, accept).uri.slice('/dicomweb/'.length);
      expect(fileToKey(key)).toBe(key);
    }
  });

  it('maps a collection query to the stored page, and only with no other filter', () => {
    expect(map('/dicomweb/studies', { collection: 'tcga-luad' })).toEqual({
      uri: '/dicomweb/collections/tcga-luad/studies',
      querystring: {},
    });
    expect(map('/dicomweb/studies', { collection: 'c', offset: '2000', limit: '1000' }).uri).toBe(
      '/dicomweb/collections/c/studies/2000'
    );
    expect(map('/dicomweb/studies', { collection: 'c', offset: '101' }).uri).toBe(
      '/dicomweb/studies'
    );
    expect(map('/dicomweb/studies', { collection: 'c', PatientID: 'x' }).uri).toBe(
      '/dicomweb/studies'
    );
  });

  it('maps an exact-UID study or series query to the index key of that UID', () => {
    expect(map('/dicomweb/studies', { StudyInstanceUID: '1.2' })).toEqual({
      uri: '/dicomweb/studies/1.2',
      querystring: {},
    });
    const singleton = '/dicomweb/studies/1.2/series/1.3/series-singleton.json';
    expect(map('/dicomweb/studies/1.2/series', { '0020000E': '1.3' }).uri).toBe(singleton);
    expect(map('/dicomweb/studies/1.2/series/1.3').uri).toBe(singleton);
    expect(map('/dicomweb/studies', { StudyInstanceUID: '../x' }).uri).toBe('/dicomweb/studies');
  });

  it('leaves other queries and requests unchanged', () => {
    const query = { PatientName: 'A*' };
    expect(map('/dicomweb/studies', query)).toEqual({
      uri: '/dicomweb/studies',
      querystring: request('/dicomweb/studies', query).querystring,
    });
    expect(map('/dicomweb/studies/1.2/series/1.3/metadata').uri).toBe(
      '/dicomweb/studies/1.2/series/1.3/metadata'
    );
    expect(map('/other/studies', { StudyInstanceUID: '1.2' }).uri).toBe('/other/studies');
  });
});

// API contract: the built CloudFront Function runs and uses the deployment options
describe('buildCloudFrontFunction', () => {
  it('builds a handler with the options in place', () => {
    const code = buildCloudFrontFunction({ ...options, root: '/dw' });
    expect(code).not.toMatch(/^export /m);
    const handler = new Function(`${code}; return handler;`)();
    const event = { request: request('/dw/studies', { collection: 'c' }) };
    expect(handler(event)).toMatchObject({ uri: '/dw/collections/c/studies', querystring: {} });
  });
});
