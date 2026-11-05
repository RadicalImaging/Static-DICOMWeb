import { qidoFilter } from '../../lib/index.js';

const study = {
  '0020000D': { vr: 'UI', Value: ['1.2.3'] },
  '00100010': { vr: 'PN', Value: [{ Alphabetic: 'MISTER^MR' }] },
  '00080061': { vr: 'CS', Value: ['MR'] },
};

// Key shapes as dcmjs-dimse naturalizes a C-FIND identifier with the dcmjs 1.0 beta
describe('qidoFilter', () => {
  it.each([
    ['empty ModalitiesInStudy', { StudyInstanceUID: '1.2.3', ModalitiesInStudy: [] }, 1],
    ['empty ModalitiesInStudy, beta.5 shape', { StudyInstanceUID: null, ModalitiesInStudy: [''] }, 1],
    ['empty PatientName', { StudyInstanceUID: null, PatientName: null }, 1],
    ['matching modality', { StudyInstanceUID: null, ModalitiesInStudy: ['MR'] }, 1],
    ['other modality', { StudyInstanceUID: null, ModalitiesInStudy: ['CT'] }, 0],
    ['other StudyInstanceUID', { StudyInstanceUID: '9.9' }, 0],
  ])('%s', (_label, keys, matches) => {
    expect(qidoFilter([study], { QueryRetrieveLevel: 'STUDY', ...keys })).toHaveLength(matches);
  });
});
