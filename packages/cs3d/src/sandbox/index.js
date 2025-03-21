const { createBrowser } = require("jsdom-context-require")
// const { createCanvas } = require("canvas")

/**
 * CS lite sandbox
 * @typedef {Object} CsLiteSandbox
 * @property {Object} csCore cornerstone core module loaded.
 * @property {Object} context JSDOM context.
 * @property {Object} canvas canvas object for given context.
 */
/**
 * Configures a fake node sandbox to run cornerstone in it.
 * It might mock some of web standards in other to allow cornerstone to run on server side for existing exposed apis.
 * It creates a sandbox with canvas tag, set needed cs globals then load cs module.
 *
 * @returns {CsLiteSandbox}
 */
function setUpEnvSandbox() {
  console.log("setUpEnvSandbox")
  const context = createBrowser({
    dir: __dirname,
    html: "<!DOCTYPE html><div><canvas width='512' height='512'></canvas></div>",
  })

  const csCore = context.require("cornerstone-core")

  // const canvas = createCanvas(256, 256);

  return {
    csCore,
    context,
    canvas: context.window.document.querySelector("canvas"),
  }
}

module.exports = setUpEnvSandbox
