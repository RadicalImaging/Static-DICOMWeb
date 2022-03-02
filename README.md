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

## How to configure Static-Wado as a DICOM DIMSE Proxy
For this configuration, the values   PACS for the AE name, 104 for the port number and pacs.hospital.com are used.  
After installing global versions of the scp and web server, run the following steps:

* Install the dcm4che toolkit (TODO - remove this requirement)
* Create a directory `static-wado-proxy`
* cd into that directory
* Copy the ohif build output to ./ohif
* Create a static-wado.json5 file with the contents below (edit values as required)
* Start in the current directory both the scp and web server  (dicomwebscp and dicomwebserver)

```js
{
  staticWadoConfig: {
    rootDir: ".",
  },

  // Configure a single AE as a proxy
  aeConfig: {
   PACS: {
      description: "Your PACS system",
      host: "pacs.hospital.com",
      port: 104,
    },
  },

  dicomWebScpConfig: {
    studyQuery: "studiesQueryToScp",
    queryAe: PACS,
  },

  // Configure the default studyQuery to be querying to the Scp
  dicomWebServerConfig: {
    studyQuery: "studiesQueryToScp",
    // Default command plus dcmsnd to store incoming STOW-RS data to the PACS.
    stowCommands: [null, "dcmsnd -L SCU PACS@pacs.hospital.com:104"],
    queryAe: "PACS",
    clientDir: "./ohif",
  },
}
```

## Configuration System
The configuration system is based on a combination of [config-point](http://github.com/OHIF/config-point) and commander for the command line settings.  The config-point definitions allow mixing default configuration values, with custom settings files, and then over-riding values with command line settings.  There is a custom command line setting to load a specific additional configuration file, which is the `-c` setting, applied like this:
```
mkdicomweb -c tests/static-wado-remote.json5
```
Configuration files are JSON5 files, which allows for additional flexibility by adding comments and using more relaxed syntax.
The default configuration file is the first one found of `./static-wado.json5` and `~/static-wado.json5`
The configuration files are loaded before the remainder of the command options are generated or parsed, so that the defaults come form the configuration file.

The config-point design allows for inheritance in the configuration.  There are these basic configuration settings:
* staticWadoConfig containing the default overall configuration settings
* mkdicomwebConfig containing the mkdicomweb specific configuration
* aeConfig containing AE definitions
* dicomWebServerConfig containing the configuration for the web service, inheritting from staticWadoConfig
* dicomWebScpConfig  containing the configuration for the scp service, also inheritting from staticWadoConfig

The idea is that shared values can be set inside staticWadoConfig, while values specific to the other servers are located in the other configuration settings.  All of them share the aeConfig values.  There isn't anything special about the configuration values, they are just a set of values, so it is entirely possible to not use those, and just create the full configuration settings programatically for other purposes.  
An example configuration file, would be:
```
{
  staticWadoConfig: {
    rootDir: "/dicomweb",
  },
  dicomWebServerConfig: {
    proxyAe: "myProxyAe",
  },
  aeConfig: {
    myProxyAe: {
      description: "A proxy AE to use",
      host: "proxyAe.hospital.com",
      port: 104,
    },
  }
}
```
defines a shared root directory `/dicomweb`, used by all of mkdicomweb, dicomwebserver and dicomwebscp.  However, the SCP and the mkdicomweb commands will write to the root dir, but won't proxy queries to `myProxyAe`, and thus reply with local data only.  The dicomwebserver command, however, will access the proxyAe for retrieving missing data.

Additionally, this definition defines the proxy PACS AE configuration.

## Config Settings

### rootDir
The root dir defines the path for the created static DICOMweb files, and is used both for reading and writing.

### proxyAe and queryAe
The proxyAe is the AE name of a dimse service to fetch DICOM data from.  This defaults to requiring a series level query in order to retrieve the study. That is, if the query `http://host/dicomweb/studies/1.2.3/series?...` is made, it will trigger a query to 
`proxyAe`, to compare the current data in dicomweb with the data from the proxyAe.  The queryAe is the name of the PACS system to use for querying, and will often be the same as proxyAe.  This ae will also be used for studies level queries, to provide a complete list of study information.

### staticWadoAe
The static wado AE name is the name that static-wado uses when running `dicomwebscp` as the SCP name.  As such, it provides both a C-Store as well as a C-Find SCP.  It is also the name of the SCU used for outgoing queries to the queryAe or the proxyAe.

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