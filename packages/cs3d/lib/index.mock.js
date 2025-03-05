/**
 * Mock api getRenderedBuffer to by pass inner layers
 */
function mockGetRenderedBuffer(_1, _2, _3, doneCallback) {
  doneCallback();
}

exports.getRenderedBuffer = mockGetRenderedBuffer;
