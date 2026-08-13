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

The build runs packages one at a time (`--concurrency 1`) to avoid hangs with Bun 1.3.x when multiple `bun build` processes run in parallel. If you need a faster build and do not see hangs, use `bun run build:parallel`.

## Docker Usage

There are scripts in the root package to create a new docker deployment and to run it linking ports 25080 and 25104 to the DICOMweb and SCP endpoint. To create/start this, run:

```bash
bun docker:build
bun docker:run
```

This will drop you into a bash shell and you can run mkdicomweb create or other
commands such as dicomwebserver to convert dicom data.  The /dicom directory
will have been mounted from `/a/dicom` as an available mount point.

You can then run the dicom websererver using:

```bash
bun docker:dicomwebserver
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

# Alternate Renditions and Brick Stores

`createdicomweb` has two secondary operations that act on an **already created** DICOMweb tree,
addressed by study UID rather than by source directory:

- `alternates` writes additional renditions of the pixel data beside the existing `frames/`,
  including the hierarchical `brick/` store used for off-axis (MPR) display;
- `transcode` rewrites the primary `frames/` themselves from uncompressed to JPEG-LS lossless.

Neither one touches the `create` operation, and `alternates` never writes or deletes `frames/`,
so the primary rendition stays byte identical whatever it generates. Both are single threaded,
idempotent and resumable: output that already exists is skipped unless `--force` is passed, so a
run interrupted part way through a study completes rather than repeating itself.

## Generating alternate renditions

```bash
createdicomweb alternates <studyUID> \
  [--dicomdir <path>]            # default ~/dicomweb
  [--series-uid <seriesUID>]     # default: every series in the study
  [--jls] [--jls-thumbnail] [--htj2k] [--htj2k-lossy] [--brick]
  [--brick-order <z-minor|plane-major>]   # default z-minor
  [--brick-codec <jls|htj2k>]             # default jls
  [--brick-size <N>]                      # default 64, positive even integer
  [--force] [--json]
```

At least one of `--jls`, `--jls-thumbnail`, `--htj2k`, `--htj2k-lossy` or `--brick` is required.
They are independent and can all be asked for in one pass, which is what makes a comparison
across them fair: every one is built from the same decode of the same frames.

Per-frame renditions are written as `multipart/related`, the same shape `frames/` uses, so an
existing image loader reads them by substituting the path:

| Flag | Directory | Transfer syntax | Contents |
| --- | --- | --- | --- |
| `--jls` | `jls/` | `1.2.840.10008.1.2.4.80` | full resolution JPEG-LS lossless |
| `--jls-thumbnail` | `jlsThumbnail/` | `1.2.840.10008.1.2.4.80` | quarter resolution JPEG-LS lossless |
| `--htj2k` | `htj2k/` | `1.2.840.10008.1.2.4.201` | full resolution HTJ2K lossless |
| `--htj2k-lossy` | `htj2kLossy/` | `1.2.840.10008.1.2.4.203` | full resolution HTJ2K lossy |
| `--brick` | `brick/` | per `--brick-codec` | hierarchical brick pyramid, series level |

Renditions are grayscale only; colour instances are skipped with a logged reason and the command
still exits 0. A non-zero exit means a series errored, not that a series was ineligible.

### Size and compression report

`alternates` finishes with a per-series and per-study summary measured from bytes actually on
disk. Each rendition's compression ratio is computed against the raw voxel count of **its own**
dimensions, so a quarter resolution thumbnail is not credited with a 16x ratio it did not earn.
The brick store additionally reports its size as a percentage of `frames/`, which is the number
that decides whether the store is affordable.

`--json` emits the same figures as a single JSON document on stdout, with the human readable
progress and summary redirected to stderr, so results can be collected across a corpus without
scraping.

## The brick store

A brick store is a resolution pyramid of small cuboids of voxels, generated so that a viewer can
fetch an arbitrary oblique plane by reading a handful of objects rather than the whole series.

**Levels.** Named by downsample factor: `d1`, `d2`, `d4`, and so on. Which axes each step reduces
comes from the **voxel spacing** rather than from a single factor - an axis is halved when its
samples are more than half an octave (sqrt(2)) closer together than the coarsest axis'. On
isotropic data every step halves all three axes and the ladder is the familiar uniform one; on
5 mm slice data the in-plane axes are brought in first, so coarse levels are physically rather
than numerically cubic, and their names carry all three factors: `d8_8_2`. Levels are generated
by 2x2x2 (or 2x2x1) **box averaging**, never decimation - decimation aliases, which fabricates
structure rather than blurring it.

**Bricks.** `--brick-size` cubed, 64 by default. Bricks are stored at their true extent rather
than zero padded, and a level small enough to be worth a single request is stored as one brick
shaped like the level. Each brick is one codestream, packed as a 2D image whose rows interleave
the two slow axes:

- `z-minor` (default): row `r = y * extentZ + z`, so the encoder's above-neighbour is
  `(x, y, z-1)` - through-plane correlation, best on near-isotropic data;
- `plane-major`: row `r = z * extentY + y`, so the above-neighbour is `(x, y-1, z)` - in-plane
  correlation, better on thick slices where neighbouring slices are less alike than neighbouring
  rows.

The resolved order is recorded in the manifest, so the writer and the reader cannot disagree.

**Paths and manifest.** The store lives at the series level:

```
studies/{study}/series/{series}/brick/
  manifest.json
  {level}/{t###}/{k###}/y{ky}x{kx}.jls      # .jhc with --brick-codec htj2k
```

`{k###}` is the brick index along z; `{t###}` is one component per **non-spatial** axis (time,
channel, b-value) and is omitted entirely for a plain 3D series. Non-spatial axes are indexed,
never subsampled - every time point is wanted at reduced spatial resolution, not half the time
points. `manifest.json` carries the axes, the per-level sizes, factors, brick pitch and brick
counts, the brick order, the spacing and the transfer syntax, and is written **last**, so its
presence is what marks a store complete.

**Private tag.** Each instance of a bricked series gets, under private creator `RadicalImaging`
in the group `0009` block already used for Content-Location:

```
(0009,0010) LO  PrivateCreator     "RadicalImaging"
(0009,10E0) UR  BrickManifestURI   "series/{seriesUID}/brick/manifest.json"
```

Levels, brick size and transfer syntax stay in the manifest rather than in DICOM, so the layout
can change without a tag change.

**Eligibility.** A series is skipped, with a reason, rather than failed when it is non-grayscale,
a single frame, has fewer than 16 spatial slices, has all its frames at one `ImagePositionPatient`
(a cine or dynamic 2D series, whose third index is time rather than space), or does not lie on a
regular rectilinear grid - irregular slice spacing, gantry tilt, non-coplanar frames or ragged
sampling. Resampling those onto a grid they do not lie on is future work.

## Transcoding the primary frames

```bash
createdicomweb transcode <studyUID> [--dicomdir <path>] [--series-uid <uid>] [--to jls] [--force]
```

Rewrites `frames/` from uncompressed (`1.2.840.10008.1.2`, `.1.2.1`, `.1.2.2`, `.1.2.1.99`) to
JPEG-LS lossless, and updates `AvailableTransferSyntaxUID` on the instance. Only grayscale
(`SamplesPerPixel == 1`, `MONOCHROME1`/`MONOCHROME2`) instances are converted; colour and already
compressed instances are left untouched. Frames are staged beside the instance and moved into
place only once every frame of that instance has encoded, so a failure part way through leaves
the original frames intact.

## Note on thumbnail reduction

Reduction for thumbnail-sized renditions is now a **box average** rather than the previous
nearest-neighbour `replicate`. This changes existing `jlsThumbnail` and `alternateThumbnail`
output: nearest-neighbour decimation aliases, folding high frequency content into the displayed
band. Where the attributes are available, the average is taken over true pixel values rather than
stored words, pixel padding is left out of the average, and segmentation label maps take the
first occupied sample of each box instead of a mean - the mean of two labels is a third segment
that is in neither place.

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
