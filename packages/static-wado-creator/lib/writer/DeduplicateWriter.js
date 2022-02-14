const zlib = require('zlib');
const hashFactory = require('node-object-hash');
const hasher = hashFactory();
const fs = require('fs')
const path = require('path');
const JSONWriter = require('../../lib/writer/JSONWriter');
const Tags = require('../../lib/dictionary/Tags');
const TagLists = require('../../lib/model/TagLists');

const writeDeduplicatedFile = async (dir, data, hashValue) => {
    if( !hashValue ) hashValue = hasher.hash(data);
    // Write it direct in the deduplicated directory, not as a sub-directory or index file
    await JSONWriter(dir, hashValue, data, {gzip:true, index: false });
    return hashValue;
}


const perInstanceWriter = async (id, data) => {
    const { deduplicatedInstancesPath } = id;
    const hashValue = TagLists.addHash(data,Tags.InstanceType);
    return await writeDeduplicatedFile(deduplicatedInstancesPath, [data], hashValue);
};

/** Writes out JSON files to the given file name.  Automatically GZips them, and adds the extension */
const DeduplicateWriter = options =>
    async function (id, data) {
        const studyData = await this.completeStudy.getCurrentStudyData(this,id);
        
        if( options.isDeduplicate ) {
            await perInstanceWriter(id,data);
        }
        studyData.addDeduplicated(data);
    };

module.exports = DeduplicateWriter;
