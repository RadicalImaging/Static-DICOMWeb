# `@ohif/static-wado-creator`

# static-wado-js

Status: Beta - in development (as of Oct 25, 2021)

The scope of this project is to convert DICOM P10 into a format into a DICOMweb compatible format - specifically JSON metadata, frames and bulkdata.  This library will enable the following:
* Building of DICOMweb compliant services
  * Ability to stream the data for "on the fly" use cases
* Ability to pregenerate DICOMweb responses and store them so they can be served up with a standard HTTP server to implement a subset of DICOMweb WADO-RS, specifically:
  * Retrieve instance metadata 
  * Retrieve series level metadata
  * Retrieve frames in an instance
  * Retrieve bulk data
  * Retrieve study, series or instance query
* To explore an alternative archive format that is web friendly (no need for a DICOM parser)
  * Should be able to recreate DICOM P10 file from this data (semantic equivalence or possibly bit for bit equivalent)
  * Will make updates more efficient (e.g. updating patient name just requires updating metadata)
  * More efficient image access (no need to scan through DICOM P10 to access frames, or store the offsets of each frame separately and seek to them) 

The scope of this library is limited to:
* Taking one or more DICOM files as input, writing Bulkdata and Pixeldata
* Creating either deduplicated representations or instance level metadata
* Combining deduplicated representations into sets of deduplicated representations
* Using the deduplicated representations to generate study/series/instance query results and series metadata

View the [design rationale](docs/design.md) for more information on the scope

View [frequently asked questions](docs/faq.md)

View [specification](docs/spec.md)

## Pre-requisites
View root pre-requisites section [pre-requisites](../../README.md#pre-requisites)

## Development
View root development section [development](../../README.md#development)

## Running the CLI
Install the CLI with either npm install -g .  or npm install -g @ohif/static-wado-js

## Usage
Once you install the package the executables (i.e static-wado commands) are installed into to your PATH system, then you can use anywhere on your command line program.

### Api
There are 5 different commands: mkdicomweb, mkdicomwebinstances, mkdicomwebstudy, mkdicomwebdeduplicated, mkdicomwebdeduplicatedgroup that can be used (see usage bellow). It can be run as:

```
commnadName [options] [<input...>]
```

Arguments are:

input
 : List of directories/files separated by space.
 Required for commands: **mkdicomweb**, **mkdicomwebdeduplicated**, **mkdicomwebinstances**. Optional for the others. This argument should be placed at end of command invoking.

The options are:

  -c, --clean
  : Clean the study output directory for these instances (default: false)
  
  -C, --remove-deduplicated-instances
  : Remove single instance deduplicated files after writing group files (default: false)
  
  -d, --deduplicate
  : Write deduplicate instance level data (default: false)
  
  -g, --group 
  : Write combined deduplicate data (default: true)
  
  -i, --instances
  : Write instance metadata (default: false)
  
  -m, --maximum-inline-public-length <value>
  : Maximum length of public binary data (default: 131074)
  
  -M, --maximum-inline-private-length <value>
  : Maximum length of private binary data (default: 64)
  
  --no-recompress
  : Force no recompression
  [see](#to-recompress)

  --no-recompress-thumb
  : Force no recompression for thumbnail
  [see](#to-recompress-thumb)
  
  -o, --dir <value>
  : Set output directory (default: "~/dicomweb")
  
  --path-deduplicated <path>
  : Set the deduplicate data directory path (relative to dir) (default: "deduplicated")
  
  --path-instances <path>
  : Set the instances directory path (relative to dir) (default: "instances")
  
  -r, --recompress <listvalue...> 
  : List of types to recompress separated by comma (choices: "uncompressed", "jp2", "jpeglossless", "rle", default: "uncompressed jp2")
  [see](#to-recompress)

  --recompress-thumb <listvalue...> 
  : List of types to recompress thumb separated by comma (choices: "uncompressed", "jp2", "jpeglossless", "rle", default: "uncompressed jp2")
  [see](#to-recompress-thumb)
  
  -s, --study
  : Write study metadata - on provided instances only (TO FIX}, (default: true)
  
  -t, --content-type <type>
  : Content type (default: null)
  
  -T, --colour-content-type <value>
  : Colour content type (default: null)
  
  -v, --verbose
  : Write verbose output (default: false)
  
  -V, --version
  : output the version number

### Help command
You can output help information by:
```
commandName help
```

```
commandName -h
```

```
commandName --help
```

### To create instances
Run the tool:
```
mkdicomwebinstances <directoryOfP10Files>
```

### To create a full DICOMweb output structure
Run the tool:
```
mkdicomweb <directoryOfP10Files>
```

### To run separated stages
The mkdicomweb tool runs the three stages all together, on just the studies references.  This can instead be done on separate files by running:
```
mkdicomwebdeduplicated  <directoryOfP10Files>
mkdicomwebdeduplicatedgroup
mkdicomwebstudy
```
which creates a full study directory.  The first stage writes to ~/dicomweb/instances/<studyUID>/ data about each instance as it is read in.  The second stage then groups these files for more efficient compression into the ~/dicomweb/deduplicated/<studyUID>/   The last stage then creates the actual DICOMweb files.

There is currently no notification of what studies have been updated between stages.  The intent is to write notifications to ~/dicomweb/notifications/<studyUID> of what operations need to be applied/updated.

### To Serve Instances As a Web Server
```
cd ~/dicomweb
npx http-server -p 5000 -g --cors
```

The -g option serves up compressed files ending in .gz as compressed http streams.

### To Create DICOM part 10 from DICOMweb files
TODO

Run the tool mkdicomwebpart10 on the studyUID, and optionally on the series/instance UID's of interest to generate a local set of part 10 files.

### To Update DICOM Metadata
TODO

Run the tool
```
mkdicomwebupdate -<delete/anonymize/patient/study/series/instance> <studyInstanceUID> (tag=newValue)* 
```
to delete the given item or to update the specified attribute contained in the given level.  Multiple mkdicomwebupdate commands may be run to perform updates on different attribute sets, or they may be grouped into a single file for bulk application.

### To recompress
It allows commands to recompress data/metadata prior writing it to local. Currently, if recompress is activate the designed data types will be transcoded [see](#recompress-aliases-and-input-transfer-syntaxes).

By default the recompression occurs for incoming types: uncompressed, jp2
```
mkdicomweb ./folderName
```
It will recompress any existing data that transfers syntaxes are 1.2.840.10008.1.2.4.90, 1.2.840.10008.1.2.4.91, 1.2.840.10008.1.2, 1.2.840.10008.1.2.1 and 1.2.840.10008.1.2.2.


Define incoming types for recompression of: uncompressed,jp2,rle
```
mkdicomweb  -r uncompressed jp2 rle ./folderName
```
It will recompress any existing data that transfers syntaxes: 1.2.840.10008.1.2.4.90, 1.2.840.10008.1.2.4.91, 1.2.840.10008.1.2, 1.2.840.10008.1.2.1, 1.2.840.10008.1.2.2 and 1.2.840.10008.1.2.5 to transfer syntax 1.2.840.10008.1.2.4.80.

Force no recompression
```
mkdicomweb  -r uncompressed jp2 rle --no-recompress ./folderName
```
It will NOT recompress any existing data but instead it will keep them in the original encoding.

Force no recompression
```
mkdicomweb --no-recompress ./folderName
```
It will NOT recompress any existing data but instead it will keep them in the original encoding.

Obs: --no-recompress forces no compression at all. Use it if you want to disable even the default behavior.


### Recompress aliases and input transfer syntaxes
The table below shows the support for transfer syntax recompression(i.e use "... -r jp2" if you want to recompress from 1.2.840.10008.1.2.4.90 to 1.2.840.10008.1.2.4.80)

| TransferSyntaxUID      	| Name                                                    	| Recompress alias 	|  Target TransferSyntaxUID |
|------------------------	|---------------------------------------------------------	|------------------	|--------------------------	|
| 1.2.840.10008.1.2      	| Implicit VR Endian                                      	| uncompressed     	| 1.2.840.10008.1.2         |
| 1.2.840.10008.1.2.1    	| Explicit VR Little Endian                               	| uncompressed     	| 1.2.840.10008.1.2.1       |
| 1.2.840.10008.1.2.2    	| Explicit VR Big Endian                                  	| uncompressed     	| 1.2.840.10008.1.2.1       |
| 1.2.840.10008.1.2.4.57 	| JPEG Lossless, Nonhierarchical (Processes 14)           	| jpeglossless     	| 1.2.840.10008.1.2.4.80    |
| 1.2.840.10008.1.2.4.70 	| JPEG Lossless, Nonhierarchical, First- Order Prediction 	| jpeglossless     	| 1.2.840.10008.1.2.4.80    |
| 1.2.840.10008.1.2.4.90 	| JPEG 2000 Image Compression (Lossless Only)             	| jp2              	| 1.2.840.10008.1.2.4.80    |
| 1.2.840.10008.1.2.4.91 	| JPEG 2000 Image Compression                             	| jp2              	| 1.2.840.10008.1.2.4.80    |
| 1.2.840.10008.1.2.5    	| RLE Lossless                                            	| rle              	| 1.2.840.10008.1.2.4.80    |


### To recompress thumb
It tells thumbnail creation to use recompressed data or not.
The list of types MUST be necessarily a subset of recompress list.

Obs: --no-recompress-thumb forces to not use compression at all. Use it if you want to disable even the default behavior.

By default the recompression occurs for incoming types: uncompressed, jp2. This will recompress the types mentioned and will generate the thumbnails with the result of data recompression.

```
mkdicomweb ./folderName
```

Force recompression thumb. This will recompress the types: uncompressed jp2 rle, thumbnails creation will use original data for all types except jp2 (which will use recompress data).
```
mkdicomweb  -r uncompressed jp2 rle --recompress-thumb jp2 ./folderName
```

Skipping not recompressed data. This will recompress the types: uncompressed jp2, thumbnails creation will use original data for all types (since recompress-thumb list does not intersect with recompress list).
```
mkdicomweb  -r uncompressed jp2 --recompress-thumb rle ./folderName
```

Force no recompression thumb. This will recompress the types: uncompressed jp2 rle, but for thumbnails creation will use original data.
```
mkdicomweb  -r uncompressed jp2 rle --no-recompress-thumb ./folderName
```




## Development

## TODO (Looking for help here!!)

* Create docker container to encapsulate build environment
* Create test data (DICOM P10 and expected DICOMweb results) - Jordan working on this
* Document API
* Create CI + Publish to NPM
* Fix Bugs
    * Get bulkdata refs written properly
* Enhance cli
    * Add support for specifying bulkDataMinSize
    * Add support for writing out DICOM P10 file
* Enhance library
    * Write out "info" file
        * P10 Header
        * Data needed to recreate original P10 instance
* Create DICOMweb -> DICOM P10 tool

