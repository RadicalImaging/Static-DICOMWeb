# Static DICOMweb File Structure

Web servers can serve files as both directories and paths, and can have additional metadata associated with files.  Typical file structures don't have these advantages and so need a slightly different file structure which communicates both the type of data as well as the path name.  Some simple conventions are used for Static DICOMweb to allow storing the data as files:

1. Paths that are both a directory and a resource are stored as index files.
  * For example, the series query file on the path `studies/<studyUID>/series` overlaps with the series directories
  * The series query as a file path will be stored as `studies/<studyUID>/series/index.json.gz`
2. Paths that are just a file resource are stored a the straigh named file
  * For example, metadata files on the path `studies/<studyUID>/series/<seriesUID>/metadata` are stored
    as `metadata.gz`
3. GZIP compressed files use the extension '.gz' to indicate compression
4. Multipart related files are just stored without other additional extensions
  * EG the frame files are just the frame number (sometimes with GZIP indication)
  * `1.gz` or `1`
5. Some files use the full regular extension to indicate type, particularly when otherwise unknown.

This allows an application to serve up the files by path/extension, without needing any additional information about what is in the files.  Very occasionally it requires knowledge of the file type.

# Available Files

The following paths are typically available:

* `studies` is the root of the DICOMweb specific folders
  * `index.json.gz` containing an overall index to all studies
  * `<studyUID>` is the root of the study specific data
    * `index.json.gz` contain a DICOMweb study query for the given study
    * `thumbnail` containing a JPEG study level thumbnail
    * `bulkdata/...` contains bulkdata extracted from the metadata
    * `series/` contains the series level data
      * `index.json.gz` contains a DICOMweb query at the series level for the study
      * `<seriesUID>` is the root of the series specific data
        * `metadata.gz` contains a compressed JSON representation of the metadata
        * `instances/<sopUID>` is the root of the instance specific data
          * `frames/<frameNo>` contains the image bulkdata for the given frame
          * `frames/<frameNo>.gz` contains an uncompressed image frame if the image was not recompressed
          * `thumbnail` contains a JPEG thumbnail for the image
          * `rendered/<frameNo>` may be present and contain a PNG image rendered using dcm2jpg
* `deduplicated/` is the root of the eventual consistency data set, used for concurrent updates
* `instances/` is the root of the instance level consistency, used when ensuring each instance is correctly received
* `notifications/` is the root of hte notifications, used to ensure uploads to the cloud and/or consistency are completed

