const dataDictionary = require('./dataDictionary')

const Tags = {
    // Raw tags have the x before them, not parsed yet
    RawMinTag: 'x00000000',
    RawFirstBodyTag: 'x00080000',
    RawTransferSyntaxUID: 'x00020010',
    
    // This one isn't defined in the dataDictionary
    AvailableTransferSyntaxUID: '00083002',
    
    // TODO - make this actually work as a real deduplicated object with different creators/lookups.
    DeduppedCreator: "dedupped",
    // Creator tag value
    DeduppedTag: '00090010',

    // The references to extract data included in this object, 1..n values
    DeduppedRef: '00091010',

    // The hash value of THIS object
    DeduppedHash: '00091011',
    
    // Type of hash instance
    DeduppedType: '00091012',
    InstanceType: 'instance',
    InfoType: 'info',
};

Object.keys(dataDictionary).forEach(key => {
    const value = dataDictionary[key];
    Tags[value.name] = key;
});


module.exports = Tags;