# AWS HealthLake Store
This tool is based on static-dicomweb, and is designed to uplaod DICOM part 10 files to an AWS healthlake data store, run the generation on it, and then download the results to a local static-dicomweb service.  The local files can then be indexed and used to generate/update DICOMweb servers.

## Prerequisites
A local install/link of static-dicomweb is required for running the tools

A command line install of dcm4che5 is also required  (eg dcm2dcm is needed to convert to LEI format)

A static-wado.json5 configuration file is required in the user's home directory.

## Command Options
Generally the command is run as:  `node bin\healthlakestore`, with the following sequence being used

* `node bin\healthlakestore lei  <DICOM-DIR-OR-FILE> -d curie -n <NAME>`
 * Converts the input, storing it into the ~/curie/lei output folder
* `node bin\healthlakestore upload <NAME> -d curie`
 * Uploaded ~/curie/<NAME> to AWS S3
* `node bin\healthlakestore convert <NAME> -d curie -j <JOBNAME>`
 * Initiates the healthlake conversion job, calling it JOBNAME, and taking the input from S3 in the lei/<NAME> directory.
* `node bin\healthlakestore download <JOBNAME> -d curie`
 * Downloads the files locally to ~/curie/studies/<studyUID> and creates the index file.  May need to be run multiple times until the conversion is complete.
* `mkdicomweb index -o ~/curie
 * Generates a studies index in the curie job area.


