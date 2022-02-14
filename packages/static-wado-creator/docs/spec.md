# Specification

## Library

This library takes as input a DICOM P10 bitstream and produces the following:
* Image Frames - binary data of each image frame in the stored transfer syntax 
* Bulk Data - binary data for values larger than the configured inline length
* Full Metadata - DICOMweb JSON metadata

Note - image frames is wrapped in multi-part mime headers, but
bulk data is not.  Bulk data is identified by the extension.

### TODO

* Error handling
* Extensibility mechanisms
  * Custom transformations
  * Strip out private data
  * De-identification
* Consider storing encoding details so original P10 can be recreated without any loss
  * undefined lengths
  * frame fragmentation
  * basic offset table
* Consider generating rendered frames (check with Markus about this for path)
* Consider allowing caller to specify which tags to include in the summary metadata
* Consider providing context about each bulkdata (e.g. tag path)
* Consider providing context about each image frame (frame number), image module (rows, columns, bits stored, number of components, etc)
* Document API

## CLI

Included is an example cli that uses this library takes converts a DICOM P10 file on disk to files on disk that match
the DICOMweb URI pattern.  These files can be served up using a standard HTTP server and will be DICOMweb compliant

Parameters:
* -d <path to store DICOMweb format> (/dicomweb by default)
* <paths to DICOM P10 file or directory of DICOM P10 files>
* --privateBulkSize <size of private attributes to generate as bulk data, defaults to 64>
* --publicBulkSize <size of public attributes to generate as bulk data, defaults to 128k+2>
* --deduplicate  - use the deduplicate listener instead of the write instances listener
* --instances    - use the instances lsitener as WELL as the deduplicate listener

The cli will generate files in the output directory like this:

```
<StudyInstanceUid>/series/<SeriesInstanceUid>/instances/<SOPInstanceUID>/metadata - Metadata in JSON format
<StudyInstanceUid>/series/<SeriesInstanceUid>/instances/<SOPInstanceUID>/frames/ - Image frames 1..N
<StudyInstanceUid>/series/<SeriesInstanceUid>/instances/<SOPInstanceUID>/bulkdata - Bulk data items 1..N
<StudyInstanceUid>/series/<SeriesInstanceUid>/instances/<SOPInstanceUID>/info - info about the conversion - P10 header, gzip encoding, length strategy, etc
```

Note - image frames and bulk data are wrapped with multi-part mime headers so they can be streamed directly using a simple HTTP server.  References to bulkdata include the offset and length of the raw data within the multipart.
Other listeners for different organizations of bulkdata may be added in the future.

TODO
* Add alternate listeners to enable/disable multi-part mime wrapping?
* Add parameter to enable gzip compression?
  * Would need to figure out how to remember this
* Define extensibility mechanism (e.g. for custom data types)
  * prefix directory with underscore _? (e.g. results from a COVID-19 detection algorithm)
    * <StudyInstanceUid>/series/<SeriesInstanceUid>/instances/<SOPInstanceUID>/_aistartupco_covid19_detection/result.json