# `root`

> Lerna Monorepo package containing static-wado packages.

## Packages
--- static-wado-creator
--- static-wado-scp
--- static-wado-util
--- static-wado-webserver

Most of commands runs at root level and lerna is responsible to manager running on packages, such as:
- lint
- test
- build

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
    * Get bulkdata refs written properly
* Enhance cli
    * Add support for specifying bulkDataMinSize
    * Add support for writing out DICOM P10 file
* Enhance library
    * Write out "info" file
        * P10 Header
        * Data needed to recreate original P10 instance
* Create DICOMweb -> DICOM P10 tool

