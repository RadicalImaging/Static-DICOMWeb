const fs = require('fs')
const path = require('path')
const assert = require('assert');
const asyncIteratorToBuffer = require('../../lib/operation/adapter/asyncIterableToBuffer')

const TEST_DATA_PATH = path.resolve(__dirname, '../../../../testdata');
describe('asyncIterableToBuffer', () => {
    let dicomp10stream

    beforeEach(async() => {
        dicomp10stream = fs.createReadStream(`${TEST_DATA_PATH}/dcm/Juno/1.3.6.1.4.1.25403.345050719074.3824.20170125113606.8`);
    })

    it('copies child elements correctly', async () => {
        const buffer = await asyncIteratorToBuffer(dicomp10stream);
        const dest = new Uint8Array(132);
        // D character in DICM prefix
        assert.equal(buffer[128],68);
        buffer.copy(dest,0,0,132);
        // Should have copied
        assert.equal(dest[128],buffer[128]);  
    })

    it('re-assembles buffers correctly', async () => {
        const buffer = await asyncIteratorToBuffer(dicomp10stream);
        const start = 3215+8;
        const len = 526728-start;
        
        console.log('Slice buffer test')
        const subBuffer = buffer.slice(start,start+len);
        for(let i=0; i<len; i++) {
            const bufVal = buffer[i+start];
            const subVal = subBuffer[i];
            if( bufVal!=subVal ) {
                console.log(`At position ${i} relative to ${start} buffer is ${bufVal} but subVal is ${subVal}`)
            }
            assert.equal(buffer[i+start], subBuffer[i]);
        }
    })

})
