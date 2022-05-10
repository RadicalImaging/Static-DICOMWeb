import { nanoid } from 'nanoid';
import {APIInitiate, APIResponse} from '../model/APIModel';
import {readFile} from 'fs/promises';
import JSON5 from 'json5'

async function loadJSON5(filename: string) {
  const json5 = await readFile(filename, 'utf8');
  return JSON5.parse<APIResponse>(json5);
}

class APIRequest{
    requestNamespace:string;
    apiRequest:APIInitiate;
    constructor(namespace:string, apiRequest: APIInitiate) {
        this.requestNamespace = namespace;
        this.apiRequest = apiRequest;
    }
}
const apiRequestContexts = new Map<string, APIRequest>();
const apiResults = new Map<string, APIResponse>();



async function createAPIRequest(namespace: string, apiRequest: APIInitiate) {
    const jobId = nanoid();
    apiRequestContexts.set(jobId, new APIRequest(namespace, apiRequest));
    return jobId;
}

async function findAPIRequest(namespace: string, jobId: string, sampleResponse: string) {
    const apiRequestContext = apiRequestContexts.get(jobId);
    if(!apiRequestContext || apiRequestContext.requestNamespace!==namespace) {
        return;
    }
    const apiResult = apiResults.get(jobId);
    let result = undefined;
    if(apiResult) {
        result = updateResult(jobId, apiResult);
    } else {
        const template = await loadJSON5(sampleResponse);
        result = mapRequestToTemplate(jobId, apiRequestContext.apiRequest, template)
    }

    return result;
}

function mapRequestToTemplate(jobId: string, apiRequest: APIInitiate, template: APIResponse) {
    const result = {...template};
    result.job.jobId = jobId;
    result.job.jobProgress = 50;
    result.job.requestDateTime = new Date().toISOString();
    apiResults.set(jobId, result);
    return result;
}

function updateResult(jobId: string, apiResult: APIResponse) {
    const result = {...apiResult};
    result.job.jobProgress = 100;
    result.job.jobStatus = 'COMPLETED';
    apiResults.set(jobId, result);
    return result;
}

exports.createAPIRequest = createAPIRequest;
exports.findAPIRequest = findAPIRequest;

