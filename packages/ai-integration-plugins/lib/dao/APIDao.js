"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const nanoid_1 = require("nanoid");
const promises_1 = require("fs/promises");
const json5_1 = __importDefault(require("json5"));
function loadJSON5(filename) {
    return __awaiter(this, void 0, void 0, function* () {
        const json5 = yield (0, promises_1.readFile)(filename, 'utf8');
        return json5_1.default.parse(json5);
    });
}
class APIRequest {
    constructor(namespace, apiRequest) {
        this.requestNamespace = namespace;
        this.apiRequest = apiRequest;
    }
}
const apiRequestContexts = new Map();
const apiResults = new Map();
function createAPIRequest(namespace, apiRequest) {
    return __awaiter(this, void 0, void 0, function* () {
        const jobId = (0, nanoid_1.nanoid)();
        apiRequestContexts.set(jobId, new APIRequest(namespace, apiRequest));
        return jobId;
    });
}
function findAPIRequest(namespace, jobId, sampleResponse) {
    return __awaiter(this, void 0, void 0, function* () {
        const apiRequestContext = apiRequestContexts.get(jobId);
        if (!apiRequestContext || apiRequestContext.requestNamespace !== namespace) {
            return;
        }
        const apiResult = apiResults.get(jobId);
        let result = undefined;
        if (apiResult) {
            result = updateResult(jobId, apiResult);
        }
        else {
            const template = yield loadJSON5(sampleResponse);
            result = mapRequestToTemplate(jobId, apiRequestContext.apiRequest, template);
        }
        return result;
    });
}
function mapRequestToTemplate(jobId, apiRequest, template) {
    const result = Object.assign({}, template);
    result.job.jobId = jobId;
    result.job.jobProgress = 50;
    result.job.requestDateTime = new Date().toISOString();
    apiResults.set(jobId, result);
    return result;
}
function updateResult(jobId, apiResult) {
    const result = Object.assign({}, apiResult);
    result.job.jobProgress = 100;
    result.job.jobStatus = 'COMPLETED';
    apiResults.set(jobId, result);
    return result;
}
exports.createAPIRequest = createAPIRequest;
exports.findAPIRequest = findAPIRequest;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQVBJRGFvLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiQVBJRGFvLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7O0FBQUEsbUNBQWdDO0FBRWhDLDBDQUFxQztBQUNyQyxrREFBeUI7QUFFekIsU0FBZSxTQUFTLENBQUMsUUFBZ0I7O1FBQ3ZDLE1BQU0sS0FBSyxHQUFHLE1BQU0sSUFBQSxtQkFBUSxFQUFDLFFBQVEsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUMvQyxPQUFPLGVBQUssQ0FBQyxLQUFLLENBQWMsS0FBSyxDQUFDLENBQUM7SUFDekMsQ0FBQztDQUFBO0FBRUQsTUFBTSxVQUFVO0lBR1osWUFBWSxTQUFnQixFQUFFLFVBQXVCO1FBQ2pELElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxTQUFTLENBQUM7UUFDbEMsSUFBSSxDQUFDLFVBQVUsR0FBRyxVQUFVLENBQUM7SUFDakMsQ0FBQztDQUNKO0FBQ0QsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLEdBQUcsRUFBc0IsQ0FBQztBQUN6RCxNQUFNLFVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBdUIsQ0FBQztBQUlsRCxTQUFlLGdCQUFnQixDQUFDLFNBQWlCLEVBQUUsVUFBdUI7O1FBQ3RFLE1BQU0sS0FBSyxHQUFHLElBQUEsZUFBTSxHQUFFLENBQUM7UUFDdkIsa0JBQWtCLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxJQUFJLFVBQVUsQ0FBQyxTQUFTLEVBQUUsVUFBVSxDQUFDLENBQUMsQ0FBQztRQUNyRSxPQUFPLEtBQUssQ0FBQztJQUNqQixDQUFDO0NBQUE7QUFFRCxTQUFlLGNBQWMsQ0FBQyxTQUFpQixFQUFFLEtBQWEsRUFBRSxjQUFzQjs7UUFDbEYsTUFBTSxpQkFBaUIsR0FBRyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDeEQsSUFBRyxDQUFDLGlCQUFpQixJQUFJLGlCQUFpQixDQUFDLGdCQUFnQixLQUFHLFNBQVMsRUFBRTtZQUNyRSxPQUFPO1NBQ1Y7UUFDRCxNQUFNLFNBQVMsR0FBRyxVQUFVLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3hDLElBQUksTUFBTSxHQUFHLFNBQVMsQ0FBQztRQUN2QixJQUFHLFNBQVMsRUFBRTtZQUNWLE1BQU0sR0FBRyxZQUFZLENBQUMsS0FBSyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1NBQzNDO2FBQU07WUFDSCxNQUFNLFFBQVEsR0FBRyxNQUFNLFNBQVMsQ0FBQyxjQUFjLENBQUMsQ0FBQztZQUNqRCxNQUFNLEdBQUcsb0JBQW9CLENBQUMsS0FBSyxFQUFFLGlCQUFpQixDQUFDLFVBQVUsRUFBRSxRQUFRLENBQUMsQ0FBQTtTQUMvRTtRQUVELE9BQU8sTUFBTSxDQUFDO0lBQ2xCLENBQUM7Q0FBQTtBQUVELFNBQVMsb0JBQW9CLENBQUMsS0FBYSxFQUFFLFVBQXVCLEVBQUUsUUFBcUI7SUFDdkYsTUFBTSxNQUFNLHFCQUFPLFFBQVEsQ0FBQyxDQUFDO0lBQzdCLE1BQU0sQ0FBQyxHQUFHLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztJQUN6QixNQUFNLENBQUMsR0FBRyxDQUFDLFdBQVcsR0FBRyxFQUFFLENBQUM7SUFDNUIsTUFBTSxDQUFDLEdBQUcsQ0FBQyxlQUFlLEdBQUcsSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUUsQ0FBQztJQUN0RCxVQUFVLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQztJQUM5QixPQUFPLE1BQU0sQ0FBQztBQUNsQixDQUFDO0FBRUQsU0FBUyxZQUFZLENBQUMsS0FBYSxFQUFFLFNBQXNCO0lBQ3ZELE1BQU0sTUFBTSxxQkFBTyxTQUFTLENBQUMsQ0FBQztJQUM5QixNQUFNLENBQUMsR0FBRyxDQUFDLFdBQVcsR0FBRyxHQUFHLENBQUM7SUFDN0IsTUFBTSxDQUFDLEdBQUcsQ0FBQyxTQUFTLEdBQUcsV0FBVyxDQUFDO0lBQ25DLFVBQVUsQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQzlCLE9BQU8sTUFBTSxDQUFDO0FBQ2xCLENBQUM7QUFFRCxPQUFPLENBQUMsZ0JBQWdCLEdBQUcsZ0JBQWdCLENBQUM7QUFDNUMsT0FBTyxDQUFDLGNBQWMsR0FBRyxjQUFjLENBQUMifQ==