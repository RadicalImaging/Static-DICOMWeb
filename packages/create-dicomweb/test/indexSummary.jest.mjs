import fs from 'fs';
import path from 'path';
import { createMain } from '../lib/commands/createMain.mjs';
import { Tags } from '@radicalimaging/static-wado-util';
import { FileDicomWebReader } from '../lib/instance/FileDicomWebReader.mjs';

const { getValue } = Tags;

/**
 * Patient and study level tags that should be present in the studies index
 * and study singleton, matching the source DICOM instance metadata.
 */
const PATIENT_STUDY_TAGS = [
  Tags.PatientName,
  Tags.PatientID,
  Tags.StudyInstanceUID,
  Tags.StudyDescription,
  Tags.StudyDate,
  Tags.StudyTime,
  Tags.AccessionNumber,
];

/** ModalitiesInStudy (0008,0061) is derived from series Modality values - checked separately */
const MODALITIES_IN_STUDY_TAG = Tags.ModalitiesInStudy;

/**
 * Extracts patient/study query values from a metadata object for comparison
 */
function extractPatientStudyValues(metadata, tagList = PATIENT_STUDY_TAGS) {
  const result = {};
  for (const tag of tagList) {
    const value = getValue(metadata, tag);
    if (value !== undefined && value !== null && value !== '') {
      result[tag] = value;
    }
  }
  return result;
}

describe('indexSummary', () => {
  let packageRoot;
  let dicomFilePath;
  let tempDir;

  beforeAll(async () => {
    packageRoot = process.cwd().endsWith('create-dicomweb')
      ? process.cwd()
      : path.resolve(process.cwd(), 'packages/create-dicomweb');
    tempDir = path.join(packageRoot, 'tmp/index-summary-test');

    dicomFilePath = path.resolve(
      packageRoot,
      '../../packages/static-wado-creator/dicom/jpeg8bit.dcm'
    );

    if (!fs.existsSync(path.dirname(dicomFilePath))) {
      throw new Error(`DICOM test file not found: ${dicomFilePath}`);
    }

    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });

    await createMain([dicomFilePath], { dicomdir: tempDir, studyIndex: true });
  }, 60_000);

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('studies index exists and contains at least one study', () => {
    const studiesIndexPath = path.join(tempDir, 'studies', 'index.json.gz');
    const studiesIndexAlt = path.join(tempDir, 'studies', 'index.json');
    expect(fs.existsSync(studiesIndexPath) || fs.existsSync(studiesIndexAlt)).toBe(true);
  });

  test('patient and study data in index matches source DICOM', async () => {
    const reader = new FileDicomWebReader(tempDir);
    const studiesIndex = await reader.readJsonFile('studies', 'index.json');
    expect(studiesIndex).toBeDefined();
    expect(Array.isArray(studiesIndex)).toBe(true);
    expect(studiesIndex.length).toBeGreaterThan(0);

    const studyQuery = Array.isArray(studiesIndex[0]) ? studiesIndex[0] : studiesIndex[0];
    const studyUID = getValue(studyQuery, Tags.StudyInstanceUID);
    expect(studyUID).toBeDefined();

    const studySingleton = await reader.readJsonFile(reader.getStudyPath(studyUID), 'index.json');
    expect(studySingleton).toBeDefined();
    const studySingletonData =
      Array.isArray(studySingleton) && studySingleton.length > 0
        ? studySingleton[0]
        : studySingleton;

    const instanceMetadata = await getFirstInstanceMetadata(reader, studyUID);
    expect(instanceMetadata).toBeDefined();

    const expectedValues = extractPatientStudyValues(instanceMetadata);
    const actualIndexValues = extractPatientStudyValues(studyQuery);
    const actualSingletonValues = extractPatientStudyValues(studySingletonData);

    for (const [tag, expectedValue] of Object.entries(expectedValues)) {
      const actualValue = actualIndexValues[tag] ?? actualSingletonValues[tag];
      expect(actualValue).toEqual(expectedValue);
    }

    const patientName =
      actualIndexValues[Tags.PatientName] ?? actualSingletonValues[Tags.PatientName];
    expect(patientName).toBeDefined();
    expect(String(patientName ?? '')).not.toBe('');

    // ModalitiesInStudy: derived from series, should match unique Modality values
    const expectedModalities = await getExpectedModalitiesInStudy(reader, studyUID);
    const actualModalitiesRaw =
      getValue(studyQuery, MODALITIES_IN_STUDY_TAG) ??
      getValue(studySingletonData, MODALITIES_IN_STUDY_TAG);
    const actualModalities = Array.isArray(actualModalitiesRaw)
      ? actualModalitiesRaw
      : actualModalitiesRaw != null
        ? [actualModalitiesRaw]
        : [];
    expect(actualModalities.sort()).toEqual(expectedModalities.sort());
    // prettier-ignore
  });

  test('study summary written includes patient name, study date/time, ModalitiesInStudy (0008,0061), NumberOfStudyRelatedInstances and NumberOfStudyRelatedSeries', async () => {
    const reader = new FileDicomWebReader(tempDir);
    const studiesIndex = await reader.readJsonFile('studies', 'index.json');
    expect(studiesIndex).toBeDefined();
    expect(Array.isArray(studiesIndex)).toBe(true);
    expect(studiesIndex.length).toBeGreaterThan(0);

    const studyQuery = Array.isArray(studiesIndex[0]) ? studiesIndex[0] : studiesIndex[0];
    const studyUID = getValue(studyQuery, Tags.StudyInstanceUID);
    expect(studyUID).toBeDefined();

    const studySingleton = await reader.readJsonFile(reader.getStudyPath(studyUID), 'index.json');
    expect(studySingleton).toBeDefined();
    const summary =
      Array.isArray(studySingleton) && studySingleton.length > 0
        ? studySingleton[0]
        : studySingleton;

    // 1. Patient name must be present and non-empty
    const patientName = getValue(summary, Tags.PatientName);
    expect(patientName).toBeDefined();
    expect(String(patientName ?? '').trim()).not.toBe('');

    // 2. Study date must be present
    const studyDate = getValue(summary, Tags.StudyDate);
    expect(studyDate).toBeDefined();
    expect(String(studyDate ?? '').trim()).not.toBe('');

    // 3. Study time must be present
    const studyTime = getValue(summary, Tags.StudyTime);
    expect(studyTime).toBeDefined();
    expect(String(studyTime ?? '').trim()).not.toBe('');

    // 4. Modalities in study (tag 0008,0061) must be present and non-empty array
    const modalitiesInStudy = getValue(summary, Tags.ModalitiesInStudy);
    expect(modalitiesInStudy).toBeDefined();
    const modalitiesArray = Array.isArray(modalitiesInStudy)
      ? modalitiesInStudy
      : modalitiesInStudy != null
        ? [modalitiesInStudy]
        : [];
    expect(modalitiesArray.length).toBeGreaterThan(0);

    // 5. Number of study related instances and series must match actual counts
    const expectedCounts = await getExpectedStudyRelatedCounts(reader, studyUID);
    const numSeries = getValue(summary, Tags.NumberOfStudyRelatedSeries);
    const numInstances = getValue(summary, Tags.NumberOfStudyRelatedInstances);

    expect(numSeries).toBeDefined();
    expect(Number(numSeries)).toBe(expectedCounts.seriesCount);

    expect(numInstances).toBeDefined();
    expect(Number(numInstances)).toBe(expectedCounts.instancesCount);
  });
});

async function getFirstInstanceMetadata(reader, studyUID) {
  const seriesPath = reader.getStudyPath(studyUID) + '/series';
  const seriesDirs = await reader.scanDirectory(seriesPath, { withFileTypes: true });
  for (const entry of seriesDirs) {
    const seriesUID = entry?.name ?? entry;
    if (typeof seriesUID !== 'string') continue;
    const instancesPath = reader.getSeriesPath(studyUID, seriesUID) + '/instances';
    const instanceDirs = await reader.scanDirectory(instancesPath, { withFileTypes: true });
    for (const instEntry of instanceDirs) {
      const instanceUID = instEntry?.name ?? instEntry;
      if (typeof instanceUID !== 'string') continue;
      const instancePath = reader.getInstancePath(studyUID, seriesUID, instanceUID);
      const metadata = await reader.readJsonFile(instancePath, 'metadata');
      if (metadata) {
        return Array.isArray(metadata) && metadata.length > 0 ? metadata[0] : metadata;
      }
    }
  }
  return undefined;
}

/** Returns expected ModalitiesInStudy from series index (unique Modality per series) */
async function getExpectedModalitiesInStudy(reader, studyUID) {
  const seriesIndex = await reader.readJsonFile(
    reader.getStudyPath(studyUID) + '/series',
    'index.json'
  );
  if (!seriesIndex || !Array.isArray(seriesIndex)) return [];
  const modalities = [];
  for (const seriesItem of seriesIndex) {
    const seriesQuery = Array.isArray(seriesItem) ? seriesItem[0] : seriesItem;
    const modality = getValue(seriesQuery, Tags.Modality);
    if (modality && modalities.indexOf(modality) === -1) {
      modalities.push(modality);
    }
  }
  return modalities;
}

/** Returns expected NumberOfStudyRelatedSeries and NumberOfStudyRelatedInstances from study directory */
async function getExpectedStudyRelatedCounts(reader, studyUID) {
  const seriesIndex = await reader.readJsonFile(
    reader.getStudyPath(studyUID) + '/series',
    'index.json'
  );
  if (!seriesIndex || !Array.isArray(seriesIndex)) {
    return { seriesCount: 0, instancesCount: 0 };
  }
  let instancesCount = 0;
  for (const seriesItem of seriesIndex) {
    const seriesQuery = Array.isArray(seriesItem) ? seriesItem[0] : seriesItem;
    const n = getValue(seriesQuery, Tags.NumberOfSeriesRelatedInstances);
    if (n !== undefined) {
      instancesCount += Number(n) || 0;
    }
  }
  return { seriesCount: seriesIndex.length, instancesCount };
}
