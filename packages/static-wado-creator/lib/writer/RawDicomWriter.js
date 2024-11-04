const { Tags } = require("@radicalimaging/static-wado-util");
const WriteStream = require("./WriteStream");
const WriteMultipart = require("./WriteMultipart");
const { MultipartHeader } = require("./MultipartHeader");

const modalitiesToRawWrite = ["SEG", "SR"];
const sopClassesToRawWrite = ["1.2.840.10008.5.1.4.1.1.30"];

const defaultSelector = (instance) => {
  const modality = instance.metadata[Tags.Modality]?.Value?.[0];
  const sopClass = instance.metadata[Tags.SOPClassUID]?.Value?.[0];
  return (
    modalitiesToRawWrite.indexOf(modality) !== -1 ||
    sopClassesToRawWrite.indexOf(sopClass) !== -1
  );
};

/** Writes out raw DICOM files, encapsulated in multipart and gzipped - currently just DICOM SR and SEG */
const RawDicomWriter =
  () =>
  async (id, instance, content, options = { gzip: true }) => {
    if (!instance) {
      return undefined;
    }
    const selector = options.selector || defaultSelector;
    if (!selector(instance)) {
      return undefined;
    }
    const contentType = options.contentType || "application/dicom";
    const writeStream = WriteStream(id.sopInstanceRootPath, "index.mht", {
      gzip: options.gzip,
      mkdir: true,
    });
    const { length } = content;
    const buffer = content.slice(0, length);
    await WriteMultipart(
      writeStream,
      [new MultipartHeader("Content-Type", contentType, [])],
      buffer
    );
    await writeStream.close();
  };
RawDicomWriter.defaultSelector = defaultSelector;

module.exports = RawDicomWriter;
