# `@ohif/static-wado-util`

Util and common code shared between packages. 
It includes a factory to node commander package. It is a complete solution for command-line programs (i.e static-wado packages commands). 

## Pre-requisites

* NodeJS >=v14.18.1
* NPM >=6.14.15
* Yarn >=1.22.4

## Usage

```
const staticWadoUtil = require('@ohif/static-wado-util');

staticWadoUtil.configureProgram(configuration);
```
