// Private blocks in DICOM JSON: found by creator, never by a fixed tag
import { Tags } from '../../lib/dictionary/Tags.mjs';

const { DeduppedCreator, DeduppedHash } = Tags;

it('an extract merges by creator and does not write into a vendor block', () => {
  // The instance has a vendor block at 0x10; the extract reserved dedupped at 0x10
  const instance = {
    '00090010': { vr: 'LO', Value: ['VENDOR'] },
    '00091002': { vr: 'LO', Value: ['vendor data'] },
    '00290010': { vr: 'LO', Value: ['OTHER'] },
    '00291001': { vr: 'LO', Value: ['other'] },
  };
  const extract = {
    '00100010': { vr: 'PN', Value: [{ Alphabetic: 'Test' }] },
    '00290010': { vr: 'LO', Value: ['OTHER'] },
    '00291002': { vr: 'LO', Value: ['other 2'] },
  };
  Tags.setValue(extract, DeduppedHash, 'hash');
  expect(extract['00090010'].Value).toEqual([DeduppedCreator]);

  Tags.assignUndefined(instance, extract, [DeduppedCreator]);

  expect(instance['00100010']).toBe(extract['00100010']);
  expect(instance['00090010'].Value).toEqual(['VENDOR']);
  expect(instance['00091011']).toBeUndefined();
  expect(Tags.findPrivateBlock(instance, '0009', DeduppedCreator)).toBeUndefined();
  expect(instance['00291002'].Value).toEqual(['other 2']);
});

it('removePrivateBlock removes the creator and its elements only', () => {
  const item = { '00090010': { vr: 'LO', Value: ['VENDOR'] } };
  Tags.setValue(item, DeduppedHash, 'hash');
  expect(Object.keys(item)).toEqual(['00090010', '00090011', '00091111']);

  Tags.removePrivateBlock(item, '0009', DeduppedCreator);

  expect(Object.keys(item)).toEqual(['00090010']);
});
