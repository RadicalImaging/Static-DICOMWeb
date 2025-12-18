export function dicomToXml(json) {
  const xml = [
    '<?xml version="1.0" encoding="utf-8" ?>',
    '<NativeDicomModel xmlns="http://dicom.nema.org/PS3.19/models/NativeDICOM" ',
    ' xsi:schemaLocation="http://dicom.nema.org/PS3.19/models/NativeDICOM" ',
    ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
  ];
  dicomObjectToXml(xml, json);
  xml.push('</NativeDicomModel>');
  return xml.join('\n');
}

export function dicomObjectToXml(xml, json) {
  for (const [tag, value] of Object.entries(json)) {
    dicomTagToXml(xml, tag, value);
  }
  return xml;
}

export function dicomTagToXml(xml, tag, value) {
  if (!value || !value.vr || !value.Value) {
    return xml;
  }
  xml.push(`<DicomAttribute tag="${tag}" vr="${value.vr}">`);
  const isSQ = value.vr === 'SQ';

  let index = 1;
  if (isSQ) {
    for (const item of value.Value) {
      xml.push(`<Item number="${index++}">`);
      dicomObjectToXml(xml, item);
      xml.push('</Item>');
    }
  } else {
    for (const item of value.Value) {
      xml.push(`<Value number="${index++}">${item}</Value>`);
    }
  }
  xml.push('</DicomAttribute>');
  return xml;
}
