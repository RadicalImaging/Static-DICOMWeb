// An empty element in the metadata stays in the Part 10 output, so empty Type 2 attributes are kept
import fs from 'fs';
import os from 'os';
import path from 'path';
import { data } from 'dcmjs';
import { generatePart10ForInstance } from '../lib/commands/part10Main.mjs';

const { DicomMessage } = data;

it('writes an empty Type 2 element and an empty sequence with zero length', async () => {
  const seriesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'part10-empty-'));
  try {
    const { buffer } = await generatePart10ForInstance(seriesDir, {
      '00080016': { vr: 'UI', Value: ['1.2.840.10008.5.1.4.1.1.7'] },
      '00080018': { vr: 'UI', Value: ['1.2.3.4'] },
      '00080070': { vr: 'LO' }, // Manufacturer, no Value
      '00100030': { vr: 'DA', Value: [] }, // PatientBirthDate
      '00080090': { vr: 'PN', Value: [null] }, // ReferringPhysicianName
      '00081110': { vr: 'SQ' }, // ReferencedStudySequence
    });
    const { dict } = DicomMessage.readFile(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.length)
    );
    for (const tag of ['00080070', '00100030', '00080090', '00081110']) {
      expect([tag, dict[tag]?.Value]).toEqual([tag, []]);
    }
  } finally {
    fs.rmSync(seriesDir, { recursive: true, force: true });
  }
});
