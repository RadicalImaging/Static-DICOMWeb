import fs from 'fs';

const results = [];
let sopResponse = null;

function ensureSOPResponse(data) {
  if (!data.ReferencedSOPSequence && !data.FailedSOPSequence) {
    return;
  }
  if (!sopResponse) {
    sopResponse = {
      ...data,
      FailedSOPSequence: undefined,
      ReferencedSOPSequence: undefined,
    };
    results.push(sopResponse);
  }
  if (data.ReferencedSOPSequence) {
    sopResponse.ReferencedSOPSequence ||= [];
    sopResponse.ReferencedSOPSequence.push(...data.ReferencedSOPSequence);
  }
  if (data.FailedSOPSequence) {
    sopResponse.FailedSOPSequence ||= [];
    sopResponse.FailedSOPSequence.push(...data.FailedSOPSequence);
  }
}
export function Success(options) {
  const { deleteInput = false } = options;

  return (_action, data, file) => {
    if (data.ReferencedSOPSequence) {
      ensureSOPResponse(data);
    } else {
      results.push(data);
    }
    if (file && deleteInput) {
      console.noQuiet('Deleting', file);
      fs.unlinkSync(file);
    } else if (file) {
      console.verbose('Not deleting', file);
    }
  };
}

export function Failure(options) {
  const { deleteFailed } = options;

  return (_action, data, file) => {
    if (data.FailedSOPSequence) {
      ensureSOPResponse(data);
    } else {
      results.push(data);
    }
    if (file && deleteFailed) {
      console.noQuiet('Deleting failure', file);
      fs.unlinkSync(file);
    } else if (file) {
      console.verbose('Not deleting failure file', file);
    }
  };
}

export function clearResults() {
  results.splice(0, results.length);
  sopResponse = null;
}

export function WriteResults(options) {
  const { multipart } = options;

  return function () {
    if (multipart) {
      const str =
        results.length === 1
          ? JSON.stringify(results[0])
          : `[\n${results.map(r => JSON.stringify(r, null, 2)).join(',\n')}\n]`;
      console.log(
        '\r\n--boundary-response\r\n' +
          'content-type: application/json\r\n\r\n' +
          str +
          '\r\n--boundary-response--\r\n'
      );
    }

    clearResults();
  };
}
