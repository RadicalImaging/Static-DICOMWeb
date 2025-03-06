# Deduplicated Archive Format Description
Describes the format of the deduplicated archive structure.  This is intended to allow for interoperability of systems producing or consuming such data.

## Core File Structure
The basic file structure is related to the structure for DICOMweb, with a few differences relating to storage of the data on the file system versus as web queries, plus the addition of deduplicated data.  There are three different trees of data on the file systems.  The studies tree contains the standard DICOMweb structure, to be able to access the data efficiently.  The deduplicated tree contains a much leaner set of data, used to create the current version, while the instances tree is a temporary structure used as an intermediate between part 10 files and deduplicated files.  

### Current Version
There are a number of "current" version query and metadata files.  These files are an eventually updated version of the status of the study and correspond to the default DICOMweb data.  They are all located in the <DICOMWebPath>/studies/<StudyInstanceUID> directory, under the following structure.  Files ending in .gz are gzipped versions that would be served without the .gz extension, but in a file system are identified as containing the .gz extension.  All query containing files are implicitly 'includeField=all'.

It is not necessary to have the current version and deduplicated instances located on the same file system or location.  Indeed, it may be optimal to store each one separately to allow cleaning the current version system, and dynamic creation of the current version based on the deduplicated version.

* studies.gz  containing the studies query  studies?StudyInstanceUID=<StudyInstanceUID>
* series.gz   containing the series query   studies/<StudyInstanceUID>/series
* deduplicated.gz  containing the current study level deduplicated data (for all instances)
* studies/<StudyInstanceUID>/thumbail containing the study thumbnail in JPEG
* series/<SeriesInstanceUID>/metadata.gz  containing the metadata for the series
* series/<SeriesInstanceUID>/instances.gz containing the instances query for this series
* series/<SeriesInstanceUID>/thumbnail containing the series thumbnail in JPEG
* series/<SeriesInstanceUID>/instances/<SopInstanceUID>/frames/1..n for pixel data encoded in separate parts (even if n=1)
* series/<SeriesInstanceUID>/instances/<SopInstanceUID>/pixeldata   for pixel data encoded in a single part (eg video)
* series/<SeriesInstanceUID>/instances/<SopInstanceUID>/thumbnail containing a JPEG encoded image
* bulkdata/hash0-3/hash3-5/hash5- (.json/.raw) containing bulkdata files, hashed in some mechanism
** hash0-3 is 'hash-string'.substring(0,3) etc
** current hash is SHA1 of the contents, but the ordering etc isn't well defined

### Creating Current Version from Deduplicated Data
To create the current version from the deduplicated data, all the deduplicated files are read for a given study, and then are recombined with the hash data to generate the current metadata for each instance.  These instance files are then used to generate series metadata, study query files etc.  

The referenced images are copied from the bulkdata hash directory to the frames and/or pixeldata directories, and thumbnails are written.

The hash value of each object is recorded in the object itself as it is written.  This allows comparing the generated value with the hash value, and allows for a stability check to see if there are any concurrency issues.  This check needs to be done as a second phase after writing the files initially, and after it is known that any synchronization issues cross-cluster have been resolved.  The basic process is after receiving any data or update to a study, initiate the following:

1. Read the deduplicated files
2. Compare the hash version of the latest deduplicated file with the hash file of the current version deduplicated file.  If they are identical, then the current version is up to date.  Skip this study.
3. For each instance, add the data to the appropriate object (study query, series query, series metadata, frame object etc)
4. Write the deduplicated.gz file as a copy of the latest deduplicated file set.
5. Schedule a check at time+N  (this deals with asynchronous/distributed updates)

Note how this is cluster safe as long as the time in #5 is sufficiently long for deduplicated file data to 'settle'.  If the cluster is known to be split, then this time should be extended until the cluster has rejoined and the algorithm can be run again.

## Deduplicated Data
The deduplicated data is the main archive format for the deduplicated instances.  It attempts to be able to recover all versions of the data, and store all the information required to generate the DICOMweb format in an efficient manner.
The primary paths for the deduplicated data are:
* studies/<StudyInstanceUID>/bulkdata/hash0-3/hash3-5/hash5-  (.json/.raw/.jp2/.jls etc)
* deduplicated/<StudyInstanceUID>/hash.gz containing GZIP deduplicated lists
* instances/<StudyInstanceUID>/hash.gz containing GZIP deduplicated single instance data

### Deduplicated Private Tags
The private dictionary for the deduplicated tags is below.  The tag values are shown as resolved values.
```
    DeduppedCreator: "dedupped"
    DeduppedTag: (0009,0010)
    DeduppedRef: (0009,1010)  [hashValues]
    DeduppedHash: (0009,1011)  hashValue for this instance
    DeduppedType: (0009,1012)  (info, instance, patient/study/series, delete, replace)
```

### JSON BulkData format
The JSON BulkData format is an enhancement of a standard DICOM JSON object, with the additional fields:
* DeduppedHash is a hash value of THIS object, without this value being used in the hash
* DeduppedType contains a string value with the type of THIS object (eg info, instance, series, study etc)
  * info objects are informational about the object.  They may contain a DeduppedRef list for hashes of files that they implicitly replace.
  * instance objects are leaf nodes containing single SOP instance data.  They should be used to reconstruct each individual SOP instance UID
  * delete objects are objects no longer in use.  They are listed just containing the hash value, and a series/sop instance UID (if applicable), in order to get the correct tree of instances added.
  * replace objects are a replacement for a given object. They contain a SECOND type value containing the type of the replaced instance.

If the bulkdata object is contained in the bulkdata path, then the path shall be:
`bulkdata/hash0-3/hash3-5/hash5- (.json/.raw)`
This path mapping allows going from a hash value to a bulkdata location.  It is not necessary to know the hash algorithm in order to determine the hash path, as it is a simple split of the hash value.

### JSON Deduplicated format
The deduplicated format is a DICOM JSON object, with any number of tags removed and placed into JSON BulkData instances.  Those instances are referred to by hash value, in the following ways:
* DeduppedRef contains hash value strings
* Sequence elements MAY contain BulkDataURI, with a full path reference to the sequence bulkdata in the bulkdata path
* Sequence or Fragmented elements MAY contain a Fragments array, listing the hash value of each child value/element.
* If the Fragmented object is pixel data, then the hash value SHALL be that of the uncompressed pixel data
* If the Fragmented object is video data, then the hash value SHALL be that of the video stream
* If the type field is 'delete', it indicates that this object is removed

### Deduplicated Instance Object
The deduplicated instance objects are listed in the `instances/<StudyInstanceUID>` directories.  Each instance contains a single JSON deduplicated object, with referenced values contained in the bulkdata directory.  The contents of the JSON may be as little as a set of references to the relevant hash values, with all underlying data stored in the bulkdata, or can be as much as the full instance level metadata.  These files MAY be replaced with versions in the deduplicated top level directory.

#### Deduplicated Patient, Study, Series
At a minimum, the deduplicated instances SHALL remove three sets of data, corresponding to the patient, study and series level attributes, storing those in the bulkdata folder.

### Deduplicated List Objects
The `deduplicated/<StudyInstanceUID>` directory contains files which are lists of JSON objects which are the JSON Deduplicated objects for single instances, grouped into a single file for convenience.  The study contains the SUM of all the files, treated as though they were concatenated one after another.  However, it is not necessary to read all files all the time.  To avoid reading all the files, the latest file present may be read.
Any other file whose name is referenced by hash value in any DEDUPPED_REF field or DEDUPPED_HASH has already been incorporated into the file, and thus does not need to be re-read.  There may be more than two files required to be read, being a combination of two or more concurrent changes.

The combination of all the top level (leaf) files, not referred to by any other deduplicated list file should be written out as the `studies/<StudyInstanceUID>/deduplicated.gz` file when creating a full metadata instance file.  This file may additional contain any number of extracted data instances, that is the patient...series extracted data.  The timing on the write of this object is used to ensure cluster wide eventual consistency.  This file contains the hash value of the deduplicated set of data it was created from, and thus implicitly the set of data written to the study tree.

#### Removal of Deduplicated Objects
In order to preserve space constraints, it may be desirable to remove older deduplicated files, either the instances ones or the top level values.  This is safe to do as long as:
* The deduplicated file is referenced in a newer deduplicated file which is fully committed/written
* The original data instances are not required to be available
* The deduplicated file being removed is not in use.  As a suggestion, deduplicated instance files can be immediately removed, while deduplicated list files should remain at least 24 hours

#### Combining Deduplicated List Objects
Two or deduplicated objects may be combined by referencing all the deduplicated objects the new object is being combined from.  The new deduplicated object should be written atomically.  It should not contain the extracted data sets, as those are contained in the bulkdata directory.  Only the studies.../deduplicated.gz file may contain the extracts, as those are "current version" instances.

## Study QC
Various types of study quality control, such as patient data updates, split, segment and delete are all possible on the deduplicated data.

### Patient and Study Updates
A patient or study update is performed by writing a new bulkdata Patient or Study record, and then writing a new deduplicated list, with the study or patient element updated inline, and with it having a `DeduppedReplace` listing the older hash values, and every location that value is referenced replaced with the new hash value.  

If the study instance UID is being updated, then the deduplicated record should contain a new Study Instance UID reference, and should be written in both the old and new study locations.  That allows automaticaly moving the old data to the new location.  This may need some additional consideration as to how to handle this appropriately.

### Instance Replace and Delete
Instance deletes are performed by writing a new instance record in the dedupped list, containing the original SOP Instance UID, and the `DeduppedReplace` or `DeduppedDelete` tag set.  

### Split/Segment
A split or segment operation is performed in the same way as the instance replace, with two records replacing the original data.  The first record is a delete one on the original items, while the second one is a DeduppedReplace object referencing the original object.
This operation requires copying the original frames/pixel data from the old location to the new one.

Also, and DICOM references to the old SOP instance UID should be replaced with new ones.

If the instance is being moved to a new study, then look at the study updates information.

## Concurrent Updates
The creation of the deduplicated instances or lists initially, plus the writing of BulkDataURI referenced items and frame data is thread safe across any number of sites, provided that a single DICOM instance containing different data is never sent at the same time.

QC operations done in parallel may result in conflicts which need to be resolved via human interaction.  However, it is at least possible to detect whether such operations are identical or can be automatically applied.

## Performance Considerations
There are a number of performance optimizations already present, or possible to use:
* Have the client use direct access to the latest dedupplicated.gz file, and don't store the remainder of the DICOMweb files.
* Store the metadata etc files in GZIP (this is required above)
* Use lazy generation of the DICOMweb instances - either based on about to view or on demand (optimizes space)
* Store deduplicated/instances on local/fast storage system, group at short interval (1 minute?)
* Cluster receive operations into many instances - since it is cluster thread safe, the receive can be done across many instances, some local to hospitals
* ZIP storage of bulkdata - one or more ZIP files can be written containing bulkdata.  These have to each be opened, but they are far more storage efficient than individual files.  This part is still being considered.
  * For large image frame writes, the time to write many small files increases up to ten times the time for few files.  This could also be dealt with by using a hierarchical data structure.

## Creation of DICOM Part 10
In the same way that the metadata and bulkdata files can be written, the deduplicated instances can be used backwards, reading all the bulkdata attributes when required and writing out the full DICOM part 10 instance data.  This results in fully updated part 10 files, and it should be possible to write these extremely quickly because large parts of the files
are simply streamed from bulkdata locations.