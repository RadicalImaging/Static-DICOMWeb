const hashFactory = require("node-object-hash");
const Tags = require("../dictionary/Tags");

const hasher = hashFactory();

const { PatientID, PatientName, IssuerOfPatientID } = Tags;
const { StudyDescription, AccessionNumber, StudyInstanceUID, StudyDate, StudyTime } = Tags;
const { SeriesDescription, SeriesNumber, SeriesInstanceUID, SeriesDate, SeriesTime } = Tags;

const { DeduppedCreator, DeduppedTag, DeduppedHash, DeduppedRef, DeduppedType } = Tags;

const PatientQuery = [PatientID, PatientName, IssuerOfPatientID, Tags.PatientIdentityRemoved, Tags.DeidentificationMethodCodeSequence];
const StudyQuery = [StudyDescription, AccessionNumber, StudyInstanceUID, StudyDate, StudyTime, Tags.StudyStatusID, Tags.StudyPriorityID, Tags.StudyID];

const PatientStudyQuery = [...PatientQuery, ...StudyQuery];
// The difference between the extracts and the query is that the query contains the parent query values
// TODO - make it into a self-cpontained object that can generate either
const SeriesExtract = [
  SeriesDescription,
  SeriesNumber,
  SeriesInstanceUID,
  Tags.Modality,
  SeriesDate,
  SeriesTime,
  Tags.SpecificCharacterSet,
  Tags.InstitutionName,
  Tags.ReferringPhysicianName,
  Tags.StationName,
  Tags.OperatorsName,
  Tags.ManufacturerModelName,
  Tags.BodyPartExamined,
  Tags.ProtocolName,
  Tags.RequestedProcedureDescription,
];
const SeriesQuery = [StudyInstanceUID, ...SeriesExtract];

const InstanceQuery = [
  Tags.SOPInstanceUID,
  Tags.InstanceNumber,
  Tags.SeriesInstanceUID,
  Tags.StudyInstanceUID,
  Tags.ContentDate,
  Tags.ContentTime,
  Tags.AcquisitionDate,
  Tags.AcquisitionTime,
  Tags.AcquisitionNumber,
  Tags.SamplesPerPixel,
  Tags.PhotometricInterpretation,
  Tags.PlanarConfiguration,
  Tags.Rows,
  Tags.Columns,
  Tags.BitsAllocated,
  Tags.BitsStored,
  Tags.HighBit,
  Tags.PixelRepresentation,
  Tags.WindowCenter,
  Tags.WindowWidth,
  Tags.WindowCenterWidthExplanation,
  Tags.InstanceCreationTime,
];

const ImageExtract = [
  Tags.ImageType,
  Tags.InstanceCreationDate,
  Tags.SOPClassUID,
  Tags.ConversionType,
  Tags.ManufacturerModelName,
  Tags.ContentDate,
  Tags.AcquisitionDate,
  Tags.SecondaryCaptureDeviceID,
  Tags.DateOfSecondaryCapture,
  Tags.SecondaryCaptureDeviceManufacturer,
  Tags.SecondaryCaptureDeviceManufacturerModelName,
  Tags.SecondaryCaptureDeviceSoftwareVersions,
  Tags.SoftwareVersions,
  Tags.SamplesPerPixel,
  Tags.PhotometricInterpretation,
  Tags.PlanarConfiguration,
  Tags.Rows,
  Tags.Columns,
  Tags.BitsAllocated,
  Tags.BitsStored,
  Tags.HighBit,
  Tags.PixelRepresentation,
  Tags.WindowCenter,
  Tags.WindowWidth,
  Tags.WindowCenterWidthExplanation,
  Tags.PatientPosition,
  Tags.PatientOrientation,
];

const addHash = (data, type) => {
  if (data[DeduppedHash] && data[DeduppedHash].Value) {
    return data[DeduppedHash].Value[0];
  }

  const hashValue = hasher.hash(data);
  if (!data[DeduppedHash]) {
    data[DeduppedTag] = { vr: "CS", Value: [DeduppedCreator] };
    data[DeduppedHash] = { vr: "CS", Value: [hashValue] };
    data[DeduppedType] = { vr: "CS", Value: [type] };
  }
  return hashValue;
};

const TagSets = {
  PatientQuery,
  StudyQuery,
  PatientStudyQuery,
  SeriesQuery,
  SeriesExtract,
  InstanceQuery,
  ImageExtract,

  QueryExtract: { remove: false, hashRef: false },
  RemoveExtract: { remove: true, hashRef: true },

  extract: (data, type, tagSet, options) => {
    const ret = {};
    const { remove, hashRef } = options || {};
    tagSet.forEach((tag) => {
      const value = data[tag];
      if (value) {
        ret[tag] = value;
        if (remove) delete data[tag];
      }
    });
    const hashValue = addHash(ret, type);
    if (hashRef) {
      if (!data[DeduppedRef]) {
        data[DeduppedTag] = { vr: "CS", Value: [DeduppedCreator] };
        data[DeduppedRef] = { vr: "CS", Value: [] };
      }
      data[DeduppedRef].Value.push(hashValue);
    }
    return ret;
  },
  addHash,
};

module.exports = TagSets;
