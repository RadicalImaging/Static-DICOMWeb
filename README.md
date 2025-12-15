# Static DICOMweb aka `static-wado`

The Static DICOMweb project is a project to create a web-centric PACS system optimized for DICOMweb.  
The project was started out of some scripts that converted binary DICOM files into static wado (DICOMweb) files, but has been extended to cover additinal areas.

The goals of the project are to:

1. Optimize serving of DICOMweb files needed for OHIF viewing
   - Serve required DICOMweb files straight from disk
   - Compress data files on disk to minimize storage
2. Support fully distributed, eventually consistent data model
   - Incoming data can be distributed amongst any number of nodes
   - Serving of data can be done by distributing the storage of data, with or without replication
   - Network fault tolerance is supported by updating study data once network recovers
3. Deploy to a variety of cloud providers
   - AWS is currently the only one supported
   - Local current-machine provider is also done
4. Demonstrate enhanced metadata structures
   - Easier to parse/understand than DICOMweb metadata
   - Smaller than DICOMweb metadata, sometimes as small as 1/100th of the size
   - Faster to parse/display first image

See [Design](./packages/static-wado-creator/docs/design.md) for more details on the general design of Static DICOMweb.

See [File Structure](./file-structure.md) for more details on the file structure used for static-dicomweb.

# General Installation

There are two ways to install Static DICOMweb. First, the command line tools are available published in npm. This is easiest if you are just running locally. The second option is to install from source code, locally.
A third option is to run the tools and deployment in a docker container.

## Prerequisite
When you choose to install the pre-built version, or build the code yourself, you will need [bun](https://www.npmjs.com/package/bun) installed, e.g.
```bash
npm install -g bun
```

## NPM Install

To install the command line tools, you need to have a current version of node and npm installed, then run:

```bash
npm install -g @radicalimaging/static-wado-creator
npm install -g @radicalimaging/static-wado-webserver
npm install -g @radicalimaging/static-wado-scp
```

## Source Install

You can install locally using git, yarn, npm and node:

```bash
git clone https://github.com/RadicalImaging/Static-DICOMWeb.git static-wado
cd static-wado
bun install
bun run build
bun link:exec
```

## Docker Usage

There are scripts in the root package to create a new docker deployment and to run it linking ports 25080 and 25104 to the DICOMweb and SCP endpoint. To create/start this, run:

```bash
yarn docker:build
yarn docker:run
```

After this is running, you can use the `mkdicomweb create <DICMFILES>` to store to the dicomwebserver, and query
against `http://localhost:25080/dicomweb/studies`. You should store to `/dicomweb` or you can run some specific commands to store to the system:

```bash
bun docker:run
```

Another option is to use the [dcm4che](https://sourceforge.net/projects/dcm4che/files/dcm4che3/5.33.1/) stowrs command, like this:

```bash
stowrs --url http://localhost:25080/dicomweb/studies DICM_FILES
curl http://localhost:25080/dicomweb/studies
```

You can also run a docker build directly for various purpose. There are some general options that you might
want to know first:

### Persistent Data Sharing

There are a number of shared directories and files used to configure various settings, added as bind mounts.

```

// Bind mount for DICOMweb directory
--mount type=bind,source=/dicomweb,target=/dicomweb

// Bind mount for DICOM input files
--mount type=bind,source=/dicom,target=/dicom

// Bind mount for AWS credentials
--mount type=bind,source=/users/userName/.aws,target=/root/.aws,readonly

// Bind mount for persistent storage of AWS configuration
--mount type=bind,source=/dicomweb,target=/dicomweb

```

```bash
// Deploy the default build image
docker run  --mount type=bind,source=/dicomweb,target=/dicomweb -p 25080:5000 -p 25104:11112 -d braveheartsoftware/static-dicomweb:0.6
```

That will result in an instance running on port 25080 for dicomweb, and DIMSE services on 25104.

## Deployment to AWS

There are deployment scripts in src/s3-deploy which will create an S3 bucket for DICOMweb and optionally for OHIF as well.

# Using Static DICOMweb

- [Convert DICOM Part 10 to/from DICOMweb](./packages/static-wado-creator/README.md)
- [Deploy Static DICOMweb to AWS](./packages/s3-deploy/README.md)
- [Deploy OHIF Viewer Accessible Static DICOMweb](./packages/s3-deploy/README.md#deploy-ohif)
- [Storing Files to/from Cloud Server](./packages/static-wado-deploy/README.md)
- [Run local DICOMweb webserver](./packages/static-wado-webserver/README.md)
- [Run local SCP Server](./packages/static-wado-scp/README.md)
- [Serve off Nginx HTTP Server](./docs/nginx.md)
- ~~[Proxy DICOMweb to DICOM DIMSE](./packages/static-wado-webserver/dimse-proxy.md)~~
- ~~[Proxy Static DICOMweb to DICOMweb](./packages/static-wado-webserver/dicomweb-proxy.md)~~

# Configuration System for Static DICOMweb

The configuration system is based on a combination of [config-point](http://github.com/OHIF/config-point) and commander for the command line settings. The config-point definitions allow mixing default configuration values, with custom settings files, and then over-riding values with command line settings. There is a custom command line setting to load a specific additional configuration file, which is the `-c` setting, applied like this:

```
mkdicomweb -c tests/static-wado-remote.json5 create ...
```

Configuration files are JSON5 files, which allows for additional flexibility by adding comments and using more relaxed syntax.
The default configuration file is the first one found of `./static-wado.json5` and `~/static-wado.json5`
The configuration files are loaded before the remainder of the command options are generated or parsed, so that the defaults come form the configuration file.

The config-point design allows for inheritance in the configuration. There are these basic configuration settings:

- staticWadoConfig containing the default overall configuration settings
- mkdicomwebConfig containing the mkdicomweb specific configuration
- aeConfig containing AE definitions
- dicomWebServerConfig containing the configuration for the web service, inheritting from staticWadoConfig
- dicomWebScpConfig containing the configuration for the scp service, also inheritting from staticWadoConfig

The idea is that shared values can be set inside staticWadoConfig, while values specific to the other servers are located in the other configuration settings. All of them share the aeConfig values. There isn't anything special about the configuration values, they are just a set of values, so it is entirely possible to not use those, and just create the full configuration settings programatically for other purposes.  
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

defines a shared root directory `/dicomweb`, used by all of mkdicomweb, dicomwebserver and dicomwebscp. However, the SCP and the mkdicomweb commands will write to the root dir, but won't proxy queries to `myProxyAe`, and thus reply with local data only. The dicomwebserver command, however, will access the proxyAe for retrieving missing data.

Additionally, this definition defines the proxy PACS AE configuration.

## Config Settings

### rootDir

The root dir defines the path for the created static DICOMweb files, and is used both for reading and writing.

### proxyAe and queryAe

The proxyAe is the AE name of a dimse service to fetch DICOM data from. This defaults to requiring a series level query in order to retrieve the study. That is, if the query `http://host/dicomweb/studies/1.2.3/series?...` is made, it will trigger a query to
`proxyAe`, to compare the current data in dicomweb with the data from the proxyAe. The queryAe is the name of the PACS system to use for querying, and will often be the same as proxyAe. This ae will also be used for studies level queries, to provide a complete list of study information.

### staticWadoAe

The static wado AE name is the name that static-wado uses when running `dicomwebscp` as the SCP name. As such, it provides both a C-Store as well as a C-Find SCP. It is also the name of the SCU used for outgoing queries to the queryAe or the proxyAe.
