# Static DICOMweb Creator
The Static DICOMweb Creator package converts DICOM Part 10 files to and from files in a DICOMweb like format.  

# Installation
Using npm, install the package:

```bash
npm install -g @radicalimaging/static-wado-creator
```


## Additional Installs:

* To render thumbnail/rendered responses, install the dcm2jpg command from [dcm4che](https://sourceforge.net/projects/dcm4che/files/dcm4che2/) and add it to your `PATH` environment variable
* To generate thumbnails for video, instal ffmpeg.


# Tools Usage
The tools will write to a dicomweb folder created by default in the users home directory (~) in the `~/dicomweb/` location in the locations as specified in [File Structure](../../file-structure.md).

## Converting DICOM Part 10 to DICOMweb

DICOM part 10 files can be converted to DICOMweb.  By default, LEI grayscale images will be converted to JPEG-LS compressed images and a thumbnail will be generated.  This can be done with:

```bash
createdicomweb create <DICOM-FILES-DIR ...>
```

Note there is no glob support on the input parameter, so either directories or files need to be fully specified.

Very large multi-frame instances (whole slide imaging, for example) write one file per frame. At most
32 of those files are written at a time, and the reader waits for room before producing more frames.
Use `--max-open-files <N>` to raise that for faster storage, or lower it if the system still runs
short of file handles.

## Generating Alternate Renditions

Additional renditions can be generated beside an existing `frames/` store, addressed by study UID.
`frames/` itself is never written, so the primary rendition stays byte identical:

```bash
createdicomweb alternates <studyUID> --jls --jls-thumbnail --brick
```

Available renditions are `--jls`, `--jls-thumbnail`, `--htj2k`, `--htj2k-lossy` and `--brick`, and
at least one is required. `--series-uid` restricts the run to one series, `--force` regenerates
output that already exists, and `--json` emits the size and compression report as JSON on stdout.
The brick store is tuned with `--brick-order`, `--brick-codec` and `--brick-size`.

See [Alternate Renditions and Brick Stores](../../README.md#alternate-renditions-and-brick-stores)
for the pyramid layout, the manifest and the eligibility rules.

## Recompressing the Primary Frames

Uncompressed grayscale frames can be rewritten in place as JPEG-LS lossless:

```bash
createdicomweb transcode <studyUID> --to jls
```

Colour and already compressed instances are skipped. Frames are staged and moved into place only
once the whole instance has encoded, so a failure leaves the original frames intact.

## Converting Static DICOMweb to Part 10

Static DICOMweb files can be converted back into Part 10, provided:

* Total DICOM Part 10 size is under 2 gb
* DICOMweb data is stored in a compressed transfer syntax

The commands is:

```bash
mkdicomweb part10 <studyUID>
```

## Delete A Study
A study can be deleted using:

```
mkdicomweb delete <studyUID>
```

## Reject A Series
A series can be "deleted", that is rejected, which removed it only from the indices by running:

```
mkdicomweb reject <studyUID>/seres/<seriesUID>
```
