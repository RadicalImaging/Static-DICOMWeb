(function webpackUniversalModuleDefinition(root, factory) {
	if(typeof exports === 'object' && typeof module === 'object')
		module.exports = factory();
	else if(typeof define === 'function' && define.amd)
		define("@radicalimaging/static-wado-util", [], factory);
	else if(typeof exports === 'object')
		exports["@radicalimaging/static-wado-util"] = factory();
	else
		root["@radicalimaging/static-wado-util"] = factory();
})(global, () => {
return /******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ "./lib/aeConfig.js":
/*!*************************!*\
  !*** ./lib/aeConfig.js ***!
  \*************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const {
  ConfigPoint
} = __webpack_require__(/*! config-point */ "./node_modules/config-point/dist/index.umd.js");

const {
  aeConfig
} = ConfigPoint.register({
  aeConfig: {
    DICOMWEB: {
      description: "The static-wado SCU and SCP name by default",
      host: "localhost",
      port: 11112
    },
    // Test configurations
    dcmqrscp: {
      description: "A test AE configuration for sending queries to dcmqrscp",
      host: "localhost",
      port: 11113
    },
    CLEARCANVAS: {
      description: "Test ClearCanvas System",
      host: "localhost",
      port: 11114
    }
  }
});
module.exports = aeConfig;

/***/ }),

/***/ "./lib/assertions/assertAeDefinition.js":
/*!**********************************************!*\
  !*** ./lib/assertions/assertAeDefinition.js ***!
  \**********************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const assert = (__webpack_require__(/*! assert */ "assert").strict);

const aeConfig = __webpack_require__(/*! ../aeConfig */ "./lib/aeConfig.js");
/**
 * Checks whether there is an ae definition into aeConfig or not.
 * In case result is false and there is a valid array of errorMessages, then it will throw an exception.
 *
 * @throws Exception if there is valid array of errorMessages is passed and result is false
 * @param {*} params object to check if there is a property name as aeStr or not.
 * @param {*} aeStr string reference
 * @param {*} errorMessages array of error messages for missing ae and missing ae def. Where first index is error string for missing ae and second index is error message for missing ae def.
 * @returns boolean
 */


module.exports = function assertAeDefinition(params, aeStr, errorMessages = []) {
  const aeValue = params[aeStr];
  const [errorAeMessage, errorAeDefMessage] = errorMessages;
  const result = aeValue && aeConfig[aeValue];

  try {
    assert.ok(!!aeValue, errorAeMessage);
    assert.ok(result, errorAeDefMessage);
  } catch (e) {
    if (errorAeMessage || errorAeDefMessage) {
      throw e;
    }

    return false;
  }

  return true;
};

/***/ }),

/***/ "./lib/assertions/index.js":
/*!*********************************!*\
  !*** ./lib/assertions/index.js ***!
  \*********************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const assertAeDefinition = __webpack_require__(/*! ./assertAeDefinition.js */ "./lib/assertions/assertAeDefinition.js");

const assertions = {
  assertAeDefinition
};
module.exports = assertions;

/***/ }),

/***/ "./lib/configGroup.js":
/*!****************************!*\
  !*** ./lib/configGroup.js ***!
  \****************************/
/***/ ((module) => {

function configGroup(config, name) {
  const group = { ...config[`${name}Group`]
  };
  const dir = config[`${name}Dir`];
  console.log("dir for", name, dir);
  Object.defineProperty(group, "dir", {
    value: dir
  });
  Object.defineProperty(group, "name", {
    value: name
  });
  return group;
}

module.exports = configGroup;

/***/ }),

/***/ "./lib/handleHomeRelative.js":
/*!***********************************!*\
  !*** ./lib/handleHomeRelative.js ***!
  \***********************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const homedir = (__webpack_require__(/*! os */ "os").homedir)();

const path = __webpack_require__(/*! path */ "path");

const handleHomeRelative = dirName => dirName[0] == "~" ? path.join(homedir, dirName.substring(1)) : dirName;

module.exports = handleHomeRelative;

/***/ }),

/***/ "./lib/loadConfiguration.js":
/*!**********************************!*\
  !*** ./lib/loadConfiguration.js ***!
  \**********************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const {
  loadFile
} = __webpack_require__(/*! config-point */ "./node_modules/config-point/dist/index.umd.js");

const fs = __webpack_require__(/*! fs */ "fs");

const handleHomeRelative = __webpack_require__(/*! ./handleHomeRelative */ "./lib/handleHomeRelative.js");

const getConfigurationFile = (args, defValue) => {
  for (let i = 1; i < args.length - 1; i++) {
    const arg = args[i];

    if (arg == "-c" || arg == "--configuration" || arg == "-configuration") {
      return args[i + 1];
    }
  }

  return defValue;
};
/**
 * Loads the configurationFiles elements, returning a promise that resolves on the first file loaded successfully,
 * or resolves if no configuration file is found.
 * Fails if the parse fails for any reason.
 */


module.exports = (defaults, argvSrc) => {
  const args = argvSrc || process.argv || [];
  const configurationFile = getConfigurationFile(args, defaults.configurationFile);
  if (!configurationFile || configurationFile === "false") return Promise.resolve();
  const configurationFiles = Array.isArray(configurationFile) && configurationFile || [configurationFile];

  for (const configFile of configurationFiles) {
    const filename = handleHomeRelative(configFile);

    if (fs.existsSync(filename)) {
      // console.log("Using configuration", filename);
      return loadFile(filename, fs.promises).then(() => filename);
    }
  }

  return Promise.resolve();
};

/***/ }),

/***/ "./lib/program/index.js":
/*!******************************!*\
  !*** ./lib/program/index.js ***!
  \******************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

const {
  program,
  Argument
} = __webpack_require__(/*! commander */ "./node_modules/commander/index.js");

const loadConfiguration = __webpack_require__(/*! ../loadConfiguration */ "./lib/loadConfiguration.js");

function configureBaseProgram(configuration) {
  const {
    helpDescription,
    helpShort
  } = configuration;
  program.name(helpShort).configureHelp({
    sortOptions: true
  }).addHelpText("beforeAll", helpDescription).addHelpCommand();
  return program;
}

const addOptions = (cmd, options) => {
  if (options) {
    options.forEach(optionConfig => {
      const {
        key,
        description,
        defaultValue,
        choices,
        isRequired,
        customParser
      } = optionConfig;
      const option = cmd.createOption(key, description);
      option.default(defaultValue);

      if (customParser) {
        option.argParser(customParser);
      }

      if (isRequired) {
        option.makeOptionMandatory();
      }

      if (Array.isArray(choices)) {
        option.choices(choices);
      }

      cmd.addOption(option);
    });
  }
};

function configureCommands(config, configurationFile) {
  // console.log("Configure commands for", config);
  const {
    programs: programsDefinition,
    options
  } = config;

  for (const item of programsDefinition) {
    const {
      command,
      helpDescription,
      main,
      isDefault,
      options: subOptions
    } = item;
    const cmdConfig = program.command(command, {
      isDefault
    }).description(helpDescription);
    cmdConfig.action((...args) => main.call(config, ...args, configurationFile));
    addOptions(cmdConfig, options);
    addOptions(cmdConfig, subOptions);
  }

  program.parse();
}
/**
 * Configure static-wado commander program. Ideally it should be called just once.
 * Used by static-wado packages command commands.
 *
 * @param {*} configuration Configuration object from command level
 * @returns Program object
 */


function configureProgram(configuration) {
  const {
    argumentsRequired = [],
    optionsRequired = [],
    argumentsList = [],
    optionsList = [],
    packageJson = {}
  } = configuration;
  program.version(packageJson.version);
  const currentProgram = configureBaseProgram(configuration); // program command options

  argumentsRequired.forEach(argName => {
    argumentsList.forEach(argObject => {
      if (argObject.key.includes(argName)) {
        program.addArgument(new Argument(argObject.key, argObject.description));
      }
    });
  });
  optionsList.push({
    key: "-c, --configuration <config-file.json5>",
    description: "Sets the base configurationfile, defaults to static-wado.json5 located in the current directory or in user home directory"
  }); // iterate over option list and set to program

  optionsList.forEach(({
    key,
    description,
    defaultValue,
    choices
  }) => {
    const option = currentProgram.createOption(key, description);
    option.default(defaultValue);

    if (optionsRequired.includes(option.short) || optionsRequired.includes(option.long)) {
      option.makeOptionMandatory();
    }

    if (Array.isArray(choices)) {
      option.choices(choices);
    }

    currentProgram.addOption(option);
  });
  currentProgram.parse();
  return currentProgram;
}

exports.configureProgram = configureProgram;
exports.program = program;
exports.configureCommands = configureCommands;
exports.loadConfiguration = loadConfiguration;

/***/ }),

/***/ "./lib/qidoFilter.js":
/*!***************************!*\
  !*** ./lib/qidoFilter.js ***!
  \***************************/
/***/ ((module) => {

const filterKeys = {
  StudyInstanceUID: "0020000D",
  PatientName: "00100010",
  PatientID: "00100020",
  "00100020": "mrn",
  StudyDescription: "00081030",
  StudyDate: "00080020",
  ModalitiesInStudy: "00080061",
  AccessionNumber: "00080050"
};
/**
 * Compares values, matching any instance of desired to any instance of
 * actual by recursively go through the paired set of values.  That is,
 * this is O(m*n) where m is how many items in desired and n is the length of actual
 * Then, at the individual item node, compares the Alphabetic name if present,
 * and does a sub-string matching on string values, and otherwise does an
 * exact match comparison.
 *
 * @param {*} desired
 * @param {*} actual
 * @returns true if the values match
 */

const compareValues = (desired, actualSrc) => {
  let actual = actualSrc;

  if (Array.isArray(desired)) {
    return desired.find(item => compareValues(item, actual));
  }

  if (Array.isArray(actual)) {
    return actual.find(actualItem => compareValues(desired, actualItem));
  }

  if (actual?.Alphabetic) {
    actual = actual.Alphabetic;
  }

  if (typeof actual == "string") {
    if (actual.length === 0) return true;
    if (desired.length === 0 || desired === "*") return true;

    if (desired[0] === "*" && desired[desired.length - 1] === "*") {
      return actual.indexOf(desired.substring(1, desired.length - 1)) != -1;
    }

    if (desired[desired.length - 1] === "*") {
      return actual.indexOf(desired.substring(0, desired.length - 1)) != -1;
    }

    if (desired[0] === "*") {
      return actual.indexOf(desired.substring(1)) === actual.length - desired.length + 1;
    }
  }

  return desired === actual;
};
/** Compares a pair of dates to see if the value is within the range */


const compareDateRange = (range, value) => {
  if (!value) return true;
  const dash = range.indexOf("-");
  if (dash === -1) return compareValues(range, value);
  const start = range.substring(0, dash);
  const end = range.substring(dash + 1);
  return (!start || value >= start) && (!end || value <= end);
};
/**
 * Filters the return list by the query parameters.
 *
 * @param {*} key
 * @param {*} queryParams
 * @param {*} study
 * @returns
 */


const filterItem = (key, queryParams, study) => {
  const altKey = filterKeys[key] || key;
  if (!queryParams) return true;
  const testValue = queryParams[key] || queryParams[altKey];
  if (!testValue) return true;
  const valueElem = study[key] || study[altKey];
  if (!valueElem) return false;
  if (valueElem.vr == "DA") return compareDateRange(testValue, valueElem.Value[0]);
  const value = valueElem.Value ?? valueElem;
  return !!compareValues(testValue, value);
};

const qidoFilter = (list, queryParams) => {
  const filtered = list.filter(item => {
    for (const key of Object.keys(filterKeys)) {
      if (!filterItem(key, queryParams, item)) return false;
    }

    return true;
  });
  return filtered;
};

module.exports = qidoFilter;

/***/ }),

/***/ "./lib/reader/JSONReader.js":
/*!**********************************!*\
  !*** ./lib/reader/JSONReader.js ***!
  \**********************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const fs = (__webpack_require__(/*! fs */ "fs").promises);

const path = __webpack_require__(/*! path */ "path");

const zlib = __webpack_require__(/*! zlib */ "zlib");

const util = __webpack_require__(/*! util */ "util");

const handleHomeRelative = __webpack_require__(/*! ../handleHomeRelative */ "./lib/handleHomeRelative.js");

const gunzip = util.promisify(zlib.gunzip);

const {
  Stats
} = __webpack_require__(/*! ../stats */ "./lib/stats/index.js");

const JSONReader = async (dirSrc, name, def) => {
  let finalData;
  const dir = handleHomeRelative(dirSrc);

  try {
    const rawdata = await fs.readFile(path.join(dir, name));

    if (name.indexOf(".gz") != -1) {
      finalData = (await gunzip(rawdata, {})).toString("utf-8");
    } else {
      finalData = rawdata;
    }
  } catch (err) {
    if (def === undefined) {
      console.log("Couldn't read", dir, name, err);
    }
  }

  Stats.StudyStats.add("Read JSON", `Read JSON file ${name}`, 1000);
  return finalData && JSON.parse(finalData) || def;
};
/** Calls the JSON reader on the path appropriate for the given hash data */


JSONReader.readHashData = async (studyDir, hashValue, extension = ".json.gz") => {
  const hashPath = path.join(studyDir, "bulkdata", hashValue.substring(0, 3), hashValue.substring(3, 5));
  Stats.StudyStats.add("Read Hash Data", "Read hash data", 100);
  return JSONReader(hashPath, hashValue.substring(5) + extension);
};

module.exports = JSONReader;

/***/ }),

/***/ "./lib/reader/dirScanner.js":
/*!**********************************!*\
  !*** ./lib/reader/dirScanner.js ***!
  \**********************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const fs = __webpack_require__(/*! fs */ "fs");
/**
 * Executes a given callback on the scanned list of names, OR matches up the names present
 * in the actual directory with the specified list.
 */


async function dirScanner(input, options) {
  let files = input;
  if (!Array.isArray(files)) files = [files];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    if (fs.lstatSync(file).isDirectory()) {
      const names = await fs.promises.readdir(file);

      if (options.recursive !== false) {
        await dirScanner(names.map(dirFile => `${file}/${dirFile}`), options);
      } else {
        for (let j = 0; j < names.length; j++) {
          const name = names[j];

          if (!options.matchList || options.matchList.length == 0 || options.matchList.contains(name)) {
            await options.callback(file, name);
          }
        }
      }
    } else {
      try {
        await options.callback(file);
      } catch (e) {
        console.error("Couldn't process", file, e);
      }
    }
  }
}

module.exports = dirScanner;

/***/ }),

/***/ "./lib/staticWadoConfig.js":
/*!*********************************!*\
  !*** ./lib/staticWadoConfig.js ***!
  \*********************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const {
  ConfigPoint
} = __webpack_require__(/*! config-point */ "./node_modules/config-point/dist/index.umd.js");

const {
  staticWadoConfig
} = ConfigPoint.register({
  staticWadoConfig: {
    // Allow access to the config base to compare to defaults.
    configBase: {
      rootDir: "~/dicomweb",
      pathDeduplicated: "deduplicated",
      configurationFile: ["./static-wado.json5", "~/static-wado.json5"],
      recompress: [""],
      recompressThumb: [""],
      // True means compress to gzip for dicomweb and to brotli for OHIF client
      compress: true,
      studyQuery: "studiesQueryByIndex",
      staticWadoAe: "DICOMWEB",
      // Items dealing with deployment - these are skeletons with the default values only
      groupNames: ["root", "client"],
      rootGroup: {
        path: "/dicomweb",
        IndexDocument: {
          suffix: "json"
        }
      },
      clientGroup: {
        path: "/",
        IndexDocument: {
          suffix: "html"
        }
      }
    }
  }
});
module.exports = staticWadoConfig;

/***/ }),

/***/ "./lib/stats/index.js":
/*!****************************!*\
  !*** ./lib/stats/index.js ***!
  \****************************/
/***/ ((__unused_webpack_module, exports) => {

class Stats {
  constructor(name, description, parent) {
    this.stats = {};
    this.name = name;
    this.description = description;
    this.parent = parent;
    Stats[name] = this;
  }

  add(item, description, messageCount = 250) {
    if (!this.stats[item]) {
      this.stats[item] = 0;
    }

    this.stats[item] += 1;

    if (messageCount && this.stats[item] % messageCount == 0) {
      console.log(item, this.stats[item], description);
    }

    if (this.parent) this.parent.add(item, description, 0);
  }

  summarize(msg) {
    console.log(msg);
    console.log(this.description);
    Object.keys(this.stats).forEach(key => {
      console.log(key, this.stats[key]);
    });
    this.reset();
  }

  reset() {
    this.stats = {};
  }

}

const OverallStats = new Stats("OverallStats", "Overall statistics");
const StudyStats = new Stats("StudyStats", "Study Generation", OverallStats);
const BufferStats = new Stats("BufferStats", "Buffer Statistics", StudyStats);
exports.Stats = {
  OverallStats,
  StudyStats,
  BufferStats
};

/***/ }),

/***/ "./lib/update/configDiff.js":
/*!**********************************!*\
  !*** ./lib/update/configDiff.js ***!
  \**********************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const staticWadoConfig = __webpack_require__(/*! ../staticWadoConfig */ "./lib/staticWadoConfig.js");

const diffObject = (update, base) => {
  if (!update) return undefined;
  if (!base) return update;
  let ret;

  for (const key of Object.keys(update)) {
    if (key == "configBase") continue;
    const old = base[key];
    const newV = update[key];
    if (newV === old || JSON.stringify(old) === JSON.stringify(newV)) continue;
    if (!ret) ret = Array.isArray(newV) ? [] : {};

    if (typeof update[key] === "object") {
      ret[key] = diffObject(update[key], base[key]);
    } else {
      ret[key] = update[key];
    }
  }

  return ret;
};
/**
 * Performs a difference in configuration between the provide value and the default static-wado-config, retaining only values
 * which are different from the base configuration, recursively.
 */


const configDiff = newConfig => diffObject(newConfig, staticWadoConfig.configBase);

module.exports = configDiff;

/***/ }),

/***/ "./lib/update/updateConfiguration.js":
/*!*******************************************!*\
  !*** ./lib/update/updateConfiguration.js ***!
  \*******************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const fs = __webpack_require__(/*! fs */ "fs");

const json5Writer = null; // require("json5-writer");

const configDiff = __webpack_require__(/*! ./configDiff */ "./lib/update/configDiff.js");

const updateConfiguration = (configurationFile, config) => {
  const delta = configDiff(config) || {};
  let updated = JSON.stringify({
    staticWadoConfig: delta
  }, null, 2);

  if (fs.existsSync(configurationFile)) {
    const sourceConfig = fs.readFileSync(configurationFile, "utf-8");
    const writer = json5Writer.load(sourceConfig);
    writer.write({
      staticWadoConfig: delta
    });
    updated = writer.toSource();
  }

  fs.writeFileSync(configurationFile, updated, "utf-8");
};

module.exports = updateConfiguration;

/***/ }),

/***/ "./node_modules/config-point/dist/index.umd.js":
/*!*****************************************************!*\
  !*** ./node_modules/config-point/dist/index.umd.js ***!
  \*****************************************************/
/***/ ((module) => {

!function(u,e){ true?module.exports=e():0}(window,(function(){return function(u){var e={};function r(t){if(e[t])return e[t].exports;var n=e[t]={i:t,l:!1,exports:{}};return u[t].call(n.exports,n,n.exports,r),n.l=!0,n.exports}return r.m=u,r.c=e,r.d=function(u,e,t){r.o(u,e)||Object.defineProperty(u,e,{enumerable:!0,get:t})},r.r=function(u){"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(u,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(u,"__esModule",{value:!0})},r.t=function(u,e){if(1&e&&(u=r(u)),8&e)return u;if(4&e&&"object"==typeof u&&u&&u.__esModule)return u;var t=Object.create(null);if(r.r(t),Object.defineProperty(t,"default",{enumerable:!0,value:u}),2&e&&"string"!=typeof u)for(var n in u)r.d(t,n,function(e){return u[e]}.bind(null,n));return t},r.n=function(u){var e=u&&u.__esModule?function(){return u.default}:function(){return u};return r.d(e,"a",e),e},r.o=function(u,e){return Object.prototype.hasOwnProperty.call(u,e)},r.p="",r(r.s=1)}([function(u,e,r){u.exports=function(){"use strict";function u(u,e){return u(e={exports:{}},e.exports),e.exports}var e=u((function(u){var e=u.exports="undefined"!=typeof window&&window.Math==Math?window:"undefined"!=typeof self&&self.Math==Math?self:Function("return this")();"number"==typeof __g&&(__g=e)})),r=u((function(u){var e=u.exports={version:"2.6.5"};"number"==typeof __e&&(__e=e)})),t=(r.version,function(u){return"object"==typeof u?null!==u:"function"==typeof u}),n=function(u){if(!t(u))throw TypeError(u+" is not an object!");return u},D=function(u){try{return!!u()}catch(u){return!0}},i=!D((function(){return 7!=Object.defineProperty({},"a",{get:function(){return 7}}).a})),o=e.document,a=t(o)&&t(o.createElement),c=!i&&!D((function(){return 7!=Object.defineProperty((u="div",a?o.createElement(u):{}),"a",{get:function(){return 7}}).a;var u})),F=Object.defineProperty,C={f:i?Object.defineProperty:function(u,e,r){if(n(u),e=function(u,e){if(!t(u))return u;var r,n;if(e&&"function"==typeof(r=u.toString)&&!t(n=r.call(u)))return n;if("function"==typeof(r=u.valueOf)&&!t(n=r.call(u)))return n;if(!e&&"function"==typeof(r=u.toString)&&!t(n=r.call(u)))return n;throw TypeError("Can't convert object to primitive value")}(e,!0),n(r),c)try{return F(u,e,r)}catch(u){}if("get"in r||"set"in r)throw TypeError("Accessors not supported!");return"value"in r&&(u[e]=r.value),u}},A=i?function(u,e,r){return C.f(u,e,function(u,e){return{enumerable:!(1&u),configurable:!(2&u),writable:!(4&u),value:e}}(1,r))}:function(u,e,r){return u[e]=r,u},f={}.hasOwnProperty,E=function(u,e){return f.call(u,e)},s=0,l=Math.random(),B=u((function(u){var t=e["__core-js_shared__"]||(e["__core-js_shared__"]={});(u.exports=function(u,e){return t[u]||(t[u]=void 0!==e?e:{})})("versions",[]).push({version:r.version,mode:"global",copyright:"© 2019 Denis Pushkarev (zloirock.ru)"})}))("native-function-to-string",Function.toString),d=u((function(u){var t=function(u){return"Symbol(".concat(void 0===u?"":u,")_",(++s+l).toString(36))}("src"),n=(""+B).split("toString");r.inspectSource=function(u){return B.call(u)},(u.exports=function(u,r,D,i){var o="function"==typeof D;o&&(E(D,"name")||A(D,"name",r)),u[r]!==D&&(o&&(E(D,t)||A(D,t,u[r]?""+u[r]:n.join(String(r)))),u===e?u[r]=D:i?u[r]?u[r]=D:A(u,r,D):(delete u[r],A(u,r,D)))})(Function.prototype,"toString",(function(){return"function"==typeof this&&this[t]||B.call(this)}))})),p=function(u,e,r){if(function(u){if("function"!=typeof u)throw TypeError(u+" is not a function!")}(u),void 0===e)return u;switch(r){case 1:return function(r){return u.call(e,r)};case 2:return function(r,t){return u.call(e,r,t)};case 3:return function(r,t,n){return u.call(e,r,t,n)}}return function(){return u.apply(e,arguments)}},v=function(u,t,n){var D,i,o,a,c=u&v.F,F=u&v.G,C=u&v.S,f=u&v.P,E=u&v.B,s=F?e:C?e[t]||(e[t]={}):(e[t]||{}).prototype,l=F?r:r[t]||(r[t]={}),B=l.prototype||(l.prototype={});for(D in F&&(n=t),n)o=((i=!c&&s&&void 0!==s[D])?s:n)[D],a=E&&i?p(o,e):f&&"function"==typeof o?p(Function.call,o):o,s&&d(s,D,o,u&v.U),l[D]!=o&&A(l,D,a),f&&B[D]!=o&&(B[D]=o)};e.core=r,v.F=1,v.G=2,v.S=4,v.P=8,v.B=16,v.W=32,v.U=64,v.R=128;var y,g=v,h=Math.ceil,b=Math.floor,m=function(u){return isNaN(u=+u)?0:(u>0?b:h)(u)},w=(y=!1,function(u,e){var r,t,n=String(function(u){if(null==u)throw TypeError("Can't call method on  "+u);return u}(u)),D=m(e),i=n.length;return D<0||D>=i?y?"":void 0:(r=n.charCodeAt(D))<55296||r>56319||D+1===i||(t=n.charCodeAt(D+1))<56320||t>57343?y?n.charAt(D):r:y?n.slice(D,D+2):t-56320+(r-55296<<10)+65536});g(g.P,"String",{codePointAt:function(u){return w(this,u)}}),r.String.codePointAt;var O=Math.max,x=Math.min,S=function(u,e){return(u=m(u))<0?O(u+e,0):x(u,e)},P=String.fromCharCode,j=String.fromCodePoint;g(g.S+g.F*(!!j&&1!=j.length),"String",{fromCodePoint:function(u){for(var e,r=arguments,t=[],n=arguments.length,D=0;n>D;){if(e=+r[D++],S(e,1114111)!==e)throw RangeError(e+" is not a valid code point");t.push(e<65536?P(e):P(55296+((e-=65536)>>10),e%1024+56320))}return t.join("")}}),r.String.fromCodePoint;var _,N,V,I,M,k,L,T,K,$,R,z,J,U,G={Space_Separator:/[\u1680\u2000-\u200A\u202F\u205F\u3000]/,ID_Start:/[\xAA\xB5\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u052F\u0531-\u0556\u0559\u0561-\u0587\u05D0-\u05EA\u05F0-\u05F2\u0620-\u064A\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA\u07F4\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u0860-\u086A\u08A0-\u08B4\u08B6-\u08BD\u0904-\u0939\u093D\u0950\u0958-\u0961\u0971-\u0980\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09F0\u09F1\u09FC\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0AF9\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D\u0C58-\u0C5A\u0C60\u0C61\u0C80\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDE\u0CE0\u0CE1\u0CF1\u0CF2\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D54-\u0D56\u0D5F-\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0EDC-\u0EDF\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081\u108E\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F5\u13F8-\u13FD\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F8\u1700-\u170C\u170E-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u1820-\u1877\u1880-\u1884\u1887-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191E\u1950-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u1A00-\u1A16\u1A20-\u1A54\u1AA7\u1B05-\u1B33\u1B45-\u1B4B\u1B83-\u1BA0\u1BAE\u1BAF\u1BBA-\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C7D\u1C80-\u1C88\u1CE9-\u1CEC\u1CEE-\u1CF1\u1CF5\u1CF6\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2071\u207F\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2160-\u2188\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2E2F\u3005-\u3007\u3021-\u3029\u3031-\u3035\u3038-\u303C\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312E\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FEA\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA61F\uA62A\uA62B\uA640-\uA66E\uA67F-\uA69D\uA6A0-\uA6EF\uA717-\uA71F\uA722-\uA788\uA78B-\uA7AE\uA7B0-\uA7B7\uA7F7-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7\uA8FB\uA8FD\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF\uA9E0-\uA9E4\uA9E6-\uA9EF\uA9FA-\uA9FE\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA60-\uAA76\uAA7A\uAA7E-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB65\uAB70-\uABE2\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]|\uD800[\uDC00-\uDC0B\uDC0D-\uDC26\uDC28-\uDC3A\uDC3C\uDC3D\uDC3F-\uDC4D\uDC50-\uDC5D\uDC80-\uDCFA\uDD40-\uDD74\uDE80-\uDE9C\uDEA0-\uDED0\uDF00-\uDF1F\uDF2D-\uDF4A\uDF50-\uDF75\uDF80-\uDF9D\uDFA0-\uDFC3\uDFC8-\uDFCF\uDFD1-\uDFD5]|\uD801[\uDC00-\uDC9D\uDCB0-\uDCD3\uDCD8-\uDCFB\uDD00-\uDD27\uDD30-\uDD63\uDE00-\uDF36\uDF40-\uDF55\uDF60-\uDF67]|\uD802[\uDC00-\uDC05\uDC08\uDC0A-\uDC35\uDC37\uDC38\uDC3C\uDC3F-\uDC55\uDC60-\uDC76\uDC80-\uDC9E\uDCE0-\uDCF2\uDCF4\uDCF5\uDD00-\uDD15\uDD20-\uDD39\uDD80-\uDDB7\uDDBE\uDDBF\uDE00\uDE10-\uDE13\uDE15-\uDE17\uDE19-\uDE33\uDE60-\uDE7C\uDE80-\uDE9C\uDEC0-\uDEC7\uDEC9-\uDEE4\uDF00-\uDF35\uDF40-\uDF55\uDF60-\uDF72\uDF80-\uDF91]|\uD803[\uDC00-\uDC48\uDC80-\uDCB2\uDCC0-\uDCF2]|\uD804[\uDC03-\uDC37\uDC83-\uDCAF\uDCD0-\uDCE8\uDD03-\uDD26\uDD50-\uDD72\uDD76\uDD83-\uDDB2\uDDC1-\uDDC4\uDDDA\uDDDC\uDE00-\uDE11\uDE13-\uDE2B\uDE80-\uDE86\uDE88\uDE8A-\uDE8D\uDE8F-\uDE9D\uDE9F-\uDEA8\uDEB0-\uDEDE\uDF05-\uDF0C\uDF0F\uDF10\uDF13-\uDF28\uDF2A-\uDF30\uDF32\uDF33\uDF35-\uDF39\uDF3D\uDF50\uDF5D-\uDF61]|\uD805[\uDC00-\uDC34\uDC47-\uDC4A\uDC80-\uDCAF\uDCC4\uDCC5\uDCC7\uDD80-\uDDAE\uDDD8-\uDDDB\uDE00-\uDE2F\uDE44\uDE80-\uDEAA\uDF00-\uDF19]|\uD806[\uDCA0-\uDCDF\uDCFF\uDE00\uDE0B-\uDE32\uDE3A\uDE50\uDE5C-\uDE83\uDE86-\uDE89\uDEC0-\uDEF8]|\uD807[\uDC00-\uDC08\uDC0A-\uDC2E\uDC40\uDC72-\uDC8F\uDD00-\uDD06\uDD08\uDD09\uDD0B-\uDD30\uDD46]|\uD808[\uDC00-\uDF99]|\uD809[\uDC00-\uDC6E\uDC80-\uDD43]|[\uD80C\uD81C-\uD820\uD840-\uD868\uD86A-\uD86C\uD86F-\uD872\uD874-\uD879][\uDC00-\uDFFF]|\uD80D[\uDC00-\uDC2E]|\uD811[\uDC00-\uDE46]|\uD81A[\uDC00-\uDE38\uDE40-\uDE5E\uDED0-\uDEED\uDF00-\uDF2F\uDF40-\uDF43\uDF63-\uDF77\uDF7D-\uDF8F]|\uD81B[\uDF00-\uDF44\uDF50\uDF93-\uDF9F\uDFE0\uDFE1]|\uD821[\uDC00-\uDFEC]|\uD822[\uDC00-\uDEF2]|\uD82C[\uDC00-\uDD1E\uDD70-\uDEFB]|\uD82F[\uDC00-\uDC6A\uDC70-\uDC7C\uDC80-\uDC88\uDC90-\uDC99]|\uD835[\uDC00-\uDC54\uDC56-\uDC9C\uDC9E\uDC9F\uDCA2\uDCA5\uDCA6\uDCA9-\uDCAC\uDCAE-\uDCB9\uDCBB\uDCBD-\uDCC3\uDCC5-\uDD05\uDD07-\uDD0A\uDD0D-\uDD14\uDD16-\uDD1C\uDD1E-\uDD39\uDD3B-\uDD3E\uDD40-\uDD44\uDD46\uDD4A-\uDD50\uDD52-\uDEA5\uDEA8-\uDEC0\uDEC2-\uDEDA\uDEDC-\uDEFA\uDEFC-\uDF14\uDF16-\uDF34\uDF36-\uDF4E\uDF50-\uDF6E\uDF70-\uDF88\uDF8A-\uDFA8\uDFAA-\uDFC2\uDFC4-\uDFCB]|\uD83A[\uDC00-\uDCC4\uDD00-\uDD43]|\uD83B[\uDE00-\uDE03\uDE05-\uDE1F\uDE21\uDE22\uDE24\uDE27\uDE29-\uDE32\uDE34-\uDE37\uDE39\uDE3B\uDE42\uDE47\uDE49\uDE4B\uDE4D-\uDE4F\uDE51\uDE52\uDE54\uDE57\uDE59\uDE5B\uDE5D\uDE5F\uDE61\uDE62\uDE64\uDE67-\uDE6A\uDE6C-\uDE72\uDE74-\uDE77\uDE79-\uDE7C\uDE7E\uDE80-\uDE89\uDE8B-\uDE9B\uDEA1-\uDEA3\uDEA5-\uDEA9\uDEAB-\uDEBB]|\uD869[\uDC00-\uDED6\uDF00-\uDFFF]|\uD86D[\uDC00-\uDF34\uDF40-\uDFFF]|\uD86E[\uDC00-\uDC1D\uDC20-\uDFFF]|\uD873[\uDC00-\uDEA1\uDEB0-\uDFFF]|\uD87A[\uDC00-\uDFE0]|\uD87E[\uDC00-\uDE1D]/,ID_Continue:/[\xAA\xB5\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0300-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u0483-\u0487\u048A-\u052F\u0531-\u0556\u0559\u0561-\u0587\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u05D0-\u05EA\u05F0-\u05F2\u0610-\u061A\u0620-\u0669\u066E-\u06D3\u06D5-\u06DC\u06DF-\u06E8\u06EA-\u06FC\u06FF\u0710-\u074A\u074D-\u07B1\u07C0-\u07F5\u07FA\u0800-\u082D\u0840-\u085B\u0860-\u086A\u08A0-\u08B4\u08B6-\u08BD\u08D4-\u08E1\u08E3-\u0963\u0966-\u096F\u0971-\u0983\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BC-\u09C4\u09C7\u09C8\u09CB-\u09CE\u09D7\u09DC\u09DD\u09DF-\u09E3\u09E6-\u09F1\u09FC\u0A01-\u0A03\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A3C\u0A3E-\u0A42\u0A47\u0A48\u0A4B-\u0A4D\u0A51\u0A59-\u0A5C\u0A5E\u0A66-\u0A75\u0A81-\u0A83\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABC-\u0AC5\u0AC7-\u0AC9\u0ACB-\u0ACD\u0AD0\u0AE0-\u0AE3\u0AE6-\u0AEF\u0AF9-\u0AFF\u0B01-\u0B03\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3C-\u0B44\u0B47\u0B48\u0B4B-\u0B4D\u0B56\u0B57\u0B5C\u0B5D\u0B5F-\u0B63\u0B66-\u0B6F\u0B71\u0B82\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BBE-\u0BC2\u0BC6-\u0BC8\u0BCA-\u0BCD\u0BD0\u0BD7\u0BE6-\u0BEF\u0C00-\u0C03\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D-\u0C44\u0C46-\u0C48\u0C4A-\u0C4D\u0C55\u0C56\u0C58-\u0C5A\u0C60-\u0C63\u0C66-\u0C6F\u0C80-\u0C83\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBC-\u0CC4\u0CC6-\u0CC8\u0CCA-\u0CCD\u0CD5\u0CD6\u0CDE\u0CE0-\u0CE3\u0CE6-\u0CEF\u0CF1\u0CF2\u0D00-\u0D03\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D44\u0D46-\u0D48\u0D4A-\u0D4E\u0D54-\u0D57\u0D5F-\u0D63\u0D66-\u0D6F\u0D7A-\u0D7F\u0D82\u0D83\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0DCA\u0DCF-\u0DD4\u0DD6\u0DD8-\u0DDF\u0DE6-\u0DEF\u0DF2\u0DF3\u0E01-\u0E3A\u0E40-\u0E4E\u0E50-\u0E59\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB9\u0EBB-\u0EBD\u0EC0-\u0EC4\u0EC6\u0EC8-\u0ECD\u0ED0-\u0ED9\u0EDC-\u0EDF\u0F00\u0F18\u0F19\u0F20-\u0F29\u0F35\u0F37\u0F39\u0F3E-\u0F47\u0F49-\u0F6C\u0F71-\u0F84\u0F86-\u0F97\u0F99-\u0FBC\u0FC6\u1000-\u1049\u1050-\u109D\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u135D-\u135F\u1380-\u138F\u13A0-\u13F5\u13F8-\u13FD\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F8\u1700-\u170C\u170E-\u1714\u1720-\u1734\u1740-\u1753\u1760-\u176C\u176E-\u1770\u1772\u1773\u1780-\u17D3\u17D7\u17DC\u17DD\u17E0-\u17E9\u180B-\u180D\u1810-\u1819\u1820-\u1877\u1880-\u18AA\u18B0-\u18F5\u1900-\u191E\u1920-\u192B\u1930-\u193B\u1946-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u19D0-\u19D9\u1A00-\u1A1B\u1A20-\u1A5E\u1A60-\u1A7C\u1A7F-\u1A89\u1A90-\u1A99\u1AA7\u1AB0-\u1ABD\u1B00-\u1B4B\u1B50-\u1B59\u1B6B-\u1B73\u1B80-\u1BF3\u1C00-\u1C37\u1C40-\u1C49\u1C4D-\u1C7D\u1C80-\u1C88\u1CD0-\u1CD2\u1CD4-\u1CF9\u1D00-\u1DF9\u1DFB-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u203F\u2040\u2054\u2071\u207F\u2090-\u209C\u20D0-\u20DC\u20E1\u20E5-\u20F0\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2160-\u2188\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D7F-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2DE0-\u2DFF\u2E2F\u3005-\u3007\u3021-\u302F\u3031-\u3035\u3038-\u303C\u3041-\u3096\u3099\u309A\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312E\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FEA\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA62B\uA640-\uA66F\uA674-\uA67D\uA67F-\uA6F1\uA717-\uA71F\uA722-\uA788\uA78B-\uA7AE\uA7B0-\uA7B7\uA7F7-\uA827\uA840-\uA873\uA880-\uA8C5\uA8D0-\uA8D9\uA8E0-\uA8F7\uA8FB\uA8FD\uA900-\uA92D\uA930-\uA953\uA960-\uA97C\uA980-\uA9C0\uA9CF-\uA9D9\uA9E0-\uA9FE\uAA00-\uAA36\uAA40-\uAA4D\uAA50-\uAA59\uAA60-\uAA76\uAA7A-\uAAC2\uAADB-\uAADD\uAAE0-\uAAEF\uAAF2-\uAAF6\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB65\uAB70-\uABEA\uABEC\uABED\uABF0-\uABF9\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE00-\uFE0F\uFE20-\uFE2F\uFE33\uFE34\uFE4D-\uFE4F\uFE70-\uFE74\uFE76-\uFEFC\uFF10-\uFF19\uFF21-\uFF3A\uFF3F\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]|\uD800[\uDC00-\uDC0B\uDC0D-\uDC26\uDC28-\uDC3A\uDC3C\uDC3D\uDC3F-\uDC4D\uDC50-\uDC5D\uDC80-\uDCFA\uDD40-\uDD74\uDDFD\uDE80-\uDE9C\uDEA0-\uDED0\uDEE0\uDF00-\uDF1F\uDF2D-\uDF4A\uDF50-\uDF7A\uDF80-\uDF9D\uDFA0-\uDFC3\uDFC8-\uDFCF\uDFD1-\uDFD5]|\uD801[\uDC00-\uDC9D\uDCA0-\uDCA9\uDCB0-\uDCD3\uDCD8-\uDCFB\uDD00-\uDD27\uDD30-\uDD63\uDE00-\uDF36\uDF40-\uDF55\uDF60-\uDF67]|\uD802[\uDC00-\uDC05\uDC08\uDC0A-\uDC35\uDC37\uDC38\uDC3C\uDC3F-\uDC55\uDC60-\uDC76\uDC80-\uDC9E\uDCE0-\uDCF2\uDCF4\uDCF5\uDD00-\uDD15\uDD20-\uDD39\uDD80-\uDDB7\uDDBE\uDDBF\uDE00-\uDE03\uDE05\uDE06\uDE0C-\uDE13\uDE15-\uDE17\uDE19-\uDE33\uDE38-\uDE3A\uDE3F\uDE60-\uDE7C\uDE80-\uDE9C\uDEC0-\uDEC7\uDEC9-\uDEE6\uDF00-\uDF35\uDF40-\uDF55\uDF60-\uDF72\uDF80-\uDF91]|\uD803[\uDC00-\uDC48\uDC80-\uDCB2\uDCC0-\uDCF2]|\uD804[\uDC00-\uDC46\uDC66-\uDC6F\uDC7F-\uDCBA\uDCD0-\uDCE8\uDCF0-\uDCF9\uDD00-\uDD34\uDD36-\uDD3F\uDD50-\uDD73\uDD76\uDD80-\uDDC4\uDDCA-\uDDCC\uDDD0-\uDDDA\uDDDC\uDE00-\uDE11\uDE13-\uDE37\uDE3E\uDE80-\uDE86\uDE88\uDE8A-\uDE8D\uDE8F-\uDE9D\uDE9F-\uDEA8\uDEB0-\uDEEA\uDEF0-\uDEF9\uDF00-\uDF03\uDF05-\uDF0C\uDF0F\uDF10\uDF13-\uDF28\uDF2A-\uDF30\uDF32\uDF33\uDF35-\uDF39\uDF3C-\uDF44\uDF47\uDF48\uDF4B-\uDF4D\uDF50\uDF57\uDF5D-\uDF63\uDF66-\uDF6C\uDF70-\uDF74]|\uD805[\uDC00-\uDC4A\uDC50-\uDC59\uDC80-\uDCC5\uDCC7\uDCD0-\uDCD9\uDD80-\uDDB5\uDDB8-\uDDC0\uDDD8-\uDDDD\uDE00-\uDE40\uDE44\uDE50-\uDE59\uDE80-\uDEB7\uDEC0-\uDEC9\uDF00-\uDF19\uDF1D-\uDF2B\uDF30-\uDF39]|\uD806[\uDCA0-\uDCE9\uDCFF\uDE00-\uDE3E\uDE47\uDE50-\uDE83\uDE86-\uDE99\uDEC0-\uDEF8]|\uD807[\uDC00-\uDC08\uDC0A-\uDC36\uDC38-\uDC40\uDC50-\uDC59\uDC72-\uDC8F\uDC92-\uDCA7\uDCA9-\uDCB6\uDD00-\uDD06\uDD08\uDD09\uDD0B-\uDD36\uDD3A\uDD3C\uDD3D\uDD3F-\uDD47\uDD50-\uDD59]|\uD808[\uDC00-\uDF99]|\uD809[\uDC00-\uDC6E\uDC80-\uDD43]|[\uD80C\uD81C-\uD820\uD840-\uD868\uD86A-\uD86C\uD86F-\uD872\uD874-\uD879][\uDC00-\uDFFF]|\uD80D[\uDC00-\uDC2E]|\uD811[\uDC00-\uDE46]|\uD81A[\uDC00-\uDE38\uDE40-\uDE5E\uDE60-\uDE69\uDED0-\uDEED\uDEF0-\uDEF4\uDF00-\uDF36\uDF40-\uDF43\uDF50-\uDF59\uDF63-\uDF77\uDF7D-\uDF8F]|\uD81B[\uDF00-\uDF44\uDF50-\uDF7E\uDF8F-\uDF9F\uDFE0\uDFE1]|\uD821[\uDC00-\uDFEC]|\uD822[\uDC00-\uDEF2]|\uD82C[\uDC00-\uDD1E\uDD70-\uDEFB]|\uD82F[\uDC00-\uDC6A\uDC70-\uDC7C\uDC80-\uDC88\uDC90-\uDC99\uDC9D\uDC9E]|\uD834[\uDD65-\uDD69\uDD6D-\uDD72\uDD7B-\uDD82\uDD85-\uDD8B\uDDAA-\uDDAD\uDE42-\uDE44]|\uD835[\uDC00-\uDC54\uDC56-\uDC9C\uDC9E\uDC9F\uDCA2\uDCA5\uDCA6\uDCA9-\uDCAC\uDCAE-\uDCB9\uDCBB\uDCBD-\uDCC3\uDCC5-\uDD05\uDD07-\uDD0A\uDD0D-\uDD14\uDD16-\uDD1C\uDD1E-\uDD39\uDD3B-\uDD3E\uDD40-\uDD44\uDD46\uDD4A-\uDD50\uDD52-\uDEA5\uDEA8-\uDEC0\uDEC2-\uDEDA\uDEDC-\uDEFA\uDEFC-\uDF14\uDF16-\uDF34\uDF36-\uDF4E\uDF50-\uDF6E\uDF70-\uDF88\uDF8A-\uDFA8\uDFAA-\uDFC2\uDFC4-\uDFCB\uDFCE-\uDFFF]|\uD836[\uDE00-\uDE36\uDE3B-\uDE6C\uDE75\uDE84\uDE9B-\uDE9F\uDEA1-\uDEAF]|\uD838[\uDC00-\uDC06\uDC08-\uDC18\uDC1B-\uDC21\uDC23\uDC24\uDC26-\uDC2A]|\uD83A[\uDC00-\uDCC4\uDCD0-\uDCD6\uDD00-\uDD4A\uDD50-\uDD59]|\uD83B[\uDE00-\uDE03\uDE05-\uDE1F\uDE21\uDE22\uDE24\uDE27\uDE29-\uDE32\uDE34-\uDE37\uDE39\uDE3B\uDE42\uDE47\uDE49\uDE4B\uDE4D-\uDE4F\uDE51\uDE52\uDE54\uDE57\uDE59\uDE5B\uDE5D\uDE5F\uDE61\uDE62\uDE64\uDE67-\uDE6A\uDE6C-\uDE72\uDE74-\uDE77\uDE79-\uDE7C\uDE7E\uDE80-\uDE89\uDE8B-\uDE9B\uDEA1-\uDEA3\uDEA5-\uDEA9\uDEAB-\uDEBB]|\uD869[\uDC00-\uDED6\uDF00-\uDFFF]|\uD86D[\uDC00-\uDF34\uDF40-\uDFFF]|\uD86E[\uDC00-\uDC1D\uDC20-\uDFFF]|\uD873[\uDC00-\uDEA1\uDEB0-\uDFFF]|\uD87A[\uDC00-\uDFE0]|\uD87E[\uDC00-\uDE1D]|\uDB40[\uDD00-\uDDEF]/},Z=function(u){return"string"==typeof u&&G.Space_Separator.test(u)},q=function(u){return"string"==typeof u&&(u>="a"&&u<="z"||u>="A"&&u<="Z"||"$"===u||"_"===u||G.ID_Start.test(u))},H=function(u){return"string"==typeof u&&(u>="a"&&u<="z"||u>="A"&&u<="Z"||u>="0"&&u<="9"||"$"===u||"_"===u||"‌"===u||"‍"===u||G.ID_Continue.test(u))},X=function(u){return"string"==typeof u&&/[0-9]/.test(u)},W=function(u){return"string"==typeof u&&/[0-9A-Fa-f]/.test(u)};function Q(){for($="default",R="",z=!1,J=1;;){U=Y();var u=eu[$]();if(u)return u}}function Y(){if(_[I])return String.fromCodePoint(_.codePointAt(I))}function uu(){var u=Y();return"\n"===u?(M++,k=0):u?k+=u.length:k++,u&&(I+=u.length),u}var eu={default:function(){switch(U){case"\t":case"\v":case"\f":case" ":case" ":case"\ufeff":case"\n":case"\r":case"\u2028":case"\u2029":return void uu();case"/":return uu(),void($="comment");case void 0:return uu(),ru("eof")}if(!Z(U))return eu[N]();uu()},comment:function(){switch(U){case"*":return uu(),void($="multiLineComment");case"/":return uu(),void($="singleLineComment")}throw au(uu())},multiLineComment:function(){switch(U){case"*":return uu(),void($="multiLineCommentAsterisk");case void 0:throw au(uu())}uu()},multiLineCommentAsterisk:function(){switch(U){case"*":return void uu();case"/":return uu(),void($="default");case void 0:throw au(uu())}uu(),$="multiLineComment"},singleLineComment:function(){switch(U){case"\n":case"\r":case"\u2028":case"\u2029":return uu(),void($="default");case void 0:return uu(),ru("eof")}uu()},value:function(){switch(U){case"{":case"[":return ru("punctuator",uu());case"n":return uu(),tu("ull"),ru("null",null);case"t":return uu(),tu("rue"),ru("boolean",!0);case"f":return uu(),tu("alse"),ru("boolean",!1);case"-":case"+":return"-"===uu()&&(J=-1),void($="sign");case".":return R=uu(),void($="decimalPointLeading");case"0":return R=uu(),void($="zero");case"1":case"2":case"3":case"4":case"5":case"6":case"7":case"8":case"9":return R=uu(),void($="decimalInteger");case"I":return uu(),tu("nfinity"),ru("numeric",1/0);case"N":return uu(),tu("aN"),ru("numeric",NaN);case'"':case"'":return z='"'===uu(),R="",void($="string")}throw au(uu())},identifierNameStartEscape:function(){if("u"!==U)throw au(uu());uu();var u=nu();switch(u){case"$":case"_":break;default:if(!q(u))throw Fu()}R+=u,$="identifierName"},identifierName:function(){switch(U){case"$":case"_":case"‌":case"‍":return void(R+=uu());case"\\":return uu(),void($="identifierNameEscape")}if(!H(U))return ru("identifier",R);R+=uu()},identifierNameEscape:function(){if("u"!==U)throw au(uu());uu();var u=nu();switch(u){case"$":case"_":case"‌":case"‍":break;default:if(!H(u))throw Fu()}R+=u,$="identifierName"},sign:function(){switch(U){case".":return R=uu(),void($="decimalPointLeading");case"0":return R=uu(),void($="zero");case"1":case"2":case"3":case"4":case"5":case"6":case"7":case"8":case"9":return R=uu(),void($="decimalInteger");case"I":return uu(),tu("nfinity"),ru("numeric",J*(1/0));case"N":return uu(),tu("aN"),ru("numeric",NaN)}throw au(uu())},zero:function(){switch(U){case".":return R+=uu(),void($="decimalPoint");case"e":case"E":return R+=uu(),void($="decimalExponent");case"x":case"X":return R+=uu(),void($="hexadecimal")}return ru("numeric",0*J)},decimalInteger:function(){switch(U){case".":return R+=uu(),void($="decimalPoint");case"e":case"E":return R+=uu(),void($="decimalExponent")}if(!X(U))return ru("numeric",J*Number(R));R+=uu()},decimalPointLeading:function(){if(X(U))return R+=uu(),void($="decimalFraction");throw au(uu())},decimalPoint:function(){switch(U){case"e":case"E":return R+=uu(),void($="decimalExponent")}return X(U)?(R+=uu(),void($="decimalFraction")):ru("numeric",J*Number(R))},decimalFraction:function(){switch(U){case"e":case"E":return R+=uu(),void($="decimalExponent")}if(!X(U))return ru("numeric",J*Number(R));R+=uu()},decimalExponent:function(){switch(U){case"+":case"-":return R+=uu(),void($="decimalExponentSign")}if(X(U))return R+=uu(),void($="decimalExponentInteger");throw au(uu())},decimalExponentSign:function(){if(X(U))return R+=uu(),void($="decimalExponentInteger");throw au(uu())},decimalExponentInteger:function(){if(!X(U))return ru("numeric",J*Number(R));R+=uu()},hexadecimal:function(){if(W(U))return R+=uu(),void($="hexadecimalInteger");throw au(uu())},hexadecimalInteger:function(){if(!W(U))return ru("numeric",J*Number(R));R+=uu()},string:function(){switch(U){case"\\":return uu(),void(R+=function(){switch(Y()){case"b":return uu(),"\b";case"f":return uu(),"\f";case"n":return uu(),"\n";case"r":return uu(),"\r";case"t":return uu(),"\t";case"v":return uu(),"\v";case"0":if(uu(),X(Y()))throw au(uu());return"\0";case"x":return uu(),function(){var u="",e=Y();if(!W(e))throw au(uu());if(u+=uu(),e=Y(),!W(e))throw au(uu());return u+=uu(),String.fromCodePoint(parseInt(u,16))}();case"u":return uu(),nu();case"\n":case"\u2028":case"\u2029":return uu(),"";case"\r":return uu(),"\n"===Y()&&uu(),"";case"1":case"2":case"3":case"4":case"5":case"6":case"7":case"8":case"9":case void 0:throw au(uu())}return uu()}());case'"':return z?(uu(),ru("string",R)):void(R+=uu());case"'":return z?void(R+=uu()):(uu(),ru("string",R));case"\n":case"\r":throw au(uu());case"\u2028":case"\u2029":!function(u){console.warn("JSON5: '"+Cu(u)+"' in strings is not valid ECMAScript; consider escaping")}(U);break;case void 0:throw au(uu())}R+=uu()},start:function(){switch(U){case"{":case"[":return ru("punctuator",uu())}$="value"},beforePropertyName:function(){switch(U){case"$":case"_":return R=uu(),void($="identifierName");case"\\":return uu(),void($="identifierNameStartEscape");case"}":return ru("punctuator",uu());case'"':case"'":return z='"'===uu(),void($="string")}if(q(U))return R+=uu(),void($="identifierName");throw au(uu())},afterPropertyName:function(){if(":"===U)return ru("punctuator",uu());throw au(uu())},beforePropertyValue:function(){$="value"},afterPropertyValue:function(){switch(U){case",":case"}":return ru("punctuator",uu())}throw au(uu())},beforeArrayValue:function(){if("]"===U)return ru("punctuator",uu());$="value"},afterArrayValue:function(){switch(U){case",":case"]":return ru("punctuator",uu())}throw au(uu())},end:function(){throw au(uu())}};function ru(u,e){return{type:u,value:e,line:M,column:k}}function tu(u){for(var e=0,r=u;e<r.length;e+=1){var t=r[e];if(Y()!==t)throw au(uu());uu()}}function nu(){for(var u="",e=4;e-- >0;){var r=Y();if(!W(r))throw au(uu());u+=uu()}return String.fromCodePoint(parseInt(u,16))}var Du={start:function(){if("eof"===L.type)throw cu();iu()},beforePropertyName:function(){switch(L.type){case"identifier":case"string":return T=L.value,void(N="afterPropertyName");case"punctuator":return void ou();case"eof":throw cu()}},afterPropertyName:function(){if("eof"===L.type)throw cu();N="beforePropertyValue"},beforePropertyValue:function(){if("eof"===L.type)throw cu();iu()},beforeArrayValue:function(){if("eof"===L.type)throw cu();"punctuator"!==L.type||"]"!==L.value?iu():ou()},afterPropertyValue:function(){if("eof"===L.type)throw cu();switch(L.value){case",":return void(N="beforePropertyName");case"}":ou()}},afterArrayValue:function(){if("eof"===L.type)throw cu();switch(L.value){case",":return void(N="beforeArrayValue");case"]":ou()}},end:function(){}};function iu(){var u;switch(L.type){case"punctuator":switch(L.value){case"{":u={};break;case"[":u=[]}break;case"null":case"boolean":case"numeric":case"string":u=L.value}if(void 0===K)K=u;else{var e=V[V.length-1];Array.isArray(e)?e.push(u):e[T]=u}if(null!==u&&"object"==typeof u)V.push(u),N=Array.isArray(u)?"beforeArrayValue":"beforePropertyName";else{var r=V[V.length-1];N=null==r?"end":Array.isArray(r)?"afterArrayValue":"afterPropertyValue"}}function ou(){V.pop();var u=V[V.length-1];N=null==u?"end":Array.isArray(u)?"afterArrayValue":"afterPropertyValue"}function au(u){return Au(void 0===u?"JSON5: invalid end of input at "+M+":"+k:"JSON5: invalid character '"+Cu(u)+"' at "+M+":"+k)}function cu(){return Au("JSON5: invalid end of input at "+M+":"+k)}function Fu(){return Au("JSON5: invalid identifier character at "+M+":"+(k-=5))}function Cu(u){var e={"'":"\\'",'"':'\\"',"\\":"\\\\","\b":"\\b","\f":"\\f","\n":"\\n","\r":"\\r","\t":"\\t","\v":"\\v","\0":"\\0","\u2028":"\\u2028","\u2029":"\\u2029"};if(e[u])return e[u];if(u<" "){var r=u.charCodeAt(0).toString(16);return"\\x"+("00"+r).substring(r.length)}return u}function Au(u){var e=new SyntaxError(u);return e.lineNumber=M,e.columnNumber=k,e}return{parse:function(u,e){_=String(u),N="start",V=[],I=0,M=1,k=0,L=void 0,T=void 0,K=void 0;do{L=Q(),Du[N]()}while("eof"!==L.type);return"function"==typeof e?function u(e,r,t){var n=e[r];if(null!=n&&"object"==typeof n)for(var D in n){var i=u(n,D,t);void 0===i?delete n[D]:n[D]=i}return t.call(e,r,n)}({"":K},"",e):K},stringify:function(u,e,r){var t,n,D,i=[],o="",a="";if(null==e||"object"!=typeof e||Array.isArray(e)||(r=e.space,D=e.quote,e=e.replacer),"function"==typeof e)n=e;else if(Array.isArray(e)){t=[];for(var c=0,F=e;c<F.length;c+=1){var C=F[c],A=void 0;"string"==typeof C?A=C:("number"==typeof C||C instanceof String||C instanceof Number)&&(A=String(C)),void 0!==A&&t.indexOf(A)<0&&t.push(A)}}return r instanceof Number?r=Number(r):r instanceof String&&(r=String(r)),"number"==typeof r?r>0&&(r=Math.min(10,Math.floor(r)),a="          ".substr(0,r)):"string"==typeof r&&(a=r.substr(0,10)),f("",{"":u});function f(u,e){var r=e[u];switch(null!=r&&("function"==typeof r.toJSON5?r=r.toJSON5(u):"function"==typeof r.toJSON&&(r=r.toJSON(u))),n&&(r=n.call(e,u,r)),r instanceof Number?r=Number(r):r instanceof String?r=String(r):r instanceof Boolean&&(r=r.valueOf()),r){case null:return"null";case!0:return"true";case!1:return"false"}return"string"==typeof r?E(r):"number"==typeof r?String(r):"object"==typeof r?Array.isArray(r)?function(u){if(i.indexOf(u)>=0)throw TypeError("Converting circular structure to JSON5");i.push(u);var e=o;o+=a;for(var r,t=[],n=0;n<u.length;n++){var D=f(String(n),u);t.push(void 0!==D?D:"null")}if(0===t.length)r="[]";else if(""===a){var c=t.join(",");r="["+c+"]"}else{var F=",\n"+o,C=t.join(F);r="[\n"+o+C+",\n"+e+"]"}return i.pop(),o=e,r}(r):function(u){if(i.indexOf(u)>=0)throw TypeError("Converting circular structure to JSON5");i.push(u);var e=o;o+=a;for(var r,n,D=t||Object.keys(u),c=[],F=0,C=D;F<C.length;F+=1){var A=C[F],E=f(A,u);if(void 0!==E){var l=s(A)+":";""!==a&&(l+=" "),l+=E,c.push(l)}}if(0===c.length)r="{}";else if(""===a)n=c.join(","),r="{"+n+"}";else{var B=",\n"+o;n=c.join(B),r="{\n"+o+n+",\n"+e+"}"}return i.pop(),o=e,r}(r):void 0}function E(u){for(var e={"'":.1,'"':.2},r={"'":"\\'",'"':'\\"',"\\":"\\\\","\b":"\\b","\f":"\\f","\n":"\\n","\r":"\\r","\t":"\\t","\v":"\\v","\0":"\\0","\u2028":"\\u2028","\u2029":"\\u2029"},t="",n=0;n<u.length;n++){var i=u[n];switch(i){case"'":case'"':e[i]++,t+=i;continue;case"\0":if(X(u[n+1])){t+="\\x00";continue}}if(r[i])t+=r[i];else if(i<" "){var o=i.charCodeAt(0).toString(16);t+="\\x"+("00"+o).substring(o.length)}else t+=i}var a=D||Object.keys(e).reduce((function(u,r){return e[u]<e[r]?u:r}));return a+(t=t.replace(new RegExp(a,"g"),r[a]))+a}function s(u){if(0===u.length)return E(u);var e=String.fromCodePoint(u.codePointAt(0));if(!q(e))return E(u);for(var r=e.length;r<u.length;r++)if(!H(String.fromCodePoint(u.codePointAt(r))))return E(u);return u}}}}()},function(u,e,r){"use strict";r.r(e),r.d(e,"ConfigPoint",(function(){return g})),r.d(e,"ConfigPointOperation",(function(){return $})),r.d(e,"extendConfiguration",(function(){return H})),r.d(e,"createConfiguration",(function(){return X})),r.d(e,"ReplaceOp",(function(){return L})),r.d(e,"SortOp",(function(){return T})),r.d(e,"ReferenceOp",(function(){return M})),r.d(e,"DeleteOp",(function(){return I})),r.d(e,"InsertOp",(function(){return V})),r.d(e,"safeFunction",(function(){return G})),r.d(e,"register",(function(){return Z})),r.d(e,"getConfig",(function(){return q})),r.d(e,"plugins",(function(){return W})),r.d(e,"loadSearchConfigPoint",(function(){return O})),r.d(e,"loadFile",(function(){return w}));function t(u){return function(u){if(Array.isArray(u))return a(u)}(u)||function(u){if("undefined"!=typeof Symbol&&null!=u[Symbol.iterator]||null!=u["@@iterator"])return Array.from(u)}(u)||o(u)||function(){throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")}()}function n(u,e){var r=Object.keys(u);if(Object.getOwnPropertySymbols){var t=Object.getOwnPropertySymbols(u);e&&(t=t.filter((function(e){return Object.getOwnPropertyDescriptor(u,e).enumerable}))),r.push.apply(r,t)}return r}function D(u){for(var e=1;e<arguments.length;e++){var r=null!=arguments[e]?arguments[e]:{};e%2?n(Object(r),!0).forEach((function(e){i(u,e,r[e])})):Object.getOwnPropertyDescriptors?Object.defineProperties(u,Object.getOwnPropertyDescriptors(r)):n(Object(r)).forEach((function(e){Object.defineProperty(u,e,Object.getOwnPropertyDescriptor(r,e))}))}return u}function i(u,e,r){return e in u?Object.defineProperty(u,e,{value:r,enumerable:!0,configurable:!0,writable:!0}):u[e]=r,u}function o(u,e){if(u){if("string"==typeof u)return a(u,e);var r=Object.prototype.toString.call(u).slice(8,-1);return"Object"===r&&u.constructor&&(r=u.constructor.name),"Map"===r||"Set"===r?Array.from(u):"Arguments"===r||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(r)?a(u,e):void 0}}function a(u,e){(null==e||e>u.length)&&(e=u.length);for(var r=0,t=new Array(e);r<e;r++)t[r]=u[r];return t}function c(u){return(c="function"==typeof Symbol&&"symbol"==typeof Symbol.iterator?function(u){return typeof u}:function(u){return u&&"function"==typeof Symbol&&u.constructor===Symbol&&u!==Symbol.prototype?"symbol":typeof u})(u)}var F={},C={};function A(u){var e=c(u);return null==u||"number"==e||"boolean"==e||"string"==e||"bigint"==e}var f=function(u,e){if(A(u))return u;var r=c(u);if("function"===r)return u;if("object"===r)return d(Array.isArray(u)?[]:{},u,e);throw new Error("The value ".concat(u," of type ").concat(r," isn't a known type for merging."))},E=function(u){var e=u.base,r=u.bKey,t=u.sVal;if(!t)return r;if(void 0!==t.position)return t.position;if(!t||void 0===t.id&&"number"==typeof r)return r;var n=t.key||"id",D=void 0===t.id?r:t.id;if(void 0!==D){for(var i=0;i<e.length;i++)if(e[i]==D||e[i]&&e[i][n]===D)return i;return e.length}},s=function(u){u.base;var e=u.bKey,r=u.sVal;return r&&(r.id||r.position)||e},l=function(u,e,r,t){var n=u.opSrcMap;if(!n){if(!r)return;n={},Object.defineProperty(u,"opSrcMap",{configurable:!0,enumerable:!1,value:n})}var D=n[e];return D||!r?D:n[e]=f(r,t)};function B(u,e,r,t,n){var D=e[r],i=u,o=n||r;Array.isArray(i)&&!Array.isArray(e)&&(o=E({base:i,bKey:o,sVal:D,context:t}));var a=i[o],c=function(u){if(u&&u.configOperation&&!u.isHidden){var e=u.configOperation,r=g.ConfigPointOperation[e];return r||console.log("configOperation",e,"specified but not defined - might be lazy defined later"),r}}(D),F=function(u,e,r){return e&&(r&&r.alias||"_"==u[0]&&u.substring(1))||u}(o,c,D),C=l(i,F);return c?c.immediate?c.immediate({sVal:D,base:i,bKey:o,key:r,context:t}):(C||(C=l(i,F,D,t),i[F]&&!0!==C.replace&&B(C,i,F,t,"value")),void Object.defineProperty(i,F,{configurable:!0,enumerable:!0,get:function(){return void 0!==C.computedValue||(C.computedValue=c.getter({base:i,bKey:o,key:r,context:t,opSrc:C})),C.computedValue},set:function(u){C.computedValue=u}})):(C&&(i=C,o="value",a=C.value,delete C.computedValue),Array.isArray(i)&&null==D?a:A(a)?i[o]=f(D,t):d(a,D,t))}function d(u,e,r){for(var t in e)B(u,e,t,r);return u}var p=function(u,e){u._loadListeners||Object.defineProperty(u,"_loadListeners",{value:[]}),-1==u._loadListeners.indexOf(e)&&u._loadListeners.push(e),e(u)},v={extendConfig:function(u){var e=u.name||"_order"+this._extensions._order.length;if(this._extensions[e])throw new Error("Level already has extension ".concat(e));return this._extensions[e]=u,this._extensions._order.push(u),this.applyExtensions(),this},applyExtensions:function(){var u=this;if(this._preExistingKeys)for(var e=0,r=Object.keys(this);e<r.length;e++){var t=r[e];this._preExistingKeys[t]||delete this[t]}else Object.defineProperty(this,"_preExistingKeys",{writable:!0,configurable:!0,value:{}}),this._preExistingKeys=Object.keys(this).reduce((function(u,e){return u[e]=!0,u}),this._preExistingKeys);delete this.opSrcMap,this._applyExtensionsTo(this),this._loadListeners&&this._loadListeners.forEach((function(e){return e(u)}))},_applyExtensionsTo:function(u){var e=this._configBase;e&&e._applyExtensionsTo?e._applyExtensionsTo(u):d(u,e,u);var r,t=function(u,e){var r="undefined"!=typeof Symbol&&u[Symbol.iterator]||u["@@iterator"];if(!r){if(Array.isArray(u)||(r=o(u))||e&&u&&"number"==typeof u.length){r&&(u=r);var t=0,n=function(){};return{s:n,n:function(){return t>=u.length?{done:!0}:{done:!1,value:u[t++]}},e:function(u){throw u},f:n}}throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")}var D,i=!0,a=!1;return{s:function(){r=r.call(u)},n:function(){var u=r.next();return i=u.done,u},e:function(u){a=!0,D=u},f:function(){try{i||null==r.return||r.return()}finally{if(a)throw D}}}}(this._extensions._order);try{for(t.s();!(r=t.n()).done;){d(u,r.value,u)}}catch(u){t.e(u)}finally{t.f()}}},y={addConfig:function(u,e){if(e===u)throw new Error("The configuration point ".concat(u," uses itself as a base"));var r="string"==typeof e?this.addConfig(e):e,t=F[u];if(t||(F[u]=t=function(u,e){if(!e)return u;for(var r=0,t=Object.keys(e);r<t.length;r++){var n=t[r];Object.defineProperty(u,n,{value:e[n],enumerable:!1})}return u}({},v),Object.defineProperty(t,"_configName",{value:u}),Object.defineProperty(this,u,{enumerable:!0,configurable:!0,get:function(){return F[u]}}),Object.defineProperty(t,"_configBase",{value:void 0,writable:!0}),Object.defineProperty(t,"_extensions",{value:{_order:[]}})),r){if(t._configBase!=r){var n=r._configName;if(t._configBase=r,n)return t._configReload||Object.defineProperty(t,"_configReload",{value:function(){t.applyExtensions()}}),p(r,t._configReload),t}t.applyExtensions()}return t},addLoadListener:p,register:function(){for(var u=this,e={},r=arguments.length,n=new Array(r),i=0;i<r;i++)n[i]=arguments[i];return n.forEach((function(r){if(Array.isArray(r))e=D(D({},e),u.register.apply(u,t(r)));else{var n=r.configName;if(n){var i=r.configBase,o=r.extension;i&&(e[n]=u.addConfig(n,i)),o&&(e[n]=u.addConfig(n).extendConfig(o))}else Object.keys(r).forEach((function(t){var n=r[t],D=n.configBase;e[t]=u.addConfig(t,D).extendConfig(n)}))}})),e},hasConfig:function(u){return null!=F[u]},getConfig:function(u){return"string"==typeof u?F[u]:u},clear:function(){var u=this;F={},Object.keys(C).forEach((function(e){u.register(C)}))},registerRoot:function(u){return Object.assign(C,u),g.register(u)},createConfiguration:function(u,e,r){if(r){var t="_intermediate_".concat(u);return g.register({configName:t,configBase:r,extension:e}),g.register({configName:u,configBase:t})[u]}return g.register({configName:u,configBase:e})[u]},extendConfiguration:function(u,e){return g.register({configName:u,extension:e})[u]}},g=D({name:"ConfigPoint"},y),h=g,b=r(0),m=r.n(b),w=function(u,e){return e.readFile(u).then((function(u){var e=m.a.parse(u);return Q.register(e)}))},O=function(u,e,r){var t=window.location.search,n=new URLSearchParams(t),D=u?[u]:null;if(r){var i=n.getAll(r);i&&i.length&&(i.forEach((function(u){if(!u.match(/^[a-zA-Z0-9]+$/))throw new Error("Parameter ".concat(r," has invalid value ").concat(u))})),D=i)}if(D){var o={};return D.forEach((function(u){if(!o[u]){var r=(e&&e+"/"+u||u)+".json5";o[u]=function(u,e){var r=new XMLHttpRequest,t=new Promise((function(e,t){r.addEventListener("load",(function(){try{var n=m.a.parse(r.responseText),D=h.register(n);e(D)}catch(e){console.log("Unable to load ".concat(u)),t("Unable to load ".concat(u," because ").concat(e))}}))}));return r.open("GET",e),r.send(),t}(u,r)}})),Promise.all(Object.values(o))}return Promise.resolve({})};function x(u){return function(u){if(Array.isArray(u))return S(u)}(u)||function(u){if("undefined"!=typeof Symbol&&null!=u[Symbol.iterator]||null!=u["@@iterator"])return Array.from(u)}(u)||function(u,e){if(!u)return;if("string"==typeof u)return S(u,e);var r=Object.prototype.toString.call(u).slice(8,-1);"Object"===r&&u.constructor&&(r=u.constructor.name);if("Map"===r||"Set"===r)return Array.from(u);if("Arguments"===r||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(r))return S(u,e)}(u)||function(){throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")}()}function S(u,e){(null==e||e>u.length)&&(e=u.length);for(var r=0,t=new Array(e);r<e;r++)t[r]=u[r];return t}function P(u,e){var r=Object.keys(u);if(Object.getOwnPropertySymbols){var t=Object.getOwnPropertySymbols(u);e&&(t=t.filter((function(e){return Object.getOwnPropertyDescriptor(u,e).enumerable}))),r.push.apply(r,t)}return r}function j(u){for(var e=1;e<arguments.length;e++){var r=null!=arguments[e]?arguments[e]:{};e%2?P(Object(r),!0).forEach((function(e){_(u,e,r[e])})):Object.getOwnPropertyDescriptors?Object.defineProperties(u,Object.getOwnPropertyDescriptors(r)):P(Object(r)).forEach((function(e){Object.defineProperty(u,e,Object.getOwnPropertyDescriptor(r,e))}))}return u}function _(u,e,r){return e in u?Object.defineProperty(u,e,{value:r,enumerable:!0,configurable:!0,writable:!0}):u[e]=r,u}var N=function(u,e){return j({_configOperation:u,create:function(u){return j(j({},u),{},{configOperation:this._configOperation})},at:function(u,e,r){return this.create(j(j({},r),{},{position:u,value:e}))},id:function(u,e,r){return this.create(j(j({},r),{},{id:u,value:e}))}},e)},V=N("insert",{immediate:function(u){var e=u.sVal,r=u.base,t=(u.bKey,u.context),n=E(u);return r.splice(n||0,0,f(e.value,t)),r}}),I=N("delete",{immediate:function(u){var e=u.base;u.bKey,u.sVal;if(Array.isArray(e)){var r=E(u);if(r>=0)return e.splice(r,1)}else if(e){var t=s(u);if(void 0===t)return;delete e[t]}return e}}),M=N("reference",{createCurrent:function(u,e){return this.create(j({reference:u},e))},getter:function(u){var e=u.context,r=u.opSrc,t=r.reference,n=r.transform,D=r.source,i=D?h.addConfig(D):e;if(D&&!t)return i;if(i){var o=i[t];return n?n(o):o}}}),k=N("bind",{createCurrent:function(u,e){return this.create(j({reference:u},e))},getter:function(u){var e=u.base,r=u.context,t=u.opSrc,n=t.reference,D=t.source,i=t.value,o=D?h.addConfig(D):r;if(o||void 0!==i){var a=void 0===i?o[n]:i;return"function"==typeof a?a.bind(e):a}}}),L=N("replace",{immediate:function(u){var e=u.sVal,r=u.context,t=u.base;if(!Array.isArray(t))return t[s(u)]=f(e.value,r);var n=E(u);return void 0!==n?t.splice(n,1,f(e.value,r)):void 0}}),T=N("sort",{createSort:function(u,e,r,t){return this.create(j(j({},t),{},{reference:u,sortKey:e,valueReference:r}))},getter:function(u){u.base,u.bKey;var e=u.context,r=u.opSrc;null==r.original&&(r.original=[]);var t=r.original,n=r.valueReference,D=r.sortKey,i=r.reference,o=r.value,a=i?e[i]:o;t.length=0;if(!a)return t;var c=Object.values(a).filter((function(u){return null!=u&&(!n||void 0!==u[n])}));return D&&(c=c.filter((function(u){return null!==u[D]}))),c.sort((function(u,e){var r=n?u[n]:u,t=n?e[n]:e,i=D?u[D]:r,o=D?e[D]:t;return i===o?0:i<o?-1:1})),c=c.map((function(u){return n?u[n]:u})),t.splice.apply(t,[0,t.length].concat(x(c))),t}}),K=N("safe",{createCurrent:function(u,e){return this.create(j({reference:u},e))},getter:function(u){u.base;var e=u.context,r=u.opSrc,t=r.reference,n=r.source,D=r.value,i=n?h.addConfig(n):e;if(i||void 0!==D)return G(void 0===D?i[t]:D)}}),$=h.registerRoot({ConfigPointOperation:{configBase:{sort:T,insert:V,delete:I,safe:K,bind:k,reference:M,replace:L,functions:{safeFunction:G}}}}).ConfigPointOperation,R=/(?:[a-z$_][a-z0-9$_]*(\.[a-z0-9$_]*)*)|(?:[;\\])|(?:`[^`]*`)|(?:"[^"]*")|(?:'[^']*')/gi,z=/(?:\$\{[^}]*\})/g,J=function(u){return u.replace(z,(function(u){return"${"+U(u.substring(2,u.length-1))+"}"}))},U=function(u){return u.replace(R,(function(u){return 0===u.indexOf("Math.")||'"'===u[0]||"'"===u[0]?u:"`"===u[0]?J(u):"this."+u}))};function G(u){if(!u)return function(){};var e=U(u),r=Function('"use strict"; var $data = this;return ('.concat(e,")"));return function(u){return r.bind(u)()}}h.register({plugins:{}}).plugins;var Z=g.register.bind(g),q=g.getConfig.bind(g),H=g.extendConfiguration.bind(g),X=g.createConfiguration.bind(g),W=g.getConfig("plugins"),Q=e.default=g;g.loadSearchConfigPoint=O}])}));
//# sourceMappingURL=index.umd.js.map

/***/ }),

/***/ "assert":
/*!*************************!*\
  !*** external "assert" ***!
  \*************************/
/***/ ((module) => {

"use strict";
module.exports = require("assert");

/***/ }),

/***/ "child_process":
/*!********************************!*\
  !*** external "child_process" ***!
  \********************************/
/***/ ((module) => {

"use strict";
module.exports = require("child_process");

/***/ }),

/***/ "events":
/*!*************************!*\
  !*** external "events" ***!
  \*************************/
/***/ ((module) => {

"use strict";
module.exports = require("events");

/***/ }),

/***/ "fs":
/*!*********************!*\
  !*** external "fs" ***!
  \*********************/
/***/ ((module) => {

"use strict";
module.exports = require("fs");

/***/ }),

/***/ "os":
/*!*********************!*\
  !*** external "os" ***!
  \*********************/
/***/ ((module) => {

"use strict";
module.exports = require("os");

/***/ }),

/***/ "path":
/*!***********************!*\
  !*** external "path" ***!
  \***********************/
/***/ ((module) => {

"use strict";
module.exports = require("path");

/***/ }),

/***/ "process":
/*!**************************!*\
  !*** external "process" ***!
  \**************************/
/***/ ((module) => {

"use strict";
module.exports = require("process");

/***/ }),

/***/ "util":
/*!***********************!*\
  !*** external "util" ***!
  \***********************/
/***/ ((module) => {

"use strict";
module.exports = require("util");

/***/ }),

/***/ "zlib":
/*!***********************!*\
  !*** external "zlib" ***!
  \***********************/
/***/ ((module) => {

"use strict";
module.exports = require("zlib");

/***/ }),

/***/ "./node_modules/commander/index.js":
/*!*****************************************!*\
  !*** ./node_modules/commander/index.js ***!
  \*****************************************/
/***/ ((module, exports, __webpack_require__) => {

const { Argument } = __webpack_require__(/*! ./lib/argument.js */ "./node_modules/commander/lib/argument.js");
const { Command } = __webpack_require__(/*! ./lib/command.js */ "./node_modules/commander/lib/command.js");
const { CommanderError, InvalidArgumentError } = __webpack_require__(/*! ./lib/error.js */ "./node_modules/commander/lib/error.js");
const { Help } = __webpack_require__(/*! ./lib/help.js */ "./node_modules/commander/lib/help.js");
const { Option } = __webpack_require__(/*! ./lib/option.js */ "./node_modules/commander/lib/option.js");

// @ts-check

/**
 * Expose the root command.
 */

exports = module.exports = new Command();
exports.program = exports; // More explicit access to global command.
// Implicit export of createArgument, createCommand, and createOption.

/**
 * Expose classes
 */

exports.Argument = Argument;
exports.Command = Command;
exports.CommanderError = CommanderError;
exports.Help = Help;
exports.InvalidArgumentError = InvalidArgumentError;
exports.InvalidOptionArgumentError = InvalidArgumentError; // Deprecated
exports.Option = Option;


/***/ }),

/***/ "./node_modules/commander/lib/argument.js":
/*!************************************************!*\
  !*** ./node_modules/commander/lib/argument.js ***!
  \************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

const { InvalidArgumentError } = __webpack_require__(/*! ./error.js */ "./node_modules/commander/lib/error.js");

// @ts-check

class Argument {
  /**
   * Initialize a new command argument with the given name and description.
   * The default is that the argument is required, and you can explicitly
   * indicate this with <> around the name. Put [] around the name for an optional argument.
   *
   * @param {string} name
   * @param {string} [description]
   */

  constructor(name, description) {
    this.description = description || '';
    this.variadic = false;
    this.parseArg = undefined;
    this.defaultValue = undefined;
    this.defaultValueDescription = undefined;
    this.argChoices = undefined;

    switch (name[0]) {
      case '<': // e.g. <required>
        this.required = true;
        this._name = name.slice(1, -1);
        break;
      case '[': // e.g. [optional]
        this.required = false;
        this._name = name.slice(1, -1);
        break;
      default:
        this.required = true;
        this._name = name;
        break;
    }

    if (this._name.length > 3 && this._name.slice(-3) === '...') {
      this.variadic = true;
      this._name = this._name.slice(0, -3);
    }
  }

  /**
   * Return argument name.
   *
   * @return {string}
   */

  name() {
    return this._name;
  }

  /**
   * @api private
   */

  _concatValue(value, previous) {
    if (previous === this.defaultValue || !Array.isArray(previous)) {
      return [value];
    }

    return previous.concat(value);
  }

  /**
   * Set the default value, and optionally supply the description to be displayed in the help.
   *
   * @param {any} value
   * @param {string} [description]
   * @return {Argument}
   */

  default(value, description) {
    this.defaultValue = value;
    this.defaultValueDescription = description;
    return this;
  }

  /**
   * Set the custom handler for processing CLI command arguments into argument values.
   *
   * @param {Function} [fn]
   * @return {Argument}
   */

  argParser(fn) {
    this.parseArg = fn;
    return this;
  }

  /**
   * Only allow argument value to be one of choices.
   *
   * @param {string[]} values
   * @return {Argument}
   */

  choices(values) {
    this.argChoices = values.slice();
    this.parseArg = (arg, previous) => {
      if (!this.argChoices.includes(arg)) {
        throw new InvalidArgumentError(`Allowed choices are ${this.argChoices.join(', ')}.`);
      }
      if (this.variadic) {
        return this._concatValue(arg, previous);
      }
      return arg;
    };
    return this;
  }

  /**
   * Make argument required.
   */
  argRequired() {
    this.required = true;
    return this;
  }

  /**
   * Make argument optional.
   */
  argOptional() {
    this.required = false;
    return this;
  }
}

/**
 * Takes an argument and returns its human readable equivalent for help usage.
 *
 * @param {Argument} arg
 * @return {string}
 * @api private
 */

function humanReadableArgName(arg) {
  const nameOutput = arg.name() + (arg.variadic === true ? '...' : '');

  return arg.required
    ? '<' + nameOutput + '>'
    : '[' + nameOutput + ']';
}

exports.Argument = Argument;
exports.humanReadableArgName = humanReadableArgName;


/***/ }),

/***/ "./node_modules/commander/lib/command.js":
/*!***********************************************!*\
  !*** ./node_modules/commander/lib/command.js ***!
  \***********************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

const EventEmitter = (__webpack_require__(/*! events */ "events").EventEmitter);
const childProcess = __webpack_require__(/*! child_process */ "child_process");
const path = __webpack_require__(/*! path */ "path");
const fs = __webpack_require__(/*! fs */ "fs");
const process = __webpack_require__(/*! process */ "process");

const { Argument, humanReadableArgName } = __webpack_require__(/*! ./argument.js */ "./node_modules/commander/lib/argument.js");
const { CommanderError } = __webpack_require__(/*! ./error.js */ "./node_modules/commander/lib/error.js");
const { Help } = __webpack_require__(/*! ./help.js */ "./node_modules/commander/lib/help.js");
const { Option, splitOptionFlags } = __webpack_require__(/*! ./option.js */ "./node_modules/commander/lib/option.js");
const { suggestSimilar } = __webpack_require__(/*! ./suggestSimilar */ "./node_modules/commander/lib/suggestSimilar.js");

// @ts-check

class Command extends EventEmitter {
  /**
   * Initialize a new `Command`.
   *
   * @param {string} [name]
   */

  constructor(name) {
    super();
    /** @type {Command[]} */
    this.commands = [];
    /** @type {Option[]} */
    this.options = [];
    this.parent = null;
    this._allowUnknownOption = false;
    this._allowExcessArguments = true;
    /** @type {Argument[]} */
    this._args = [];
    /** @type {string[]} */
    this.args = []; // cli args with options removed
    this.rawArgs = [];
    this.processedArgs = []; // like .args but after custom processing and collecting variadic
    this._scriptPath = null;
    this._name = name || '';
    this._optionValues = {};
    this._optionValueSources = {}; // default < config < env < cli
    this._storeOptionsAsProperties = false;
    this._actionHandler = null;
    this._executableHandler = false;
    this._executableFile = null; // custom name for executable
    this._executableDir = null; // custom search directory for subcommands
    this._defaultCommandName = null;
    this._exitCallback = null;
    this._aliases = [];
    this._combineFlagAndOptionalValue = true;
    this._description = '';
    this._argsDescription = undefined; // legacy
    this._enablePositionalOptions = false;
    this._passThroughOptions = false;
    this._lifeCycleHooks = {}; // a hash of arrays
    /** @type {boolean | string} */
    this._showHelpAfterError = false;
    this._showSuggestionAfterError = true;

    // see .configureOutput() for docs
    this._outputConfiguration = {
      writeOut: (str) => process.stdout.write(str),
      writeErr: (str) => process.stderr.write(str),
      getOutHelpWidth: () => process.stdout.isTTY ? process.stdout.columns : undefined,
      getErrHelpWidth: () => process.stderr.isTTY ? process.stderr.columns : undefined,
      outputError: (str, write) => write(str)
    };

    this._hidden = false;
    this._hasHelpOption = true;
    this._helpFlags = '-h, --help';
    this._helpDescription = 'display help for command';
    this._helpShortFlag = '-h';
    this._helpLongFlag = '--help';
    this._addImplicitHelpCommand = undefined; // Deliberately undefined, not decided whether true or false
    this._helpCommandName = 'help';
    this._helpCommandnameAndArgs = 'help [command]';
    this._helpCommandDescription = 'display help for command';
    this._helpConfiguration = {};
  }

  /**
   * Copy settings that are useful to have in common across root command and subcommands.
   *
   * (Used internally when adding a command using `.command()` so subcommands inherit parent settings.)
   *
   * @param {Command} sourceCommand
   * @return {Command} `this` command for chaining
   */
  copyInheritedSettings(sourceCommand) {
    this._outputConfiguration = sourceCommand._outputConfiguration;
    this._hasHelpOption = sourceCommand._hasHelpOption;
    this._helpFlags = sourceCommand._helpFlags;
    this._helpDescription = sourceCommand._helpDescription;
    this._helpShortFlag = sourceCommand._helpShortFlag;
    this._helpLongFlag = sourceCommand._helpLongFlag;
    this._helpCommandName = sourceCommand._helpCommandName;
    this._helpCommandnameAndArgs = sourceCommand._helpCommandnameAndArgs;
    this._helpCommandDescription = sourceCommand._helpCommandDescription;
    this._helpConfiguration = sourceCommand._helpConfiguration;
    this._exitCallback = sourceCommand._exitCallback;
    this._storeOptionsAsProperties = sourceCommand._storeOptionsAsProperties;
    this._combineFlagAndOptionalValue = sourceCommand._combineFlagAndOptionalValue;
    this._allowExcessArguments = sourceCommand._allowExcessArguments;
    this._enablePositionalOptions = sourceCommand._enablePositionalOptions;
    this._showHelpAfterError = sourceCommand._showHelpAfterError;
    this._showSuggestionAfterError = sourceCommand._showSuggestionAfterError;

    return this;
  }

  /**
   * Define a command.
   *
   * There are two styles of command: pay attention to where to put the description.
   *
   * @example
   * // Command implemented using action handler (description is supplied separately to `.command`)
   * program
   *   .command('clone <source> [destination]')
   *   .description('clone a repository into a newly created directory')
   *   .action((source, destination) => {
   *     console.log('clone command called');
   *   });
   *
   * // Command implemented using separate executable file (description is second parameter to `.command`)
   * program
   *   .command('start <service>', 'start named service')
   *   .command('stop [service]', 'stop named service, or all if no name supplied');
   *
   * @param {string} nameAndArgs - command name and arguments, args are `<required>` or `[optional]` and last may also be `variadic...`
   * @param {Object|string} [actionOptsOrExecDesc] - configuration options (for action), or description (for executable)
   * @param {Object} [execOpts] - configuration options (for executable)
   * @return {Command} returns new command for action handler, or `this` for executable command
   */

  command(nameAndArgs, actionOptsOrExecDesc, execOpts) {
    let desc = actionOptsOrExecDesc;
    let opts = execOpts;
    if (typeof desc === 'object' && desc !== null) {
      opts = desc;
      desc = null;
    }
    opts = opts || {};
    const [, name, args] = nameAndArgs.match(/([^ ]+) *(.*)/);

    const cmd = this.createCommand(name);
    if (desc) {
      cmd.description(desc);
      cmd._executableHandler = true;
    }
    if (opts.isDefault) this._defaultCommandName = cmd._name;
    cmd._hidden = !!(opts.noHelp || opts.hidden); // noHelp is deprecated old name for hidden
    cmd._executableFile = opts.executableFile || null; // Custom name for executable file, set missing to null to match constructor
    if (args) cmd.arguments(args);
    this.commands.push(cmd);
    cmd.parent = this;
    cmd.copyInheritedSettings(this);

    if (desc) return this;
    return cmd;
  }

  /**
   * Factory routine to create a new unattached command.
   *
   * See .command() for creating an attached subcommand, which uses this routine to
   * create the command. You can override createCommand to customise subcommands.
   *
   * @param {string} [name]
   * @return {Command} new command
   */

  createCommand(name) {
    return new Command(name);
  }

  /**
   * You can customise the help with a subclass of Help by overriding createHelp,
   * or by overriding Help properties using configureHelp().
   *
   * @return {Help}
   */

  createHelp() {
    return Object.assign(new Help(), this.configureHelp());
  }

  /**
   * You can customise the help by overriding Help properties using configureHelp(),
   * or with a subclass of Help by overriding createHelp().
   *
   * @param {Object} [configuration] - configuration options
   * @return {Command|Object} `this` command for chaining, or stored configuration
   */

  configureHelp(configuration) {
    if (configuration === undefined) return this._helpConfiguration;

    this._helpConfiguration = configuration;
    return this;
  }

  /**
   * The default output goes to stdout and stderr. You can customise this for special
   * applications. You can also customise the display of errors by overriding outputError.
   *
   * The configuration properties are all functions:
   *
   *     // functions to change where being written, stdout and stderr
   *     writeOut(str)
   *     writeErr(str)
   *     // matching functions to specify width for wrapping help
   *     getOutHelpWidth()
   *     getErrHelpWidth()
   *     // functions based on what is being written out
   *     outputError(str, write) // used for displaying errors, and not used for displaying help
   *
   * @param {Object} [configuration] - configuration options
   * @return {Command|Object} `this` command for chaining, or stored configuration
   */

  configureOutput(configuration) {
    if (configuration === undefined) return this._outputConfiguration;

    Object.assign(this._outputConfiguration, configuration);
    return this;
  }

  /**
   * Display the help or a custom message after an error occurs.
   *
   * @param {boolean|string} [displayHelp]
   * @return {Command} `this` command for chaining
   */
  showHelpAfterError(displayHelp = true) {
    if (typeof displayHelp !== 'string') displayHelp = !!displayHelp;
    this._showHelpAfterError = displayHelp;
    return this;
  }

  /**
   * Display suggestion of similar commands for unknown commands, or options for unknown options.
   *
   * @param {boolean} [displaySuggestion]
   * @return {Command} `this` command for chaining
   */
  showSuggestionAfterError(displaySuggestion = true) {
    this._showSuggestionAfterError = !!displaySuggestion;
    return this;
  }

  /**
   * Add a prepared subcommand.
   *
   * See .command() for creating an attached subcommand which inherits settings from its parent.
   *
   * @param {Command} cmd - new subcommand
   * @param {Object} [opts] - configuration options
   * @return {Command} `this` command for chaining
   */

  addCommand(cmd, opts) {
    if (!cmd._name) {
      throw new Error(`Command passed to .addCommand() must have a name
- specify the name in Command constructor or using .name()`);
    }

    opts = opts || {};
    if (opts.isDefault) this._defaultCommandName = cmd._name;
    if (opts.noHelp || opts.hidden) cmd._hidden = true; // modifying passed command due to existing implementation

    this.commands.push(cmd);
    cmd.parent = this;
    return this;
  }

  /**
   * Factory routine to create a new unattached argument.
   *
   * See .argument() for creating an attached argument, which uses this routine to
   * create the argument. You can override createArgument to return a custom argument.
   *
   * @param {string} name
   * @param {string} [description]
   * @return {Argument} new argument
   */

  createArgument(name, description) {
    return new Argument(name, description);
  }

  /**
   * Define argument syntax for command.
   *
   * The default is that the argument is required, and you can explicitly
   * indicate this with <> around the name. Put [] around the name for an optional argument.
   *
   * @example
   * program.argument('<input-file>');
   * program.argument('[output-file]');
   *
   * @param {string} name
   * @param {string} [description]
   * @param {Function|*} [fn] - custom argument processing function
   * @param {*} [defaultValue]
   * @return {Command} `this` command for chaining
   */
  argument(name, description, fn, defaultValue) {
    const argument = this.createArgument(name, description);
    if (typeof fn === 'function') {
      argument.default(defaultValue).argParser(fn);
    } else {
      argument.default(fn);
    }
    this.addArgument(argument);
    return this;
  }

  /**
   * Define argument syntax for command, adding multiple at once (without descriptions).
   *
   * See also .argument().
   *
   * @example
   * program.arguments('<cmd> [env]');
   *
   * @param {string} names
   * @return {Command} `this` command for chaining
   */

  arguments(names) {
    names.split(/ +/).forEach((detail) => {
      this.argument(detail);
    });
    return this;
  }

  /**
   * Define argument syntax for command, adding a prepared argument.
   *
   * @param {Argument} argument
   * @return {Command} `this` command for chaining
   */
  addArgument(argument) {
    const previousArgument = this._args.slice(-1)[0];
    if (previousArgument && previousArgument.variadic) {
      throw new Error(`only the last argument can be variadic '${previousArgument.name()}'`);
    }
    if (argument.required && argument.defaultValue !== undefined && argument.parseArg === undefined) {
      throw new Error(`a default value for a required argument is never used: '${argument.name()}'`);
    }
    this._args.push(argument);
    return this;
  }

  /**
   * Override default decision whether to add implicit help command.
   *
   *    addHelpCommand() // force on
   *    addHelpCommand(false); // force off
   *    addHelpCommand('help [cmd]', 'display help for [cmd]'); // force on with custom details
   *
   * @return {Command} `this` command for chaining
   */

  addHelpCommand(enableOrNameAndArgs, description) {
    if (enableOrNameAndArgs === false) {
      this._addImplicitHelpCommand = false;
    } else {
      this._addImplicitHelpCommand = true;
      if (typeof enableOrNameAndArgs === 'string') {
        this._helpCommandName = enableOrNameAndArgs.split(' ')[0];
        this._helpCommandnameAndArgs = enableOrNameAndArgs;
      }
      this._helpCommandDescription = description || this._helpCommandDescription;
    }
    return this;
  }

  /**
   * @return {boolean}
   * @api private
   */

  _hasImplicitHelpCommand() {
    if (this._addImplicitHelpCommand === undefined) {
      return this.commands.length && !this._actionHandler && !this._findCommand('help');
    }
    return this._addImplicitHelpCommand;
  }

  /**
   * Add hook for life cycle event.
   *
   * @param {string} event
   * @param {Function} listener
   * @return {Command} `this` command for chaining
   */

  hook(event, listener) {
    const allowedValues = ['preAction', 'postAction'];
    if (!allowedValues.includes(event)) {
      throw new Error(`Unexpected value for event passed to hook : '${event}'.
Expecting one of '${allowedValues.join("', '")}'`);
    }
    if (this._lifeCycleHooks[event]) {
      this._lifeCycleHooks[event].push(listener);
    } else {
      this._lifeCycleHooks[event] = [listener];
    }
    return this;
  }

  /**
   * Register callback to use as replacement for calling process.exit.
   *
   * @param {Function} [fn] optional callback which will be passed a CommanderError, defaults to throwing
   * @return {Command} `this` command for chaining
   */

  exitOverride(fn) {
    if (fn) {
      this._exitCallback = fn;
    } else {
      this._exitCallback = (err) => {
        if (err.code !== 'commander.executeSubCommandAsync') {
          throw err;
        } else {
          // Async callback from spawn events, not useful to throw.
        }
      };
    }
    return this;
  }

  /**
   * Call process.exit, and _exitCallback if defined.
   *
   * @param {number} exitCode exit code for using with process.exit
   * @param {string} code an id string representing the error
   * @param {string} message human-readable description of the error
   * @return never
   * @api private
   */

  _exit(exitCode, code, message) {
    if (this._exitCallback) {
      this._exitCallback(new CommanderError(exitCode, code, message));
      // Expecting this line is not reached.
    }
    process.exit(exitCode);
  }

  /**
   * Register callback `fn` for the command.
   *
   * @example
   * program
   *   .command('serve')
   *   .description('start service')
   *   .action(function() {
   *      // do work here
   *   });
   *
   * @param {Function} fn
   * @return {Command} `this` command for chaining
   */

  action(fn) {
    const listener = (args) => {
      // The .action callback takes an extra parameter which is the command or options.
      const expectedArgsCount = this._args.length;
      const actionArgs = args.slice(0, expectedArgsCount);
      if (this._storeOptionsAsProperties) {
        actionArgs[expectedArgsCount] = this; // backwards compatible "options"
      } else {
        actionArgs[expectedArgsCount] = this.opts();
      }
      actionArgs.push(this);

      return fn.apply(this, actionArgs);
    };
    this._actionHandler = listener;
    return this;
  }

  /**
   * Factory routine to create a new unattached option.
   *
   * See .option() for creating an attached option, which uses this routine to
   * create the option. You can override createOption to return a custom option.
   *
   * @param {string} flags
   * @param {string} [description]
   * @return {Option} new option
   */

  createOption(flags, description) {
    return new Option(flags, description);
  }

  /**
   * Add an option.
   *
   * @param {Option} option
   * @return {Command} `this` command for chaining
   */
  addOption(option) {
    const oname = option.name();
    const name = option.attributeName();

    // store default value
    if (option.negate) {
      // --no-foo is special and defaults foo to true, unless a --foo option is already defined
      const positiveLongFlag = option.long.replace(/^--no-/, '--');
      if (!this._findOption(positiveLongFlag)) {
        this.setOptionValueWithSource(name, option.defaultValue === undefined ? true : option.defaultValue, 'default');
      }
    } else if (option.defaultValue !== undefined) {
      this.setOptionValueWithSource(name, option.defaultValue, 'default');
    }

    // register the option
    this.options.push(option);

    // handler for cli and env supplied values
    const handleOptionValue = (val, invalidValueMessage, valueSource) => {
      // val is null for optional option used without an optional-argument.
      // val is undefined for boolean and negated option.
      if (val == null && option.presetArg !== undefined) {
        val = option.presetArg;
      }

      // custom processing
      const oldValue = this.getOptionValue(name);
      if (val !== null && option.parseArg) {
        try {
          val = option.parseArg(val, oldValue);
        } catch (err) {
          if (err.code === 'commander.invalidArgument') {
            const message = `${invalidValueMessage} ${err.message}`;
            this.error(message, { exitCode: err.exitCode, code: err.code });
          }
          throw err;
        }
      } else if (val !== null && option.variadic) {
        val = option._concatValue(val, oldValue);
      }

      // Fill-in appropriate missing values. Long winded but easy to follow.
      if (val == null) {
        if (option.negate) {
          val = false;
        } else if (option.isBoolean() || option.optional) {
          val = true;
        } else {
          val = ''; // not normal, parseArg might have failed or be a mock function for testing
        }
      }
      this.setOptionValueWithSource(name, val, valueSource);
    };

    this.on('option:' + oname, (val) => {
      const invalidValueMessage = `error: option '${option.flags}' argument '${val}' is invalid.`;
      handleOptionValue(val, invalidValueMessage, 'cli');
    });

    if (option.envVar) {
      this.on('optionEnv:' + oname, (val) => {
        const invalidValueMessage = `error: option '${option.flags}' value '${val}' from env '${option.envVar}' is invalid.`;
        handleOptionValue(val, invalidValueMessage, 'env');
      });
    }

    return this;
  }

  /**
   * Internal implementation shared by .option() and .requiredOption()
   *
   * @api private
   */
  _optionEx(config, flags, description, fn, defaultValue) {
    if (typeof flags === 'object' && flags instanceof Option) {
      throw new Error('To add an Option object use addOption() instead of option() or requiredOption()');
    }
    const option = this.createOption(flags, description);
    option.makeOptionMandatory(!!config.mandatory);
    if (typeof fn === 'function') {
      option.default(defaultValue).argParser(fn);
    } else if (fn instanceof RegExp) {
      // deprecated
      const regex = fn;
      fn = (val, def) => {
        const m = regex.exec(val);
        return m ? m[0] : def;
      };
      option.default(defaultValue).argParser(fn);
    } else {
      option.default(fn);
    }

    return this.addOption(option);
  }

  /**
   * Define option with `flags`, `description` and optional
   * coercion `fn`.
   *
   * The `flags` string contains the short and/or long flags,
   * separated by comma, a pipe or space. The following are all valid
   * all will output this way when `--help` is used.
   *
   *     "-p, --pepper"
   *     "-p|--pepper"
   *     "-p --pepper"
   *
   * @example
   * // simple boolean defaulting to undefined
   * program.option('-p, --pepper', 'add pepper');
   *
   * program.pepper
   * // => undefined
   *
   * --pepper
   * program.pepper
   * // => true
   *
   * // simple boolean defaulting to true (unless non-negated option is also defined)
   * program.option('-C, --no-cheese', 'remove cheese');
   *
   * program.cheese
   * // => true
   *
   * --no-cheese
   * program.cheese
   * // => false
   *
   * // required argument
   * program.option('-C, --chdir <path>', 'change the working directory');
   *
   * --chdir /tmp
   * program.chdir
   * // => "/tmp"
   *
   * // optional argument
   * program.option('-c, --cheese [type]', 'add cheese [marble]');
   *
   * @param {string} flags
   * @param {string} [description]
   * @param {Function|*} [fn] - custom option processing function or default value
   * @param {*} [defaultValue]
   * @return {Command} `this` command for chaining
   */

  option(flags, description, fn, defaultValue) {
    return this._optionEx({}, flags, description, fn, defaultValue);
  }

  /**
  * Add a required option which must have a value after parsing. This usually means
  * the option must be specified on the command line. (Otherwise the same as .option().)
  *
  * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space.
  *
  * @param {string} flags
  * @param {string} [description]
  * @param {Function|*} [fn] - custom option processing function or default value
  * @param {*} [defaultValue]
  * @return {Command} `this` command for chaining
  */

  requiredOption(flags, description, fn, defaultValue) {
    return this._optionEx({ mandatory: true }, flags, description, fn, defaultValue);
  }

  /**
   * Alter parsing of short flags with optional values.
   *
   * @example
   * // for `.option('-f,--flag [value]'):
   * program.combineFlagAndOptionalValue(true);  // `-f80` is treated like `--flag=80`, this is the default behaviour
   * program.combineFlagAndOptionalValue(false) // `-fb` is treated like `-f -b`
   *
   * @param {Boolean} [combine=true] - if `true` or omitted, an optional value can be specified directly after the flag.
   */
  combineFlagAndOptionalValue(combine = true) {
    this._combineFlagAndOptionalValue = !!combine;
    return this;
  }

  /**
   * Allow unknown options on the command line.
   *
   * @param {Boolean} [allowUnknown=true] - if `true` or omitted, no error will be thrown
   * for unknown options.
   */
  allowUnknownOption(allowUnknown = true) {
    this._allowUnknownOption = !!allowUnknown;
    return this;
  }

  /**
   * Allow excess command-arguments on the command line. Pass false to make excess arguments an error.
   *
   * @param {Boolean} [allowExcess=true] - if `true` or omitted, no error will be thrown
   * for excess arguments.
   */
  allowExcessArguments(allowExcess = true) {
    this._allowExcessArguments = !!allowExcess;
    return this;
  }

  /**
   * Enable positional options. Positional means global options are specified before subcommands which lets
   * subcommands reuse the same option names, and also enables subcommands to turn on passThroughOptions.
   * The default behaviour is non-positional and global options may appear anywhere on the command line.
   *
   * @param {Boolean} [positional=true]
   */
  enablePositionalOptions(positional = true) {
    this._enablePositionalOptions = !!positional;
    return this;
  }

  /**
   * Pass through options that come after command-arguments rather than treat them as command-options,
   * so actual command-options come before command-arguments. Turning this on for a subcommand requires
   * positional options to have been enabled on the program (parent commands).
   * The default behaviour is non-positional and options may appear before or after command-arguments.
   *
   * @param {Boolean} [passThrough=true]
   * for unknown options.
   */
  passThroughOptions(passThrough = true) {
    this._passThroughOptions = !!passThrough;
    if (!!this.parent && passThrough && !this.parent._enablePositionalOptions) {
      throw new Error('passThroughOptions can not be used without turning on enablePositionalOptions for parent command(s)');
    }
    return this;
  }

  /**
    * Whether to store option values as properties on command object,
    * or store separately (specify false). In both cases the option values can be accessed using .opts().
    *
    * @param {boolean} [storeAsProperties=true]
    * @return {Command} `this` command for chaining
    */

  storeOptionsAsProperties(storeAsProperties = true) {
    this._storeOptionsAsProperties = !!storeAsProperties;
    if (this.options.length) {
      throw new Error('call .storeOptionsAsProperties() before adding options');
    }
    return this;
  }

  /**
   * Retrieve option value.
   *
   * @param {string} key
   * @return {Object} value
   */

  getOptionValue(key) {
    if (this._storeOptionsAsProperties) {
      return this[key];
    }
    return this._optionValues[key];
  }

  /**
   * Store option value.
   *
   * @param {string} key
   * @param {Object} value
   * @return {Command} `this` command for chaining
   */

  setOptionValue(key, value) {
    if (this._storeOptionsAsProperties) {
      this[key] = value;
    } else {
      this._optionValues[key] = value;
    }
    return this;
  }

  /**
   * Store option value and where the value came from.
    *
    * @param {string} key
    * @param {Object} value
    * @param {string} source - expected values are default/config/env/cli
    * @return {Command} `this` command for chaining
    */

  setOptionValueWithSource(key, value, source) {
    this.setOptionValue(key, value);
    this._optionValueSources[key] = source;
    return this;
  }

  /**
    * Get source of option value.
    * Expected values are default | config | env | cli
    *
    * @param {string} key
    * @return {string}
    */

  getOptionValueSource(key) {
    return this._optionValueSources[key];
  }

  /**
   * Get user arguments from implied or explicit arguments.
   * Side-effects: set _scriptPath if args included script. Used for default program name, and subcommand searches.
   *
   * @api private
   */

  _prepareUserArgs(argv, parseOptions) {
    if (argv !== undefined && !Array.isArray(argv)) {
      throw new Error('first parameter to parse must be array or undefined');
    }
    parseOptions = parseOptions || {};

    // Default to using process.argv
    if (argv === undefined) {
      argv = process.argv;
      // @ts-ignore: unknown property
      if (process.versions && process.versions.electron) {
        parseOptions.from = 'electron';
      }
    }
    this.rawArgs = argv.slice();

    // make it a little easier for callers by supporting various argv conventions
    let userArgs;
    switch (parseOptions.from) {
      case undefined:
      case 'node':
        this._scriptPath = argv[1];
        userArgs = argv.slice(2);
        break;
      case 'electron':
        // @ts-ignore: unknown property
        if (process.defaultApp) {
          this._scriptPath = argv[1];
          userArgs = argv.slice(2);
        } else {
          userArgs = argv.slice(1);
        }
        break;
      case 'user':
        userArgs = argv.slice(0);
        break;
      default:
        throw new Error(`unexpected parse option { from: '${parseOptions.from}' }`);
    }

    // Find default name for program from arguments.
    if (!this._name && this._scriptPath) this.nameFromFilename(this._scriptPath);
    this._name = this._name || 'program';

    return userArgs;
  }

  /**
   * Parse `argv`, setting options and invoking commands when defined.
   *
   * The default expectation is that the arguments are from node and have the application as argv[0]
   * and the script being run in argv[1], with user parameters after that.
   *
   * @example
   * program.parse(process.argv);
   * program.parse(); // implicitly use process.argv and auto-detect node vs electron conventions
   * program.parse(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
   *
   * @param {string[]} [argv] - optional, defaults to process.argv
   * @param {Object} [parseOptions] - optionally specify style of options with from: node/user/electron
   * @param {string} [parseOptions.from] - where the args are from: 'node', 'user', 'electron'
   * @return {Command} `this` command for chaining
   */

  parse(argv, parseOptions) {
    const userArgs = this._prepareUserArgs(argv, parseOptions);
    this._parseCommand([], userArgs);

    return this;
  }

  /**
   * Parse `argv`, setting options and invoking commands when defined.
   *
   * Use parseAsync instead of parse if any of your action handlers are async. Returns a Promise.
   *
   * The default expectation is that the arguments are from node and have the application as argv[0]
   * and the script being run in argv[1], with user parameters after that.
   *
   * @example
   * await program.parseAsync(process.argv);
   * await program.parseAsync(); // implicitly use process.argv and auto-detect node vs electron conventions
   * await program.parseAsync(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
   *
   * @param {string[]} [argv]
   * @param {Object} [parseOptions]
   * @param {string} parseOptions.from - where the args are from: 'node', 'user', 'electron'
   * @return {Promise}
   */

  async parseAsync(argv, parseOptions) {
    const userArgs = this._prepareUserArgs(argv, parseOptions);
    await this._parseCommand([], userArgs);

    return this;
  }

  /**
   * Execute a sub-command executable.
   *
   * @api private
   */

  _executeSubCommand(subcommand, args) {
    args = args.slice();
    let launchWithNode = false; // Use node for source targets so do not need to get permissions correct, and on Windows.
    const sourceExt = ['.js', '.ts', '.tsx', '.mjs', '.cjs'];

    function findFile(baseDir, baseName) {
      // Look for specified file
      const localBin = path.resolve(baseDir, baseName);
      if (fs.existsSync(localBin)) return localBin;

      // Stop looking if candidate already has an expected extension.
      if (sourceExt.includes(path.extname(baseName))) return undefined;

      // Try all the extensions.
      const foundExt = sourceExt.find(ext => fs.existsSync(`${localBin}${ext}`));
      if (foundExt) return `${localBin}${foundExt}`;

      return undefined;
    }

    // Not checking for help first. Unlikely to have mandatory and executable, and can't robustly test for help flags in external command.
    this._checkForMissingMandatoryOptions();

    // executableFile and executableDir might be full path, or just a name
    let executableFile = subcommand._executableFile || `${this._name}-${subcommand._name}`;
    let executableDir = this._executableDir || '';
    if (this._scriptPath) {
      let resolvedScriptPath; // resolve possible symlink for installed npm binary
      try {
        resolvedScriptPath = fs.realpathSync(this._scriptPath);
      } catch (err) {
        resolvedScriptPath = this._scriptPath;
      }
      executableDir = path.resolve(path.dirname(resolvedScriptPath), executableDir);
    }

    // Look for a local file in preference to a command in PATH.
    if (executableDir) {
      let localFile = findFile(executableDir, executableFile);

      // Legacy search using prefix of script name instead of command name
      if (!localFile && !subcommand._executableFile && this._scriptPath) {
        const legacyName = path.basename(this._scriptPath, path.extname(this._scriptPath));
        if (legacyName !== this._name) {
          localFile = findFile(executableDir, `${legacyName}-${subcommand._name}`);
        }
      }
      executableFile = localFile || executableFile;
    }

    launchWithNode = sourceExt.includes(path.extname(executableFile));

    let proc;
    if (process.platform !== 'win32') {
      if (launchWithNode) {
        args.unshift(executableFile);
        // add executable arguments to spawn
        args = incrementNodeInspectorPort(process.execArgv).concat(args);

        proc = childProcess.spawn(process.argv[0], args, { stdio: 'inherit' });
      } else {
        proc = childProcess.spawn(executableFile, args, { stdio: 'inherit' });
      }
    } else {
      args.unshift(executableFile);
      // add executable arguments to spawn
      args = incrementNodeInspectorPort(process.execArgv).concat(args);
      proc = childProcess.spawn(process.execPath, args, { stdio: 'inherit' });
    }

    if (!proc.killed) { // testing mainly to avoid leak warnings during unit tests with mocked spawn
      const signals = ['SIGUSR1', 'SIGUSR2', 'SIGTERM', 'SIGINT', 'SIGHUP'];
      signals.forEach((signal) => {
        // @ts-ignore
        process.on(signal, () => {
          if (proc.killed === false && proc.exitCode === null) {
            proc.kill(signal);
          }
        });
      });
    }

    // By default terminate process when spawned process terminates.
    // Suppressing the exit if exitCallback defined is a bit messy and of limited use, but does allow process to stay running!
    const exitCallback = this._exitCallback;
    if (!exitCallback) {
      proc.on('close', process.exit.bind(process));
    } else {
      proc.on('close', () => {
        exitCallback(new CommanderError(process.exitCode || 0, 'commander.executeSubCommandAsync', '(close)'));
      });
    }
    proc.on('error', (err) => {
      // @ts-ignore
      if (err.code === 'ENOENT') {
        const executableDirMessage = executableDir
          ? `searched for local subcommand relative to directory '${executableDir}'`
          : 'no directory for search for local subcommand, use .executableDir() to supply a custom directory';
        const executableMissing = `'${executableFile}' does not exist
 - if '${subcommand._name}' is not meant to be an executable command, remove description parameter from '.command()' and use '.description()' instead
 - if the default executable name is not suitable, use the executableFile option to supply a custom name or path
 - ${executableDirMessage}`;
        throw new Error(executableMissing);
      // @ts-ignore
      } else if (err.code === 'EACCES') {
        throw new Error(`'${executableFile}' not executable`);
      }
      if (!exitCallback) {
        process.exit(1);
      } else {
        const wrappedError = new CommanderError(1, 'commander.executeSubCommandAsync', '(error)');
        wrappedError.nestedError = err;
        exitCallback(wrappedError);
      }
    });

    // Store the reference to the child process
    this.runningCommand = proc;
  }

  /**
   * @api private
   */

  _dispatchSubcommand(commandName, operands, unknown) {
    const subCommand = this._findCommand(commandName);
    if (!subCommand) this.help({ error: true });

    if (subCommand._executableHandler) {
      this._executeSubCommand(subCommand, operands.concat(unknown));
    } else {
      return subCommand._parseCommand(operands, unknown);
    }
  }

  /**
   * Check this.args against expected this._args.
   *
   * @api private
   */

  _checkNumberOfArguments() {
    // too few
    this._args.forEach((arg, i) => {
      if (arg.required && this.args[i] == null) {
        this.missingArgument(arg.name());
      }
    });
    // too many
    if (this._args.length > 0 && this._args[this._args.length - 1].variadic) {
      return;
    }
    if (this.args.length > this._args.length) {
      this._excessArguments(this.args);
    }
  }

  /**
   * Process this.args using this._args and save as this.processedArgs!
   *
   * @api private
   */

  _processArguments() {
    const myParseArg = (argument, value, previous) => {
      // Extra processing for nice error message on parsing failure.
      let parsedValue = value;
      if (value !== null && argument.parseArg) {
        try {
          parsedValue = argument.parseArg(value, previous);
        } catch (err) {
          if (err.code === 'commander.invalidArgument') {
            const message = `error: command-argument value '${value}' is invalid for argument '${argument.name()}'. ${err.message}`;
            this.error(message, { exitCode: err.exitCode, code: err.code });
          }
          throw err;
        }
      }
      return parsedValue;
    };

    this._checkNumberOfArguments();

    const processedArgs = [];
    this._args.forEach((declaredArg, index) => {
      let value = declaredArg.defaultValue;
      if (declaredArg.variadic) {
        // Collect together remaining arguments for passing together as an array.
        if (index < this.args.length) {
          value = this.args.slice(index);
          if (declaredArg.parseArg) {
            value = value.reduce((processed, v) => {
              return myParseArg(declaredArg, v, processed);
            }, declaredArg.defaultValue);
          }
        } else if (value === undefined) {
          value = [];
        }
      } else if (index < this.args.length) {
        value = this.args[index];
        if (declaredArg.parseArg) {
          value = myParseArg(declaredArg, value, declaredArg.defaultValue);
        }
      }
      processedArgs[index] = value;
    });
    this.processedArgs = processedArgs;
  }

  /**
   * Once we have a promise we chain, but call synchronously until then.
   *
   * @param {Promise|undefined} promise
   * @param {Function} fn
   * @return {Promise|undefined}
   * @api private
   */

  _chainOrCall(promise, fn) {
    // thenable
    if (promise && promise.then && typeof promise.then === 'function') {
      // already have a promise, chain callback
      return promise.then(() => fn());
    }
    // callback might return a promise
    return fn();
  }

  /**
   *
   * @param {Promise|undefined} promise
   * @param {string} event
   * @return {Promise|undefined}
   * @api private
   */

  _chainOrCallHooks(promise, event) {
    let result = promise;
    const hooks = [];
    getCommandAndParents(this)
      .reverse()
      .filter(cmd => cmd._lifeCycleHooks[event] !== undefined)
      .forEach(hookedCommand => {
        hookedCommand._lifeCycleHooks[event].forEach((callback) => {
          hooks.push({ hookedCommand, callback });
        });
      });
    if (event === 'postAction') {
      hooks.reverse();
    }

    hooks.forEach((hookDetail) => {
      result = this._chainOrCall(result, () => {
        return hookDetail.callback(hookDetail.hookedCommand, this);
      });
    });
    return result;
  }

  /**
   * Process arguments in context of this command.
   * Returns action result, in case it is a promise.
   *
   * @api private
   */

  _parseCommand(operands, unknown) {
    const parsed = this.parseOptions(unknown);
    this._parseOptionsEnv(); // after cli, so parseArg not called on both cli and env
    operands = operands.concat(parsed.operands);
    unknown = parsed.unknown;
    this.args = operands.concat(unknown);

    if (operands && this._findCommand(operands[0])) {
      return this._dispatchSubcommand(operands[0], operands.slice(1), unknown);
    }
    if (this._hasImplicitHelpCommand() && operands[0] === this._helpCommandName) {
      if (operands.length === 1) {
        this.help();
      }
      return this._dispatchSubcommand(operands[1], [], [this._helpLongFlag]);
    }
    if (this._defaultCommandName) {
      outputHelpIfRequested(this, unknown); // Run the help for default command from parent rather than passing to default command
      return this._dispatchSubcommand(this._defaultCommandName, operands, unknown);
    }
    if (this.commands.length && this.args.length === 0 && !this._actionHandler && !this._defaultCommandName) {
      // probably missing subcommand and no handler, user needs help (and exit)
      this.help({ error: true });
    }

    outputHelpIfRequested(this, parsed.unknown);
    this._checkForMissingMandatoryOptions();
    this._checkForConflictingOptions();

    // We do not always call this check to avoid masking a "better" error, like unknown command.
    const checkForUnknownOptions = () => {
      if (parsed.unknown.length > 0) {
        this.unknownOption(parsed.unknown[0]);
      }
    };

    const commandEvent = `command:${this.name()}`;
    if (this._actionHandler) {
      checkForUnknownOptions();
      this._processArguments();

      let actionResult;
      actionResult = this._chainOrCallHooks(actionResult, 'preAction');
      actionResult = this._chainOrCall(actionResult, () => this._actionHandler(this.processedArgs));
      if (this.parent) {
        actionResult = this._chainOrCall(actionResult, () => {
          this.parent.emit(commandEvent, operands, unknown); // legacy
        });
      }
      actionResult = this._chainOrCallHooks(actionResult, 'postAction');
      return actionResult;
    }
    if (this.parent && this.parent.listenerCount(commandEvent)) {
      checkForUnknownOptions();
      this._processArguments();
      this.parent.emit(commandEvent, operands, unknown); // legacy
    } else if (operands.length) {
      if (this._findCommand('*')) { // legacy default command
        return this._dispatchSubcommand('*', operands, unknown);
      }
      if (this.listenerCount('command:*')) {
        // skip option check, emit event for possible misspelling suggestion
        this.emit('command:*', operands, unknown);
      } else if (this.commands.length) {
        this.unknownCommand();
      } else {
        checkForUnknownOptions();
        this._processArguments();
      }
    } else if (this.commands.length) {
      checkForUnknownOptions();
      // This command has subcommands and nothing hooked up at this level, so display help (and exit).
      this.help({ error: true });
    } else {
      checkForUnknownOptions();
      this._processArguments();
      // fall through for caller to handle after calling .parse()
    }
  }

  /**
   * Find matching command.
   *
   * @api private
   */
  _findCommand(name) {
    if (!name) return undefined;
    return this.commands.find(cmd => cmd._name === name || cmd._aliases.includes(name));
  }

  /**
   * Return an option matching `arg` if any.
   *
   * @param {string} arg
   * @return {Option}
   * @api private
   */

  _findOption(arg) {
    return this.options.find(option => option.is(arg));
  }

  /**
   * Display an error message if a mandatory option does not have a value.
   * Lazy calling after checking for help flags from leaf subcommand.
   *
   * @api private
   */

  _checkForMissingMandatoryOptions() {
    // Walk up hierarchy so can call in subcommand after checking for displaying help.
    for (let cmd = this; cmd; cmd = cmd.parent) {
      cmd.options.forEach((anOption) => {
        if (anOption.mandatory && (cmd.getOptionValue(anOption.attributeName()) === undefined)) {
          cmd.missingMandatoryOptionValue(anOption);
        }
      });
    }
  }

  /**
   * Display an error message if conflicting options are used together.
   *
   * @api private
   */
  _checkForConflictingOptions() {
    const definedNonDefaultOptions = this.options.filter(
      (option) => {
        const optionKey = option.attributeName();
        if (this.getOptionValue(optionKey) === undefined) {
          return false;
        }
        return this.getOptionValueSource(optionKey) !== 'default';
      }
    );

    const optionsWithConflicting = definedNonDefaultOptions.filter(
      (option) => option.conflictsWith.length > 0
    );

    optionsWithConflicting.forEach((option) => {
      const conflictingAndDefined = definedNonDefaultOptions.find((defined) =>
        option.conflictsWith.includes(defined.attributeName())
      );
      if (conflictingAndDefined) {
        this._conflictingOption(option, conflictingAndDefined);
      }
    });
  }

  /**
   * Parse options from `argv` removing known options,
   * and return argv split into operands and unknown arguments.
   *
   * Examples:
   *
   *     argv => operands, unknown
   *     --known kkk op => [op], []
   *     op --known kkk => [op], []
   *     sub --unknown uuu op => [sub], [--unknown uuu op]
   *     sub -- --unknown uuu op => [sub --unknown uuu op], []
   *
   * @param {String[]} argv
   * @return {{operands: String[], unknown: String[]}}
   */

  parseOptions(argv) {
    const operands = []; // operands, not options or values
    const unknown = []; // first unknown option and remaining unknown args
    let dest = operands;
    const args = argv.slice();

    function maybeOption(arg) {
      return arg.length > 1 && arg[0] === '-';
    }

    // parse options
    let activeVariadicOption = null;
    while (args.length) {
      const arg = args.shift();

      // literal
      if (arg === '--') {
        if (dest === unknown) dest.push(arg);
        dest.push(...args);
        break;
      }

      if (activeVariadicOption && !maybeOption(arg)) {
        this.emit(`option:${activeVariadicOption.name()}`, arg);
        continue;
      }
      activeVariadicOption = null;

      if (maybeOption(arg)) {
        const option = this._findOption(arg);
        // recognised option, call listener to assign value with possible custom processing
        if (option) {
          if (option.required) {
            const value = args.shift();
            if (value === undefined) this.optionMissingArgument(option);
            this.emit(`option:${option.name()}`, value);
          } else if (option.optional) {
            let value = null;
            // historical behaviour is optional value is following arg unless an option
            if (args.length > 0 && !maybeOption(args[0])) {
              value = args.shift();
            }
            this.emit(`option:${option.name()}`, value);
          } else { // boolean flag
            this.emit(`option:${option.name()}`);
          }
          activeVariadicOption = option.variadic ? option : null;
          continue;
        }
      }

      // Look for combo options following single dash, eat first one if known.
      if (arg.length > 2 && arg[0] === '-' && arg[1] !== '-') {
        const option = this._findOption(`-${arg[1]}`);
        if (option) {
          if (option.required || (option.optional && this._combineFlagAndOptionalValue)) {
            // option with value following in same argument
            this.emit(`option:${option.name()}`, arg.slice(2));
          } else {
            // boolean option, emit and put back remainder of arg for further processing
            this.emit(`option:${option.name()}`);
            args.unshift(`-${arg.slice(2)}`);
          }
          continue;
        }
      }

      // Look for known long flag with value, like --foo=bar
      if (/^--[^=]+=/.test(arg)) {
        const index = arg.indexOf('=');
        const option = this._findOption(arg.slice(0, index));
        if (option && (option.required || option.optional)) {
          this.emit(`option:${option.name()}`, arg.slice(index + 1));
          continue;
        }
      }

      // Not a recognised option by this command.
      // Might be a command-argument, or subcommand option, or unknown option, or help command or option.

      // An unknown option means further arguments also classified as unknown so can be reprocessed by subcommands.
      if (maybeOption(arg)) {
        dest = unknown;
      }

      // If using positionalOptions, stop processing our options at subcommand.
      if ((this._enablePositionalOptions || this._passThroughOptions) && operands.length === 0 && unknown.length === 0) {
        if (this._findCommand(arg)) {
          operands.push(arg);
          if (args.length > 0) unknown.push(...args);
          break;
        } else if (arg === this._helpCommandName && this._hasImplicitHelpCommand()) {
          operands.push(arg);
          if (args.length > 0) operands.push(...args);
          break;
        } else if (this._defaultCommandName) {
          unknown.push(arg);
          if (args.length > 0) unknown.push(...args);
          break;
        }
      }

      // If using passThroughOptions, stop processing options at first command-argument.
      if (this._passThroughOptions) {
        dest.push(arg);
        if (args.length > 0) dest.push(...args);
        break;
      }

      // add arg
      dest.push(arg);
    }

    return { operands, unknown };
  }

  /**
   * Return an object containing local option values as key-value pairs.
   *
   * @return {Object}
   */
  opts() {
    if (this._storeOptionsAsProperties) {
      // Preserve original behaviour so backwards compatible when still using properties
      const result = {};
      const len = this.options.length;

      for (let i = 0; i < len; i++) {
        const key = this.options[i].attributeName();
        result[key] = key === this._versionOptionName ? this._version : this[key];
      }
      return result;
    }

    return this._optionValues;
  }

  /**
   * Return an object containing merged local and global option values as key-value pairs.
   *
   * @return {Object}
   */
  optsWithGlobals() {
    // globals overwrite locals
    return getCommandAndParents(this).reduce(
      (combinedOptions, cmd) => Object.assign(combinedOptions, cmd.opts()),
      {}
    );
  }

  /**
   * Display error message and exit (or call exitOverride).
   *
   * @param {string} message
   * @param {Object} [errorOptions]
   * @param {string} [errorOptions.code] - an id string representing the error
   * @param {number} [errorOptions.exitCode] - used with process.exit
   */
  error(message, errorOptions) {
    // output handling
    this._outputConfiguration.outputError(`${message}\n`, this._outputConfiguration.writeErr);
    if (typeof this._showHelpAfterError === 'string') {
      this._outputConfiguration.writeErr(`${this._showHelpAfterError}\n`);
    } else if (this._showHelpAfterError) {
      this._outputConfiguration.writeErr('\n');
      this.outputHelp({ error: true });
    }

    // exit handling
    const config = errorOptions || {};
    const exitCode = config.exitCode || 1;
    const code = config.code || 'commander.error';
    this._exit(exitCode, code, message);
  }

  /**
   * Apply any option related environment variables, if option does
   * not have a value from cli or client code.
   *
   * @api private
   */
  _parseOptionsEnv() {
    this.options.forEach((option) => {
      if (option.envVar && option.envVar in process.env) {
        const optionKey = option.attributeName();
        // Priority check. Do not overwrite cli or options from unknown source (client-code).
        if (this.getOptionValue(optionKey) === undefined || ['default', 'config', 'env'].includes(this.getOptionValueSource(optionKey))) {
          if (option.required || option.optional) { // option can take a value
            // keep very simple, optional always takes value
            this.emit(`optionEnv:${option.name()}`, process.env[option.envVar]);
          } else { // boolean
            // keep very simple, only care that envVar defined and not the value
            this.emit(`optionEnv:${option.name()}`);
          }
        }
      }
    });
  }

  /**
   * Argument `name` is missing.
   *
   * @param {string} name
   * @api private
   */

  missingArgument(name) {
    const message = `error: missing required argument '${name}'`;
    this.error(message, { code: 'commander.missingArgument' });
  }

  /**
   * `Option` is missing an argument.
   *
   * @param {Option} option
   * @api private
   */

  optionMissingArgument(option) {
    const message = `error: option '${option.flags}' argument missing`;
    this.error(message, { code: 'commander.optionMissingArgument' });
  }

  /**
   * `Option` does not have a value, and is a mandatory option.
   *
   * @param {Option} option
   * @api private
   */

  missingMandatoryOptionValue(option) {
    const message = `error: required option '${option.flags}' not specified`;
    this.error(message, { code: 'commander.missingMandatoryOptionValue' });
  }

  /**
   * `Option` conflicts with another option.
   *
   * @param {Option} option
   * @param {Option} conflictingOption
   * @api private
   */
  _conflictingOption(option, conflictingOption) {
    // The calling code does not know whether a negated option is the source of the
    // value, so do some work to take an educated guess.
    const findBestOptionFromValue = (option) => {
      const optionKey = option.attributeName();
      const optionValue = this.getOptionValue(optionKey);
      const negativeOption = this.options.find(target => target.negate && optionKey === target.attributeName());
      const positiveOption = this.options.find(target => !target.negate && optionKey === target.attributeName());
      if (negativeOption && (
        (negativeOption.presetArg === undefined && optionValue === false) ||
        (negativeOption.presetArg !== undefined && optionValue === negativeOption.presetArg)
      )) {
        return negativeOption;
      }
      return positiveOption || option;
    };

    const getErrorMessage = (option) => {
      const bestOption = findBestOptionFromValue(option);
      const optionKey = bestOption.attributeName();
      const source = this.getOptionValueSource(optionKey);
      if (source === 'env') {
        return `environment variable '${bestOption.envVar}'`;
      }
      return `option '${bestOption.flags}'`;
    };

    const message = `error: ${getErrorMessage(option)} cannot be used with ${getErrorMessage(conflictingOption)}`;
    this.error(message, { code: 'commander.conflictingOption' });
  }

  /**
   * Unknown option `flag`.
   *
   * @param {string} flag
   * @api private
   */

  unknownOption(flag) {
    if (this._allowUnknownOption) return;
    let suggestion = '';

    if (flag.startsWith('--') && this._showSuggestionAfterError) {
      // Looping to pick up the global options too
      let candidateFlags = [];
      let command = this;
      do {
        const moreFlags = command.createHelp().visibleOptions(command)
          .filter(option => option.long)
          .map(option => option.long);
        candidateFlags = candidateFlags.concat(moreFlags);
        command = command.parent;
      } while (command && !command._enablePositionalOptions);
      suggestion = suggestSimilar(flag, candidateFlags);
    }

    const message = `error: unknown option '${flag}'${suggestion}`;
    this.error(message, { code: 'commander.unknownOption' });
  }

  /**
   * Excess arguments, more than expected.
   *
   * @param {string[]} receivedArgs
   * @api private
   */

  _excessArguments(receivedArgs) {
    if (this._allowExcessArguments) return;

    const expected = this._args.length;
    const s = (expected === 1) ? '' : 's';
    const forSubcommand = this.parent ? ` for '${this.name()}'` : '';
    const message = `error: too many arguments${forSubcommand}. Expected ${expected} argument${s} but got ${receivedArgs.length}.`;
    this.error(message, { code: 'commander.excessArguments' });
  }

  /**
   * Unknown command.
   *
   * @api private
   */

  unknownCommand() {
    const unknownName = this.args[0];
    let suggestion = '';

    if (this._showSuggestionAfterError) {
      const candidateNames = [];
      this.createHelp().visibleCommands(this).forEach((command) => {
        candidateNames.push(command.name());
        // just visible alias
        if (command.alias()) candidateNames.push(command.alias());
      });
      suggestion = suggestSimilar(unknownName, candidateNames);
    }

    const message = `error: unknown command '${unknownName}'${suggestion}`;
    this.error(message, { code: 'commander.unknownCommand' });
  }

  /**
   * Set the program version to `str`.
   *
   * This method auto-registers the "-V, --version" flag
   * which will print the version number when passed.
   *
   * You can optionally supply the  flags and description to override the defaults.
   *
   * @param {string} str
   * @param {string} [flags]
   * @param {string} [description]
   * @return {this | string} `this` command for chaining, or version string if no arguments
   */

  version(str, flags, description) {
    if (str === undefined) return this._version;
    this._version = str;
    flags = flags || '-V, --version';
    description = description || 'output the version number';
    const versionOption = this.createOption(flags, description);
    this._versionOptionName = versionOption.attributeName();
    this.options.push(versionOption);
    this.on('option:' + versionOption.name(), () => {
      this._outputConfiguration.writeOut(`${str}\n`);
      this._exit(0, 'commander.version', str);
    });
    return this;
  }

  /**
   * Set the description to `str`.
   *
   * @param {string} [str]
   * @param {Object} [argsDescription]
   * @return {string|Command}
   */
  description(str, argsDescription) {
    if (str === undefined && argsDescription === undefined) return this._description;
    this._description = str;
    if (argsDescription) {
      this._argsDescription = argsDescription;
    }
    return this;
  }

  /**
   * Set an alias for the command.
   *
   * You may call more than once to add multiple aliases. Only the first alias is shown in the auto-generated help.
   *
   * @param {string} [alias]
   * @return {string|Command}
   */

  alias(alias) {
    if (alias === undefined) return this._aliases[0]; // just return first, for backwards compatibility

    /** @type {Command} */
    let command = this;
    if (this.commands.length !== 0 && this.commands[this.commands.length - 1]._executableHandler) {
      // assume adding alias for last added executable subcommand, rather than this
      command = this.commands[this.commands.length - 1];
    }

    if (alias === command._name) throw new Error('Command alias can\'t be the same as its name');

    command._aliases.push(alias);
    return this;
  }

  /**
   * Set aliases for the command.
   *
   * Only the first alias is shown in the auto-generated help.
   *
   * @param {string[]} [aliases]
   * @return {string[]|Command}
   */

  aliases(aliases) {
    // Getter for the array of aliases is the main reason for having aliases() in addition to alias().
    if (aliases === undefined) return this._aliases;

    aliases.forEach((alias) => this.alias(alias));
    return this;
  }

  /**
   * Set / get the command usage `str`.
   *
   * @param {string} [str]
   * @return {String|Command}
   */

  usage(str) {
    if (str === undefined) {
      if (this._usage) return this._usage;

      const args = this._args.map((arg) => {
        return humanReadableArgName(arg);
      });
      return [].concat(
        (this.options.length || this._hasHelpOption ? '[options]' : []),
        (this.commands.length ? '[command]' : []),
        (this._args.length ? args : [])
      ).join(' ');
    }

    this._usage = str;
    return this;
  }

  /**
   * Get or set the name of the command.
   *
   * @param {string} [str]
   * @return {string|Command}
   */

  name(str) {
    if (str === undefined) return this._name;
    this._name = str;
    return this;
  }

  /**
   * Set the name of the command from script filename, such as process.argv[1],
   * or require.main.filename, or __filename.
   *
   * (Used internally and public although not documented in README.)
   *
   * @example
   * program.nameFromFilename(require.main.filename);
   *
   * @param {string} filename
   * @return {Command}
   */

  nameFromFilename(filename) {
    this._name = path.basename(filename, path.extname(filename));

    return this;
  }

  /**
   * Get or set the directory for searching for executable subcommands of this command.
   *
   * @example
   * program.executableDir(__dirname);
   * // or
   * program.executableDir('subcommands');
   *
   * @param {string} [path]
   * @return {string|Command}
   */

  executableDir(path) {
    if (path === undefined) return this._executableDir;
    this._executableDir = path;
    return this;
  }

  /**
   * Return program help documentation.
   *
   * @param {{ error: boolean }} [contextOptions] - pass {error:true} to wrap for stderr instead of stdout
   * @return {string}
   */

  helpInformation(contextOptions) {
    const helper = this.createHelp();
    if (helper.helpWidth === undefined) {
      helper.helpWidth = (contextOptions && contextOptions.error) ? this._outputConfiguration.getErrHelpWidth() : this._outputConfiguration.getOutHelpWidth();
    }
    return helper.formatHelp(this, helper);
  }

  /**
   * @api private
   */

  _getHelpContext(contextOptions) {
    contextOptions = contextOptions || {};
    const context = { error: !!contextOptions.error };
    let write;
    if (context.error) {
      write = (arg) => this._outputConfiguration.writeErr(arg);
    } else {
      write = (arg) => this._outputConfiguration.writeOut(arg);
    }
    context.write = contextOptions.write || write;
    context.command = this;
    return context;
  }

  /**
   * Output help information for this command.
   *
   * Outputs built-in help, and custom text added using `.addHelpText()`.
   *
   * @param {{ error: boolean } | Function} [contextOptions] - pass {error:true} to write to stderr instead of stdout
   */

  outputHelp(contextOptions) {
    let deprecatedCallback;
    if (typeof contextOptions === 'function') {
      deprecatedCallback = contextOptions;
      contextOptions = undefined;
    }
    const context = this._getHelpContext(contextOptions);

    getCommandAndParents(this).reverse().forEach(command => command.emit('beforeAllHelp', context));
    this.emit('beforeHelp', context);

    let helpInformation = this.helpInformation(context);
    if (deprecatedCallback) {
      helpInformation = deprecatedCallback(helpInformation);
      if (typeof helpInformation !== 'string' && !Buffer.isBuffer(helpInformation)) {
        throw new Error('outputHelp callback must return a string or a Buffer');
      }
    }
    context.write(helpInformation);

    this.emit(this._helpLongFlag); // deprecated
    this.emit('afterHelp', context);
    getCommandAndParents(this).forEach(command => command.emit('afterAllHelp', context));
  }

  /**
   * You can pass in flags and a description to override the help
   * flags and help description for your command. Pass in false to
   * disable the built-in help option.
   *
   * @param {string | boolean} [flags]
   * @param {string} [description]
   * @return {Command} `this` command for chaining
   */

  helpOption(flags, description) {
    if (typeof flags === 'boolean') {
      this._hasHelpOption = flags;
      return this;
    }
    this._helpFlags = flags || this._helpFlags;
    this._helpDescription = description || this._helpDescription;

    const helpFlags = splitOptionFlags(this._helpFlags);
    this._helpShortFlag = helpFlags.shortFlag;
    this._helpLongFlag = helpFlags.longFlag;

    return this;
  }

  /**
   * Output help information and exit.
   *
   * Outputs built-in help, and custom text added using `.addHelpText()`.
   *
   * @param {{ error: boolean }} [contextOptions] - pass {error:true} to write to stderr instead of stdout
   */

  help(contextOptions) {
    this.outputHelp(contextOptions);
    let exitCode = process.exitCode || 0;
    if (exitCode === 0 && contextOptions && typeof contextOptions !== 'function' && contextOptions.error) {
      exitCode = 1;
    }
    // message: do not have all displayed text available so only passing placeholder.
    this._exit(exitCode, 'commander.help', '(outputHelp)');
  }

  /**
   * Add additional text to be displayed with the built-in help.
   *
   * Position is 'before' or 'after' to affect just this command,
   * and 'beforeAll' or 'afterAll' to affect this command and all its subcommands.
   *
   * @param {string} position - before or after built-in help
   * @param {string | Function} text - string to add, or a function returning a string
   * @return {Command} `this` command for chaining
   */
  addHelpText(position, text) {
    const allowedValues = ['beforeAll', 'before', 'after', 'afterAll'];
    if (!allowedValues.includes(position)) {
      throw new Error(`Unexpected value for position to addHelpText.
Expecting one of '${allowedValues.join("', '")}'`);
    }
    const helpEvent = `${position}Help`;
    this.on(helpEvent, (context) => {
      let helpStr;
      if (typeof text === 'function') {
        helpStr = text({ error: context.error, command: context.command });
      } else {
        helpStr = text;
      }
      // Ignore falsy value when nothing to output.
      if (helpStr) {
        context.write(`${helpStr}\n`);
      }
    });
    return this;
  }
}

/**
 * Output help information if help flags specified
 *
 * @param {Command} cmd - command to output help for
 * @param {Array} args - array of options to search for help flags
 * @api private
 */

function outputHelpIfRequested(cmd, args) {
  const helpOption = cmd._hasHelpOption && args.find(arg => arg === cmd._helpLongFlag || arg === cmd._helpShortFlag);
  if (helpOption) {
    cmd.outputHelp();
    // (Do not have all displayed text available so only passing placeholder.)
    cmd._exit(0, 'commander.helpDisplayed', '(outputHelp)');
  }
}

/**
 * Scan arguments and increment port number for inspect calls (to avoid conflicts when spawning new command).
 *
 * @param {string[]} args - array of arguments from node.execArgv
 * @returns {string[]}
 * @api private
 */

function incrementNodeInspectorPort(args) {
  // Testing for these options:
  //  --inspect[=[host:]port]
  //  --inspect-brk[=[host:]port]
  //  --inspect-port=[host:]port
  return args.map((arg) => {
    if (!arg.startsWith('--inspect')) {
      return arg;
    }
    let debugOption;
    let debugHost = '127.0.0.1';
    let debugPort = '9229';
    let match;
    if ((match = arg.match(/^(--inspect(-brk)?)$/)) !== null) {
      // e.g. --inspect
      debugOption = match[1];
    } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+)$/)) !== null) {
      debugOption = match[1];
      if (/^\d+$/.test(match[3])) {
        // e.g. --inspect=1234
        debugPort = match[3];
      } else {
        // e.g. --inspect=localhost
        debugHost = match[3];
      }
    } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+):(\d+)$/)) !== null) {
      // e.g. --inspect=localhost:1234
      debugOption = match[1];
      debugHost = match[3];
      debugPort = match[4];
    }

    if (debugOption && debugPort !== '0') {
      return `${debugOption}=${debugHost}:${parseInt(debugPort) + 1}`;
    }
    return arg;
  });
}

/**
 * @param {Command} startCommand
 * @returns {Command[]}
 * @api private
 */

function getCommandAndParents(startCommand) {
  const result = [];
  for (let command = startCommand; command; command = command.parent) {
    result.push(command);
  }
  return result;
}

exports.Command = Command;


/***/ }),

/***/ "./node_modules/commander/lib/error.js":
/*!*********************************************!*\
  !*** ./node_modules/commander/lib/error.js ***!
  \*********************************************/
/***/ ((__unused_webpack_module, exports) => {

// @ts-check

/**
 * CommanderError class
 * @class
 */
class CommanderError extends Error {
  /**
   * Constructs the CommanderError class
   * @param {number} exitCode suggested exit code which could be used with process.exit
   * @param {string} code an id string representing the error
   * @param {string} message human-readable description of the error
   * @constructor
   */
  constructor(exitCode, code, message) {
    super(message);
    // properly capture stack trace in Node.js
    Error.captureStackTrace(this, this.constructor);
    this.name = this.constructor.name;
    this.code = code;
    this.exitCode = exitCode;
    this.nestedError = undefined;
  }
}

/**
 * InvalidArgumentError class
 * @class
 */
class InvalidArgumentError extends CommanderError {
  /**
   * Constructs the InvalidArgumentError class
   * @param {string} [message] explanation of why argument is invalid
   * @constructor
   */
  constructor(message) {
    super(1, 'commander.invalidArgument', message);
    // properly capture stack trace in Node.js
    Error.captureStackTrace(this, this.constructor);
    this.name = this.constructor.name;
  }
}

exports.CommanderError = CommanderError;
exports.InvalidArgumentError = InvalidArgumentError;


/***/ }),

/***/ "./node_modules/commander/lib/help.js":
/*!********************************************!*\
  !*** ./node_modules/commander/lib/help.js ***!
  \********************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

const { humanReadableArgName } = __webpack_require__(/*! ./argument.js */ "./node_modules/commander/lib/argument.js");

/**
 * TypeScript import types for JSDoc, used by Visual Studio Code IntelliSense and `npm run typescript-checkJS`
 * https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html#import-types
 * @typedef { import("./argument.js").Argument } Argument
 * @typedef { import("./command.js").Command } Command
 * @typedef { import("./option.js").Option } Option
 */

// @ts-check

// Although this is a class, methods are static in style to allow override using subclass or just functions.
class Help {
  constructor() {
    this.helpWidth = undefined;
    this.sortSubcommands = false;
    this.sortOptions = false;
  }

  /**
   * Get an array of the visible subcommands. Includes a placeholder for the implicit help command, if there is one.
   *
   * @param {Command} cmd
   * @returns {Command[]}
   */

  visibleCommands(cmd) {
    const visibleCommands = cmd.commands.filter(cmd => !cmd._hidden);
    if (cmd._hasImplicitHelpCommand()) {
      // Create a command matching the implicit help command.
      const [, helpName, helpArgs] = cmd._helpCommandnameAndArgs.match(/([^ ]+) *(.*)/);
      const helpCommand = cmd.createCommand(helpName)
        .helpOption(false);
      helpCommand.description(cmd._helpCommandDescription);
      if (helpArgs) helpCommand.arguments(helpArgs);
      visibleCommands.push(helpCommand);
    }
    if (this.sortSubcommands) {
      visibleCommands.sort((a, b) => {
        // @ts-ignore: overloaded return type
        return a.name().localeCompare(b.name());
      });
    }
    return visibleCommands;
  }

  /**
   * Get an array of the visible options. Includes a placeholder for the implicit help option, if there is one.
   *
   * @param {Command} cmd
   * @returns {Option[]}
   */

  visibleOptions(cmd) {
    const visibleOptions = cmd.options.filter((option) => !option.hidden);
    // Implicit help
    const showShortHelpFlag = cmd._hasHelpOption && cmd._helpShortFlag && !cmd._findOption(cmd._helpShortFlag);
    const showLongHelpFlag = cmd._hasHelpOption && !cmd._findOption(cmd._helpLongFlag);
    if (showShortHelpFlag || showLongHelpFlag) {
      let helpOption;
      if (!showShortHelpFlag) {
        helpOption = cmd.createOption(cmd._helpLongFlag, cmd._helpDescription);
      } else if (!showLongHelpFlag) {
        helpOption = cmd.createOption(cmd._helpShortFlag, cmd._helpDescription);
      } else {
        helpOption = cmd.createOption(cmd._helpFlags, cmd._helpDescription);
      }
      visibleOptions.push(helpOption);
    }
    if (this.sortOptions) {
      const getSortKey = (option) => {
        // WYSIWYG for order displayed in help with short before long, no special handling for negated.
        return option.short ? option.short.replace(/^-/, '') : option.long.replace(/^--/, '');
      };
      visibleOptions.sort((a, b) => {
        return getSortKey(a).localeCompare(getSortKey(b));
      });
    }
    return visibleOptions;
  }

  /**
   * Get an array of the arguments if any have a description.
   *
   * @param {Command} cmd
   * @returns {Argument[]}
   */

  visibleArguments(cmd) {
    // Side effect! Apply the legacy descriptions before the arguments are displayed.
    if (cmd._argsDescription) {
      cmd._args.forEach(argument => {
        argument.description = argument.description || cmd._argsDescription[argument.name()] || '';
      });
    }

    // If there are any arguments with a description then return all the arguments.
    if (cmd._args.find(argument => argument.description)) {
      return cmd._args;
    }
    return [];
  }

  /**
   * Get the command term to show in the list of subcommands.
   *
   * @param {Command} cmd
   * @returns {string}
   */

  subcommandTerm(cmd) {
    // Legacy. Ignores custom usage string, and nested commands.
    const args = cmd._args.map(arg => humanReadableArgName(arg)).join(' ');
    return cmd._name +
      (cmd._aliases[0] ? '|' + cmd._aliases[0] : '') +
      (cmd.options.length ? ' [options]' : '') + // simplistic check for non-help option
      (args ? ' ' + args : '');
  }

  /**
   * Get the option term to show in the list of options.
   *
   * @param {Option} option
   * @returns {string}
   */

  optionTerm(option) {
    return option.flags;
  }

  /**
   * Get the argument term to show in the list of arguments.
   *
   * @param {Argument} argument
   * @returns {string}
   */

  argumentTerm(argument) {
    return argument.name();
  }

  /**
   * Get the longest command term length.
   *
   * @param {Command} cmd
   * @param {Help} helper
   * @returns {number}
   */

  longestSubcommandTermLength(cmd, helper) {
    return helper.visibleCommands(cmd).reduce((max, command) => {
      return Math.max(max, helper.subcommandTerm(command).length);
    }, 0);
  }

  /**
   * Get the longest option term length.
   *
   * @param {Command} cmd
   * @param {Help} helper
   * @returns {number}
   */

  longestOptionTermLength(cmd, helper) {
    return helper.visibleOptions(cmd).reduce((max, option) => {
      return Math.max(max, helper.optionTerm(option).length);
    }, 0);
  }

  /**
   * Get the longest argument term length.
   *
   * @param {Command} cmd
   * @param {Help} helper
   * @returns {number}
   */

  longestArgumentTermLength(cmd, helper) {
    return helper.visibleArguments(cmd).reduce((max, argument) => {
      return Math.max(max, helper.argumentTerm(argument).length);
    }, 0);
  }

  /**
   * Get the command usage to be displayed at the top of the built-in help.
   *
   * @param {Command} cmd
   * @returns {string}
   */

  commandUsage(cmd) {
    // Usage
    let cmdName = cmd._name;
    if (cmd._aliases[0]) {
      cmdName = cmdName + '|' + cmd._aliases[0];
    }
    let parentCmdNames = '';
    for (let parentCmd = cmd.parent; parentCmd; parentCmd = parentCmd.parent) {
      parentCmdNames = parentCmd.name() + ' ' + parentCmdNames;
    }
    return parentCmdNames + cmdName + ' ' + cmd.usage();
  }

  /**
   * Get the description for the command.
   *
   * @param {Command} cmd
   * @returns {string}
   */

  commandDescription(cmd) {
    // @ts-ignore: overloaded return type
    return cmd.description();
  }

  /**
   * Get the command description to show in the list of subcommands.
   *
   * @param {Command} cmd
   * @returns {string}
   */

  subcommandDescription(cmd) {
    // @ts-ignore: overloaded return type
    return cmd.description();
  }

  /**
   * Get the option description to show in the list of options.
   *
   * @param {Option} option
   * @return {string}
   */

  optionDescription(option) {
    const extraInfo = [];

    if (option.argChoices) {
      extraInfo.push(
        // use stringify to match the display of the default value
        `choices: ${option.argChoices.map((choice) => JSON.stringify(choice)).join(', ')}`);
    }
    if (option.defaultValue !== undefined) {
      // default for boolean and negated more for programmer than end user,
      // but show true/false for boolean option as may be for hand-rolled env or config processing.
      const showDefault = option.required || option.optional ||
        (option.isBoolean() && typeof option.defaultValue === 'boolean');
      if (showDefault) {
        extraInfo.push(`default: ${option.defaultValueDescription || JSON.stringify(option.defaultValue)}`);
      }
    }
    // preset for boolean and negated are more for programmer than end user
    if (option.presetArg !== undefined && option.optional) {
      extraInfo.push(`preset: ${JSON.stringify(option.presetArg)}`);
    }
    if (option.envVar !== undefined) {
      extraInfo.push(`env: ${option.envVar}`);
    }
    if (extraInfo.length > 0) {
      return `${option.description} (${extraInfo.join(', ')})`;
    }

    return option.description;
  }

  /**
   * Get the argument description to show in the list of arguments.
   *
   * @param {Argument} argument
   * @return {string}
   */

  argumentDescription(argument) {
    const extraInfo = [];
    if (argument.argChoices) {
      extraInfo.push(
        // use stringify to match the display of the default value
        `choices: ${argument.argChoices.map((choice) => JSON.stringify(choice)).join(', ')}`);
    }
    if (argument.defaultValue !== undefined) {
      extraInfo.push(`default: ${argument.defaultValueDescription || JSON.stringify(argument.defaultValue)}`);
    }
    if (extraInfo.length > 0) {
      const extraDescripton = `(${extraInfo.join(', ')})`;
      if (argument.description) {
        return `${argument.description} ${extraDescripton}`;
      }
      return extraDescripton;
    }
    return argument.description;
  }

  /**
   * Generate the built-in help text.
   *
   * @param {Command} cmd
   * @param {Help} helper
   * @returns {string}
   */

  formatHelp(cmd, helper) {
    const termWidth = helper.padWidth(cmd, helper);
    const helpWidth = helper.helpWidth || 80;
    const itemIndentWidth = 2;
    const itemSeparatorWidth = 2; // between term and description
    function formatItem(term, description) {
      if (description) {
        const fullText = `${term.padEnd(termWidth + itemSeparatorWidth)}${description}`;
        return helper.wrap(fullText, helpWidth - itemIndentWidth, termWidth + itemSeparatorWidth);
      }
      return term;
    }
    function formatList(textArray) {
      return textArray.join('\n').replace(/^/gm, ' '.repeat(itemIndentWidth));
    }

    // Usage
    let output = [`Usage: ${helper.commandUsage(cmd)}`, ''];

    // Description
    const commandDescription = helper.commandDescription(cmd);
    if (commandDescription.length > 0) {
      output = output.concat([commandDescription, '']);
    }

    // Arguments
    const argumentList = helper.visibleArguments(cmd).map((argument) => {
      return formatItem(helper.argumentTerm(argument), helper.argumentDescription(argument));
    });
    if (argumentList.length > 0) {
      output = output.concat(['Arguments:', formatList(argumentList), '']);
    }

    // Options
    const optionList = helper.visibleOptions(cmd).map((option) => {
      return formatItem(helper.optionTerm(option), helper.optionDescription(option));
    });
    if (optionList.length > 0) {
      output = output.concat(['Options:', formatList(optionList), '']);
    }

    // Commands
    const commandList = helper.visibleCommands(cmd).map((cmd) => {
      return formatItem(helper.subcommandTerm(cmd), helper.subcommandDescription(cmd));
    });
    if (commandList.length > 0) {
      output = output.concat(['Commands:', formatList(commandList), '']);
    }

    return output.join('\n');
  }

  /**
   * Calculate the pad width from the maximum term length.
   *
   * @param {Command} cmd
   * @param {Help} helper
   * @returns {number}
   */

  padWidth(cmd, helper) {
    return Math.max(
      helper.longestOptionTermLength(cmd, helper),
      helper.longestSubcommandTermLength(cmd, helper),
      helper.longestArgumentTermLength(cmd, helper)
    );
  }

  /**
   * Wrap the given string to width characters per line, with lines after the first indented.
   * Do not wrap if insufficient room for wrapping (minColumnWidth), or string is manually formatted.
   *
   * @param {string} str
   * @param {number} width
   * @param {number} indent
   * @param {number} [minColumnWidth=40]
   * @return {string}
   *
   */

  wrap(str, width, indent, minColumnWidth = 40) {
    // Detect manually wrapped and indented strings by searching for line breaks
    // followed by multiple spaces/tabs.
    if (str.match(/[\n]\s+/)) return str;
    // Do not wrap if not enough room for a wrapped column of text (as could end up with a word per line).
    const columnWidth = width - indent;
    if (columnWidth < minColumnWidth) return str;

    const leadingStr = str.substr(0, indent);
    const columnText = str.substr(indent);

    const indentString = ' '.repeat(indent);
    const regex = new RegExp('.{1,' + (columnWidth - 1) + '}([\\s\u200B]|$)|[^\\s\u200B]+?([\\s\u200B]|$)', 'g');
    const lines = columnText.match(regex) || [];
    return leadingStr + lines.map((line, i) => {
      if (line.slice(-1) === '\n') {
        line = line.slice(0, line.length - 1);
      }
      return ((i > 0) ? indentString : '') + line.trimRight();
    }).join('\n');
  }
}

exports.Help = Help;


/***/ }),

/***/ "./node_modules/commander/lib/option.js":
/*!**********************************************!*\
  !*** ./node_modules/commander/lib/option.js ***!
  \**********************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

const { InvalidArgumentError } = __webpack_require__(/*! ./error.js */ "./node_modules/commander/lib/error.js");

// @ts-check

class Option {
  /**
   * Initialize a new `Option` with the given `flags` and `description`.
   *
   * @param {string} flags
   * @param {string} [description]
   */

  constructor(flags, description) {
    this.flags = flags;
    this.description = description || '';

    this.required = flags.includes('<'); // A value must be supplied when the option is specified.
    this.optional = flags.includes('['); // A value is optional when the option is specified.
    // variadic test ignores <value,...> et al which might be used to describe custom splitting of single argument
    this.variadic = /\w\.\.\.[>\]]$/.test(flags); // The option can take multiple values.
    this.mandatory = false; // The option must have a value after parsing, which usually means it must be specified on command line.
    const optionFlags = splitOptionFlags(flags);
    this.short = optionFlags.shortFlag;
    this.long = optionFlags.longFlag;
    this.negate = false;
    if (this.long) {
      this.negate = this.long.startsWith('--no-');
    }
    this.defaultValue = undefined;
    this.defaultValueDescription = undefined;
    this.presetArg = undefined;
    this.envVar = undefined;
    this.parseArg = undefined;
    this.hidden = false;
    this.argChoices = undefined;
    this.conflictsWith = [];
  }

  /**
   * Set the default value, and optionally supply the description to be displayed in the help.
   *
   * @param {any} value
   * @param {string} [description]
   * @return {Option}
   */

  default(value, description) {
    this.defaultValue = value;
    this.defaultValueDescription = description;
    return this;
  }

  /**
   * Preset to use when option used without option-argument, especially optional but also boolean and negated.
   * The custom processing (parseArg) is called.
   *
   * @example
   * new Option('--color').default('GREYSCALE').preset('RGB');
   * new Option('--donate [amount]').preset('20').argParser(parseFloat);
   *
   * @param {any} arg
   * @return {Option}
   */

  preset(arg) {
    this.presetArg = arg;
    return this;
  }

  /**
   * Add option name(s) that conflict with this option.
   * An error will be displayed if conflicting options are found during parsing.
   *
   * @example
   * new Option('--rgb').conflicts('cmyk');
   * new Option('--js').conflicts(['ts', 'jsx']);
   *
   * @param {string | string[]} names
   * @return {Option}
   */

  conflicts(names) {
    this.conflictsWith = this.conflictsWith.concat(names);
    return this;
  }

  /**
   * Set environment variable to check for option value.
   * Priority order of option values is default < env < cli
   *
   * @param {string} name
   * @return {Option}
   */

  env(name) {
    this.envVar = name;
    return this;
  }

  /**
   * Set the custom handler for processing CLI option arguments into option values.
   *
   * @param {Function} [fn]
   * @return {Option}
   */

  argParser(fn) {
    this.parseArg = fn;
    return this;
  }

  /**
   * Whether the option is mandatory and must have a value after parsing.
   *
   * @param {boolean} [mandatory=true]
   * @return {Option}
   */

  makeOptionMandatory(mandatory = true) {
    this.mandatory = !!mandatory;
    return this;
  }

  /**
   * Hide option in help.
   *
   * @param {boolean} [hide=true]
   * @return {Option}
   */

  hideHelp(hide = true) {
    this.hidden = !!hide;
    return this;
  }

  /**
   * @api private
   */

  _concatValue(value, previous) {
    if (previous === this.defaultValue || !Array.isArray(previous)) {
      return [value];
    }

    return previous.concat(value);
  }

  /**
   * Only allow option value to be one of choices.
   *
   * @param {string[]} values
   * @return {Option}
   */

  choices(values) {
    this.argChoices = values.slice();
    this.parseArg = (arg, previous) => {
      if (!this.argChoices.includes(arg)) {
        throw new InvalidArgumentError(`Allowed choices are ${this.argChoices.join(', ')}.`);
      }
      if (this.variadic) {
        return this._concatValue(arg, previous);
      }
      return arg;
    };
    return this;
  }

  /**
   * Return option name.
   *
   * @return {string}
   */

  name() {
    if (this.long) {
      return this.long.replace(/^--/, '');
    }
    return this.short.replace(/^-/, '');
  }

  /**
   * Return option name, in a camelcase format that can be used
   * as a object attribute key.
   *
   * @return {string}
   * @api private
   */

  attributeName() {
    return camelcase(this.name().replace(/^no-/, ''));
  }

  /**
   * Check if `arg` matches the short or long flag.
   *
   * @param {string} arg
   * @return {boolean}
   * @api private
   */

  is(arg) {
    return this.short === arg || this.long === arg;
  }

  /**
   * Return whether a boolean option.
   *
   * Options are one of boolean, negated, required argument, or optional argument.
   *
   * @return {boolean}
   * @api private
   */

  isBoolean() {
    return !this.required && !this.optional && !this.negate;
  }
}

/**
 * Convert string from kebab-case to camelCase.
 *
 * @param {string} str
 * @return {string}
 * @api private
 */

function camelcase(str) {
  return str.split('-').reduce((str, word) => {
    return str + word[0].toUpperCase() + word.slice(1);
  });
}

/**
 * Split the short and long flag out of something like '-m,--mixed <value>'
 *
 * @api private
 */

function splitOptionFlags(flags) {
  let shortFlag;
  let longFlag;
  // Use original very loose parsing to maintain backwards compatibility for now,
  // which allowed for example unintended `-sw, --short-word` [sic].
  const flagParts = flags.split(/[ |,]+/);
  if (flagParts.length > 1 && !/^[[<]/.test(flagParts[1])) shortFlag = flagParts.shift();
  longFlag = flagParts.shift();
  // Add support for lone short flag without significantly changing parsing!
  if (!shortFlag && /^-[^-]$/.test(longFlag)) {
    shortFlag = longFlag;
    longFlag = undefined;
  }
  return { shortFlag, longFlag };
}

exports.Option = Option;
exports.splitOptionFlags = splitOptionFlags;


/***/ }),

/***/ "./node_modules/commander/lib/suggestSimilar.js":
/*!******************************************************!*\
  !*** ./node_modules/commander/lib/suggestSimilar.js ***!
  \******************************************************/
/***/ ((__unused_webpack_module, exports) => {

const maxDistance = 3;

function editDistance(a, b) {
  // https://en.wikipedia.org/wiki/Damerau–Levenshtein_distance
  // Calculating optimal string alignment distance, no substring is edited more than once.
  // (Simple implementation.)

  // Quick early exit, return worst case.
  if (Math.abs(a.length - b.length) > maxDistance) return Math.max(a.length, b.length);

  // distance between prefix substrings of a and b
  const d = [];

  // pure deletions turn a into empty string
  for (let i = 0; i <= a.length; i++) {
    d[i] = [i];
  }
  // pure insertions turn empty string into b
  for (let j = 0; j <= b.length; j++) {
    d[0][j] = j;
  }

  // fill matrix
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      let cost = 1;
      if (a[i - 1] === b[j - 1]) {
        cost = 0;
      } else {
        cost = 1;
      }
      d[i][j] = Math.min(
        d[i - 1][j] + 1, // deletion
        d[i][j - 1] + 1, // insertion
        d[i - 1][j - 1] + cost // substitution
      );
      // transposition
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }

  return d[a.length][b.length];
}

/**
 * Find close matches, restricted to same number of edits.
 *
 * @param {string} word
 * @param {string[]} candidates
 * @returns {string}
 */

function suggestSimilar(word, candidates) {
  if (!candidates || candidates.length === 0) return '';
  // remove possible duplicates
  candidates = Array.from(new Set(candidates));

  const searchingOptions = word.startsWith('--');
  if (searchingOptions) {
    word = word.slice(2);
    candidates = candidates.map(candidate => candidate.slice(2));
  }

  let similar = [];
  let bestDistance = maxDistance;
  const minSimilarity = 0.4;
  candidates.forEach((candidate) => {
    if (candidate.length <= 1) return; // no one character guesses

    const distance = editDistance(word, candidate);
    const length = Math.max(word.length, candidate.length);
    const similarity = (length - distance) / length;
    if (similarity > minSimilarity) {
      if (distance < bestDistance) {
        // better edit distance, throw away previous worse matches
        bestDistance = distance;
        similar = [candidate];
      } else if (distance === bestDistance) {
        similar.push(candidate);
      }
    }
  });

  similar.sort((a, b) => a.localeCompare(b));
  if (searchingOptions) {
    similar = similar.map(candidate => `--${candidate}`);
  }

  if (similar.length > 1) {
    return `\n(Did you mean one of ${similar.join(', ')}?)`;
  }
  if (similar.length === 1) {
    return `\n(Did you mean ${similar[0]}?)`;
  }
  return '';
}

exports.suggestSimilar = suggestSimilar;


/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
(() => {
var exports = __webpack_exports__;
/*!**********************!*\
  !*** ./lib/index.js ***!
  \**********************/
const {
  program,
  configureProgram,
  configureCommands
} = __webpack_require__(/*! ./program */ "./lib/program/index.js");

const {
  Stats
} = __webpack_require__(/*! ./stats */ "./lib/stats/index.js");

exports.handleHomeRelative = __webpack_require__(/*! ./handleHomeRelative */ "./lib/handleHomeRelative.js");
exports.JSONReader = __webpack_require__(/*! ./reader/JSONReader */ "./lib/reader/JSONReader.js");
exports.dirScanner = __webpack_require__(/*! ./reader/dirScanner */ "./lib/reader/dirScanner.js");
exports.qidoFilter = __webpack_require__(/*! ./qidoFilter */ "./lib/qidoFilter.js");
exports.loadConfiguration = __webpack_require__(/*! ./loadConfiguration */ "./lib/loadConfiguration.js");
exports.aeConfig = __webpack_require__(/*! ./aeConfig */ "./lib/aeConfig.js");
exports.staticWadoConfig = __webpack_require__(/*! ./staticWadoConfig */ "./lib/staticWadoConfig.js");
exports.assertions = __webpack_require__(/*! ./assertions */ "./lib/assertions/index.js");
exports.configDiff = __webpack_require__(/*! ./update/configDiff */ "./lib/update/configDiff.js");
exports.configGroup = __webpack_require__(/*! ./configGroup.js */ "./lib/configGroup.js");
exports.updateConfiguration = __webpack_require__(/*! ./update/updateConfiguration */ "./lib/update/updateConfiguration.js");
exports.configureProgram = configureProgram;
exports.configureCommands = configureCommands;
exports.program = program;
exports.Stats = Stats;
})();

/******/ 	return __webpack_exports__;
/******/ })()
;
});
//# sourceMappingURL=index.umd.js.map