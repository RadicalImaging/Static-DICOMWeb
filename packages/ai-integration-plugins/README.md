# `@ohif/ai-integration-plugins`

static-wado plugins specific to ai-integration testing. 

## Pre-requisites
View root pre-requisites section [pre-requisites](../../README.md#pre-requisites)

## Development
View root development section [development](../../README.md#development)

Additionally, changes to typescript files do require a yarn build of this module to regenerate the compiled .js versions.

## Usage
These plugins provide handlers for restful requests, and will respond with sample data. The plugin includes a typescript model for APIRequests and APIResponses.

The expected request flow is:

1) POST a request to an API - ex:
    POST /ai/api/generate-contours
    --
    body:
```
{
    "algorithm": {
        "algorithmName": "alg1",
    },
    "selection": [
        {
        "series": [
            {
            "instances": [
                {
                "frame": 1,
                "isInView": true,
                "selectionCodes": [
                    "OHIF:FrameInView"
                ],
                "sopInstanceUID": "1.2.3.1.1",
                }
            ],
            "seriesInstanceUID": "1.2.3.1",
            }
        ],
        "studyInstanceUID": "1.2.3"
        }
    ]
}
```
    The request will respond with a jobId, or an error response.

2. GET status updates for a request
    GET /ai/api/generate-contours/:jobId
   
    - see sample test data - ex: [test contours response](../static-wado-webserver/tests/ai/sampleContoursResponse.json5) for example responses
    - the response will include job details such as:
```
{
    "job": {
    "jobProgress": 50,
    "jobStatus": "STARTED",
    "requestDateTime": "2022-05-10T20:09:24.616Z",
    "jobId": "n4zUNbpb1C2CDpXPb3BWR"
}
```
    - the GET request may be invoked repeatedly to obtain progressive results and identify when complete.
