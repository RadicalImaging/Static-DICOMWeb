# `static-wado`

The static wado project is a project to create a web-centric PACS system based on DICOMweb.  The project was started out of
some scripts that converted binary DICOM files into static wado (DICOMweb) files, but has been extended to cover more
areas.  There are a few parts to the idea of "static" wado files:

1. Store data organized by RESTful path in DICOMweb
2. Separate data in separate objects organized by how it is accessed, NOT how it is provided
3. Compress the data (gzip for JSON files and image compression for images)
4. Store deduplicated data in a write once fashion for fast retrieves as well as efficient updates

That is basically it.  All of the other operations are on top of those four basic principles.

## How to build a mini-PACS system with OHIF
What you need to do is run the dicomweb scp and server components to accept incoming images and serve up the data, complete with the OHIF client.  This can be done with the following steps:

1. Clone the OHIF Viewer project using `git clone https://github.com/OHIF/Viewers.git`
2. Clone the static-wado project using `git clone https://github.com/OHIF/static-wado.git`
3. Run `yarn install` in both directories
4. Build a copy of the OHIF viewer with: `APP_CONFIG=config/local_static.js yarn build`  
5. Copy the build output to `~/ohif`  (from Viewers/platform/viewer/dist)
6. Install the dicomwebscp from static-wado/packages/static-wado-scp  with the command `npm install -g`
7. Install the dicomwebserver from `static-wado/packages/static-wado-server` with the command `npm install -g`
8. Start the SCP with `dicomwebscp`
9. Start the web server with `dicomwebserver`
10. Send in images to the AE  SCP@localhost:11112
11. Display studies on the webpage http://localhost:5000
12. Add a proxy service to add authentication and encryption to http://localhost:5000
13. Configure your modalities to send to `SCP@<hostname>:11112`

This provides a very basic PACS system.

## Packages
The packages are organized using lerna as a package manager, combined yarn.  Most packages provide commands in the bin directory which can be installed using `npm install -g`.
The top level package is responsible for:
- lint
- test
- build

### `static-wado-creator`
The creator package provides the functionality to convert objects to and from binary DICOM, as well as providing command line tools to invoke the library.

### `static-wado-scp`
The scp package provides a javascript based SCP, that stores C-Store data into the static data files.  In the future, it is expected to also convert from DICOMweb objects back into binary DICOM.

### `static-wado-webserver`
The webserver component is a very simple script that serves up the files, setting the appropriate content types and performing a limited amount of redirection.  This allows serving both the OHIF client as well as a dicomweb directory.

Additionally, the webserver supports plugin modules to enable enhanced functionality, such as serving up filtered responses, or performing database queries to decide on object responses.

### `static-wado-util`
Utilities

## Pre-requisites

* NodeJS >=v14.18.1
* NPM >=6.14.15
* Yarn >=1.22.4

## Development

## Installation
Install packages
on root
```
yarn install
```

Ensure packages are linked (see below).

## Package development
To run package's binary see above.
To develop changes for specific package see packages' documentation.

### Tests
There are two types of tests: unit and e2e.
**Jest** is the test runner and **must** is used for matchers.

Folder structure:
packageName:
     |
     |____ e2e Here goes e2e tests
     |____ unit Here goes unit tests


### Running Tests

> yarn run test

A visual studio code build task is also included so you can run it from there with "Terminal->Run Build Task" (Shift+Command+B)


## Linking packages
Link all packages using yarn/lerna to link packages in the correct other.
on root
```
yarn run link:exec
```

This will install packages globally on current global prefix, @see @link{https://docs.npmjs.com/cli/v8/commands/npm-link} and @see @link{https://docs.npmjs.com/cli/v8/commands/npm-prefix}, and, also bins will be generated inner ```{prefix}/bin/{name}```

If process success a log message will be shown with binaries' path location.


## Running binaries
Firstly, ensure your binaries' path location is set on your computer path.
Then you just run binary command (as usual on your command line) as described on each package's documentation.


### Code quality
Only lintted codes are pushed to remote. For that we use husky and pre-commit hook.
For linting is set up eslint + prettier (for some formatting rules)

You can run at any time the linters for all packages by:
```
  yarn run lint
```

or in case you want to also run eslint autofix

```
  yarn run lint:fix
```

## TODO (Looking for help here!!)

* Create docker container to encapsulate build environment
* Create test data (DICOM P10 and expected DICOMweb results) - Jordan working on this
* Document API
* Create CI + Publish to NPM
* Fix Bugs
* Enhance cli
    * Add support for specifying bulkDataMinSize
    * Add support for writing out DICOM P10 file
* Enhance library
    * Write out "info" file
        * P10 Header
        * Data needed to recreate original P10 instance
* Create DICOMweb -> DICOM P10 tool
* Add a set of tools to perform Patient and Study (QC) updates
* Add a study/patient only database for query support