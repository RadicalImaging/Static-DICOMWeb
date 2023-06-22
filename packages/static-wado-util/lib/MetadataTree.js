const Tags = require("./dictionary/Tags");
const lodash = require("lodash");

const isSingleton = attribute => {
  return Tags.singletons.has(attribute);
}

const PER_FRAME = 'perFrame';
const COMPUTED = 'computed';

const isSimple = v => {
  if( Array.isArray(v) ) {
    return v.every(item => !item || (typeof item)!=='object');
  }
  return !v || (typeof v)!=='object';
}


const isNumeric = v => {
  if( Array.isArray(v) ) {
    return v.every(item => typeof item ==='number');
  }
  return typeof v === 'number';
};

const EPSILON = 1e-3;

const computeLinear = (v1,v2) => {
  if( Array.isArray(v1) ) {
    return v1.map( (v1Value, i) => computeLinear(v1Value,v2[i]));
  }
  const delta = v2-v1;
  if( delta===0 ) return { f: () => v1, str: v1 };
  return {
    f: ({_frame}) => v1+_frame*delta,
    str: `${v1}+_frame*${delta}`,
  };
};

const compareLinear = (linear, v, props) => {
  if( Array.isArray(linear) ) {
    return linear.every((linearItem, index) => compareLinear(linearItem, v[index], props));
  }
  const computedV = linear.f(props);
  // if( Math.abs(v-computedV) >= EPSILON ) {
  //   console.log("compareLinear not same", linear, v, computedV);
  // }
  return Math.abs(v-computedV) < EPSILON;
  };

const createSequentialKey = key => {
  if( typeof key !=='string' ) return key;
  const split = key.split(',');
  if( split.length<2 ) return;
  let last = Number(split[0]);
  let first = last;
  const newKey = [first];
  for(let i=1; i<split.length; i++) {
    const current = Number(split[i]);
    if( current===last+1 ) {
      last = current;
      newKey[newKey.length-1] = `${first}...${last}`;
      continue;
    }
    last = current;
    first = current;
    newKey[newKey.length] = current;
  }
  if( newKey.length===split.length ) return;
  return newKey.join(',');
};

/**
 * Creates a metadata tree object
 * This is an object that has a patient/study/series/display sets instances.
 * It also has a dictionary instance used for private tags.
 * The basic structure is:
 * 
 * patient - contains the patient level attributes
 *   * studies - contains an array of studies (typical 1)
 *     * series - contains series QIDO information plus an array of instances
 *       * displaySets - contains an array of display sets
 * 
 */

class MetadataTree {
  static ValueTypes = {
    COMPUTED, PER_FRAME,
  };

  static LEVELS = [
    // Patient
    {
      attribute: 'patient',
      key: null,
      attributes: ['PatientName', 'PatientID', "PatientSex", "OtherPatientIDsSequence", "IssuerOfPatientID", "PatientBirthDateTime"],
    },

    // Studies - typically only one
    {
      attribute: '_studies',
      key: 'StudyInstanceUID',
      attributes: ['StudyInstanceUID', 'StudyDescription', "StudyDateTime", "StudyID", "AccessionNumber", "RETIRED_StudyComments", "ReferringPhysicianName"],
    },

    // Series
    {
      attribute: '_series',
      key: 'SeriesInstanceUID',
      attributes: ['SeriesInstanceUID', 'SeriesDescription', "SeriesNumber", "SeriesDateTime", "Modality", "StationName", "Manufacturer"],
    },

    // Below series is display sets
    {
      attribute: '_displaySets',
      key: '_displaySetUID',
      attributes: ['_displaySetUID'],
    }
  ]

  static copyAttributes(instance,attributes) {
      const ret = {};
      for(const attribute of attributes) {
          if( attribute in instance ) {
              ret[attribute] = instance[attribute];
              delete instance[attribute];
          }
      }
      return ret;
  }

  // TODO - update this to include vr information globally as a singleton
  static removeVrMap(natural) {
    if( Array.isArray(natural) ) {
      natural.forEach(MetadataTree.removeVrMap);
      return;
    }
    if( !natural || typeof natural !== 'object' ) return;
    delete natural._vrMap;
    delete natural.PixelData;
    delete natural["00091010"];
    delete natural["00091011"];
    Object.values(natural).forEach(MetadataTree.removeVrMap);
  }

  static singletons(natural) {
    if( Array.isArray(natural) ) {
      natural.forEach(MetadataTree.singletons);
      return;
    }
    if( !natural || typeof natural !== 'object' ) return;
    delete natural._vrMap;
    for(const attribute of Object.keys(natural)) {
      const value = natural[attribute];
      if( Array.isArray(value) ) {
        if( value.length===1 && isSingleton(attribute) ) {
          natural[attribute] = value[0];
          MetadataTree.singletons(natural[attribute]);
        } else {
          natural[attribute] = [...value];
          MetadataTree.singletons(natural[attribute]);
        }
      } else if( typeof value === 'object') {
        MetadataTree.singletons(value);
      }
    }
  }

  static combineDateTime(natural) {
    for(const attribute of Object.keys(natural) ) {
      if( attribute.length<=4 || attribute.substring(attribute.length-4,attribute.length)!=='Date' ) {
        continue;
      }

      const date = natural[attribute];
      const timeName = attribute.substring(0,attribute.length-4)+'Time';
      const time = natural[timeName] || '';
      natural[attribute+'Time'] = `${date} ${time}`;
      delete natural[attribute];
      delete natural[timeName];
    }
  }

  static naturalize(instance) {
    const natural = Tags.naturalizeDataset(instance);
    MetadataTree.removeVrMap(natural);
    this.combineDateTime(natural);
    this.singletons(natural);
    return natural;
  }

  /** Computes an exceptional value instead of a perFrame when lots of instances are repeated */
  static exceptionalValue(value) {
    const { value: frames } = value;
    if( frames.length < 10 ) return;
    if( frames.some(v => !isSimple(v)) ) return;
    const common = new Map();
    let _frame=0;
    let commonIndexValue = '';
    let commonIndex;
    for(const v of frames) {
      if( common.has(v) ) {
        const newIndex = `${common.get(v)},${_frame}`;
        common.set(v, newIndex);
        if( newIndex.length > commonIndexValue.length ) {
          commonIndex = v;
          commonIndexValue = newIndex;
        }
      } else {
        common.set(v,_frame);
      }
      if( common.size-1 > frames.length/10 ) return;
      _frame += 1;
    }
    common.delete(commonIndex);
    if( common.size === 0 ) return commonIndex;
    const exceptions = {};
    [...common.entries()].forEach(([v,key]) => {
      const sequentialKey = createSequentialKey(key) || key;
      exceptions[sequentialKey] = v;
    });
    return {
      type: COMPUTED,
      value: commonIndex,
      exceptions,
    };
  }

    /** Computes a linear value instead of a perFrame when the value can be computed
     * Only creates linear values of the form:
     *   "constant + scale * _frame"
     * or arrays of same.
     */
    static linearValue(value, props) {
      const { value: frames } = value;
      if( frames.length < 6 ) return;
      if( frames.some(v => !isNumeric(v)) ) {
        return;
      }
      const linear = computeLinear(frames[0], frames[1]);
      // TODO - get the display set value object
      if( !frames.every((it,_frame) => compareLinear(linear,it, { _frame}))) {
        return;
      }
      return {
        type: COMPUTED,
        computed: Array.isArray(linear) ? linear.map(it => it.str) : linear.str,
      };
    }

  static computedValue(value, props) {
    if( value===null || value===undefined || (typeof value) !== 'object' ) return;
    if( value.type !== PER_FRAME ) return;
    if( value.value.length < 6 ) return;
    if( Array.isArray(value.value[0]) ) {
      const length = value.value[0].length;
      if( value.value.every(it => it.length===length)) {
        const newValueList = [];
        let fastValues = 0;
        for(let i=0; i<length; i++) {
          const singleValue = {
            type: PER_FRAME,
            value: value.value.map(it => it[i]),
          };
          const computed = MetadataTree.computedValue(singleValue);
          if( computed!==undefined ) {
            fastValues += 1;
          }
          newValueList.push(computed || singleValue);
        }
        if( fastValues ) {
          return newValueList;
        }
      }
      return MetadataTree.exceptionalValue(value,props);
    }
    const exceptionalValue = MetadataTree.exceptionalValue(value, props);
    if( exceptionalValue ) {
      return exceptionalValue;
    }
    const linearValue = MetadataTree.linearValue(value, props);
    if( linearValue ) {
      return linearValue;
    }
  }
  static assignComputedDs(ds) {
    for(const tag of Object.keys(ds)) {
      const value = ds[tag];
      const computed = MetadataTree.computedValue(value, {tag, ds});
      if( computed ) {
        ds[tag] = computed;
      }
    }
  }

  constructor(json = undefined) {
      this.patient = json;
  }

  compareRemoveAttributes(source, instance, attributes) {
      const result = MetadataTree.copyAttributes(instance,attributes);
      // TODO - compare the source and result attributes
      return null;
  }

  create(instance, level) {
    if( level<0 ) return this;
    const levelInfo = MetadataTree.LEVELS[level];
    const parent = this.create(instance,level-1);
    const { attribute, key, attributes } = levelInfo;

    let value = key ? parent[attribute].find(it => it[key]===instance[key]) : parent[attribute];
    if( value ) {
      this.compareRemoveAttributes(value, instance, attributes);
      return value;
    }
    value = MetadataTree.copyAttributes(instance,attributes);
    if( key ) {
      parent[attribute].push(value);
    } else {
      parent[attribute] = value;
    }
    const childKey = MetadataTree.LEVELS[level+1]?.attribute;
    if( childKey ) {
      value[childKey] = [];
    }
    return value;
  }

  createDisplaySet(instance, displaySetKey) {
    instance._displaySetUID = displaySetKey;
    const value = this.create(instance,MetadataTree.LEVELS.length-1);
    if( value._frames===undefined ) value._frames = 0;
    return value;
  }

  // Adds the instance multiframe information
  addMultiframe(displaySet, instance) {
    const { NumberOfFrames=1, PerFrameFunctionalGroupsSequence, SharedFunctionalGroupsSequence } = instance;
    delete instance.PerFrameFunctionalGroupsSequence;
    delete instance.SharedFunctionalGroupsSequence;
    for(let i=0; i<NumberOfFrames; i++) {
      const keys = new Set();
      const copyInstance = {...instance, frameNumber: i+1};
      this.addFrame(displaySet, copyInstance, keys);
      if( SharedFunctionalGroupsSequence ) {
        const frameData = SharedFunctionalGroupsSequence;
        for(const keySet of Object.keys(frameData)) {
          const item = frameData[keySet][0] || frameData[keySet];
          this.addFrame(displaySet,item, keys);
        }
      }
      if( PerFrameFunctionalGroupsSequence ) {
        const frameData = PerFrameFunctionalGroupsSequence[i];
        if( !frameData ) { 
          console.warn("Frame data is null for", i);
        }
        for(const keySet of Object.keys(frameData)) {
          const item = frameData[keySet][0] || frameData[keySet];
          this.addFrame(displaySet,item, keys);
        }
      }
      this.updateMissing(displaySet, keys);
    }
  }

  /**
   * Adds a naturalized dataset instance to the metadata tree.  
   * Default key is the series instance UID
   */
  add(instance, displaySetKey = instance.SeriesInstanceUID) {
      const displaySet = this.createDisplaySet(instance, displaySetKey);
      const { NumberOfFrames=1, PerFrameFunctionalGroupsSequence } = instance;
      if( NumberOfFrames>1 || PerFrameFunctionalGroupsSequence ) {
        this.addMultiframe(displaySet, instance);
        return;
      }
      const keys = new Set();
      this.addFrame(displaySet, instance, keys);
      this.updateMissing(displaySet, keys);
  }

  updateMissing(displaySet, keys) {
    for(const attribute of Object.keys(displaySet)) {
      // Skip already set values and internals
      if( keys.has(attribute) || attribute[0]==='_' ) continue;
      this.addKey(displaySet, attribute, undefined);
    }
    displaySet._frames += 1;
  }

  /** Adds all keys from data into the display set */
  addFrame(displaySet, data, keys) {
    if( !data ) return;
    for(const attribute of Object.keys(data) ) {
      if( attribute[0]==='_') continue;
      this.addKey(displaySet, attribute, data[attribute]);
      keys.add(attribute);
    }
  }

  addKey(dest, key, value) {
      const current = dest[key];
      if( lodash.isEqual(current,value) ) return;
      if( dest[key]===undefined && dest._frames===0 ) {
          dest[key]=value;
          return;
      }
      if( !current ) {
          dest[key] = { type: PER_FRAME, value: [] };
      } else if( current.type!==PER_FRAME ) {
          const sameValue = [];
          for(let i=0; i<dest._frames; i++) sameValue.push(current);
          dest[key] = { type: PER_FRAME, value: sameValue };
      }
      dest[key].value[dest._frames] = value;
  }

  getStudy(studyUID) {
    if( !this.patient ) return null;
    return this.patient._studies.find(it => it.StudyInstanceUID===studyUID);
  }

  getSeries(studyUID, seriesUID) {
    const study = this.getStudy(studyUID);
    return study ? study._series.find(it=>it.SeriesInstanceUID===seriesUID) : null;
  }

  getDisplaySet(studyUID, seriesUID, displaySetKey=seriesUID) {
    const series = this.getSeries(studyUID, seriesUID);
    return series ? series._displaySets.find(it=>it._displaySetUID===displaySetKey) : null;
  }

  /** Goes through all the display sets and assigns computed values where applicable.
   * computed values are structures that include exception and/or linear computed values.
   * The structure looks like:
   * {
   *   type: 'computed',
   *   value: <non-computed value - for exceptional purposes>
   *   exceptions?: {
   *   },
   *   computed: "javascript simple expression including frameNumber"(or array of same)
   * }
   * 
   * Simple expressions can include:
   *   1. Quoted strings and numbers, including the _ separator in numbers and exponent notation
   *   2. Basic operators:  *+-/
   *   3. Comparators: < > ===  <= >= !==
   *   4. Question operators: && || ?: ??
   *   5. Reference to other values - eg _frame (note zero based)
   *   6. Dereference operator [] to get child elements (eg for sequences)
   * This function looks for simple linear functions based on having at least 10 elements.
   * 
   * exceptions can include:
   *   Simple keys, eg  "5": <value>  to replace a singleton
   *   Comma separated keys, eg "5,25,45": <value> to replace multiple values
   *   Ranges, eg "5...25": <value>
   *   Comma separated simple and range keys, eg "5...25,100...125": <value>
   *   The <value> can be simple or computed itself
   * This function ONLY generates simple exceptions with a basic value
   */
  assignComputed() {
    if( !this.patient ) return;
    for(const study of this.patient._studies) {
      for(const series of study._series) {
        for( const ds of series._displaySets) {
          MetadataTree.assignComputedDs(ds);
        }
      }
    }
  }
}

module.exports = MetadataTree;