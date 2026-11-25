const must = require('must');
const getValue = require('../../lib/operation/getValue');
const getDataSet = require('../../lib/operation/getDataSet');

const dataSet = {};
const UN = 'UN';

/** A dicom-parser style dataSet of [tag, vr, bytes or items] elements. */
const fakeDataSet = elements => {
  const parts = [];
  const els = {};
  let offset = 0;
  for (const [tag, vr, value] of elements) {
    if (vr === 'SQ') {
      els[tag] = { tag, vr, items: value.map(item => ({ dataSet: fakeDataSet(item) })) };
      continue;
    }
    const bytes = Buffer.from(value);
    els[tag] = { tag, vr, dataOffset: offset, length: bytes.length };
    parts.push(bytes);
    offset += bytes.length;
  }
  const byteArray = Buffer.concat(parts);
  const string = tag => {
    const { dataOffset, length } = els[tag];
    return byteArray.toString('latin1', dataOffset, dataOffset + length).trim();
  };
  return { elements: els, byteArray, string };
};

const options = { maximumInlinePublicLength: 128, maximumInlinePrivateLength: 64 };
const parse = async elements => (await getDataSet(fakeDataSet(elements), {}, options)).metadata;
const charset = term => ['x00080005', 'CS', term];
const patientName = bytes => ['x00100010', 'PN', bytes];

describe('getValue', () => {
  it('gets undefined for grouplength', async () => {
    must(await getValue(dataSet, { tag: 'x00090000', Value: [1] }, UN)).be.undefined();
  });

  it('gets undefined for item end', async () => {
    must(await getValue(dataSet, { tag: 'xfffee00d', Value: [1] }, UN)).be.undefined();
  });

  it('decodes a multi-valued UTF-8 patient name under ISO_IR 192', async () => {
    const metadata = await parse([
      charset('ISO_IR 192'),
      patientName(Buffer.from('試験^患者\\見本^次郎 ', 'utf8')),
    ]);
    must(metadata['00100010'].Value).eql([
      { Alphabetic: '試験^患者' },
      { Alphabetic: '見本^次郎' },
    ]);
  });

  it('decodes windows-1252 when there is no SpecificCharacterSet', async () => {
    // 0xFC is ü, 0x80 is € (windows-1252 only)
    const metadata = await parse([
      patientName(Uint8Array.of(0x4d, 0xfc, 0x6c, 0x6c, 0x65, 0x72, 0x5e, 0x80)),
    ]);
    must(metadata['00100010'].Value).eql([{ Alphabetic: 'Müller^€' }]);
  });

  it('keeps the root character set for items, and does not split a two-byte ISO 2022 character on 0x5C', async () => {
    const jis = Uint8Array.of(0x1b, 0x24, 0x42, 0x5c, 0x21, 0x1b, 0x28, 0x42); // one kanji whose first byte is 0x5C
    const kanji = new TextDecoder('iso-2022-jp').decode(jis);
    const name = Buffer.concat([Buffer.from(jis), Buffer.from('^Taro')]);
    const metadata = await parse([
      charset('\\ISO 2022 IR 87'),
      patientName(name),
      ['x00400275', 'SQ', [[charset('ISO_IR 100'), patientName(name)]]],
    ]);
    must(metadata['00100010'].Value).eql([{ Alphabetic: `${kanji}^Taro` }]);
    must(metadata['00400275'].Value[0]['00100010'].Value).eql([{ Alphabetic: `${kanji}^Taro` }]);
  });
});
