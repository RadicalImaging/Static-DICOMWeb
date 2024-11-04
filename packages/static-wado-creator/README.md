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
mkdicomweb create <DICOM-FILES-DIR>
```

Note there is no glob support on the input parameter, so either directories or files need to be fully specified.

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
