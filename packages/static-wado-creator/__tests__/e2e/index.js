const fs = require('fs');
const path = require('path');
const assert = require('assert');
const {execSync } = require("child_process");
const StaticWado = require('../../lib');
const deleteDir = require('../../lib/util/deleteDir');

const TEST_DATA_PATH = path.resolve(__dirname, '../../../../testdata');

// same level at package folder
const outputDir = './tmp/dicomweb';
const junoDir = `${outputDir}/studies/1.2.840.113619.2.5.1762583153.215519.978957063.78`
const junoSeriesDir = `${junoDir}/series/1.2.840.113619.2.5.1762583153.215519.978957063.121`
const junoInstancesDir = `${junoSeriesDir}/instances/1.2.840.113619.2.5.1762583153.215519.978957063.122`

const junoStudiesFile = `${junoDir}/index.json.gz`
const junoSeriesFile = `${junoDir}/series/index.json.gz`
const junoInstancesFile = `${junoSeriesDir}/instances/index.json.gz`
const junoFramesFile = `${junoInstancesDir}/frames/1.gz`


describe('index', () => {

    const processes = {};

    const importer = new StaticWado({
        isStudyData: true,
        isGroup: true,
    });

    function assertExists(fileOrDir, exists = true) {
      assert.equal(fs.existsSync(fileOrDir), exists);
    }

    before(async() => {
        await deleteDir(outputDir, true);
        fs.mkdirSync(outputDir, {recursive: true})

        assertExists(outputDir, true);

        console.log('Created directory', outputDir, fs.existsSync(outputDir));
    })

    const createJuno = () => {
        if( processes.createJuno ) return;
        execSync(`node bin/mkdicomweb.js -o ${outputDir} ${TEST_DATA_PATH}/dcm/MisterMr/1.2.840.113619.2.5.1762583153.215519.978957063.122`, (error, stdout, stderr) => {
            if (error) {
                console.log(`error: ${error.message}`);
                return;
            }
            if (stderr) {
                console.log(`stderr: ${stderr}`);
                return;
            }
            console.log(`stdout: ${stdout}`);
        });
        processes.createJuno = true;
    }

    it('basic exists test', async () => {
        createJuno();
        
        assertExists(junoDir);
        assertExists(junoStudiesFile);
        assertExists(junoSeriesFile);
        assertExists(junoInstancesFile);
        assertExists(junoFramesFile);
    })
})