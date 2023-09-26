const https = require("https");

/** Retrieve the given url fromm the back end, returning a JSON representation of the data */
module.exports = function retrieve(url, options) {
  console.log("Requesting to retrieve", url);
  const parsedUrl = new URL(url);
  const req = https.request(parsedUrl, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      console.log(`BODY: ${chunk}`);
    });
    res.on('end', () => {
      console.log('No more data in response.');
    });
  });
  req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
  });

  req.end();
}