const must = require("must");
const fs = require("fs");
const { Tags, MetadataTree, handleHomeRelative, JSONReader, JSONWriter } = require("../../lib/index");

const wsiDir = handleHomeRelative("~/dicomweb/studies/2.25.131863818722762760134835225297329585315/series/2.25.140300245501431478455798945677220756832");
const wsiPath = `${wsiDir}/metadata.gz`;

const singleframeDir = handleHomeRelative("~/dicomweb/studies/2.25.272843087945392307095009963699086894492/series/2.25.129179017661512444616317436127978675143");
const singleframePath = `${singleframeDir}/metadata.gz`;

const largeSingleframeDir = handleHomeRelative("~/dicomweb/studies/2.25.272843087945392307095009963699086894492/series");

const multiframeDir = handleHomeRelative("~/dicomweb/studies/1.2.840.113619.2.256.101318453960957.1359579472.2/series/1.2.840.113619.2.256.101318453960957.1359579472.3");
const multiframePath = `${multiframeDir}/metadata.gz`;

const series1 = {
  PatientName: "Bill",
  PatientID: "1",
  StudyInstanceUID: "1.1.1",
  StudyDescription: "Test Study",
  SeriesInstanceUID: "1.1.1.1",
  SeriesDescription: "Test Series 1",
};

const instance1 = {
  ...series1,
  SOPInstanceUID: '1.1.1.1.1',
};

const simpleMultiframe = {
  ...series1,
  SOPInstanceUID: '1.1.1.1.2',
  NumberOfFrames: 5,
};

const { StudyInstanceUID: studyUID, SeriesInstanceUID: seriesUID, PatientID: pid } = series1;

const sortInstances = json => {
  json.sort((a,b) => {
    const numberA = Number(a.InstanceNumber);
    const numberB = Number(b.InstanceNumber);
    if( numberA===numberB ) {
      return a.SOPInstanceUID < b.SOPInstanceUID ? 1 : -1;
    }
    return numberA>numberB ? 1 : -1;
  });
};

/** Returns the size of the data */
const sizeOf = data => {
  if( Array.isArray(data) ) {
    return data.reduce((prev,curr) => prev+sizeOf(curr), 2);
  }
  if( !data ) return 1;
  if( typeof data !=='object' ) return 1;
  return Object.entries(data).reduce( (prev,curr) => prev+sizeOf(curr[1])+1, 1);
  //return JSON.stringify(data).length;
}

jest.setTimeout(60_000);

describe("MetadataTree", () => {
  
  it("Creates a tree initially", () => {
    const tree = new MetadataTree();
    tree.add(instance1);
    must(tree.patient).not.be.undefined();
    must(tree.patient.PatientID).eql(pid);
    must(tree.getStudy(studyUID).StudyDescription).eql(series1.StudyDescription);
    must(tree.getSeries(studyUID, seriesUID).SeriesDescription).eql(series1.SeriesDescription);
    const displaySets = tree.getSeries(studyUID, seriesUID)._displaySets;
    must(displaySets.length).eql(1);
    const ds = displaySets[0];
    must(ds._frames).eql(1);
    must(ds.SOPInstanceUID).eql(instance1.SOPInstanceUID);
  });

  it("Creates simple multiframes", () => {
    const tree = new MetadataTree();
    tree.add(simpleMultiframe);
    must(tree.patient).not.be.undefined();
    must(tree.patient.PatientID).eql(pid);
    must(tree.getStudy(studyUID).StudyDescription).eql(series1.StudyDescription);
    must(tree.getSeries(studyUID, seriesUID).SeriesDescription).eql(series1.SeriesDescription);
    const displaySets = tree.getSeries(studyUID, seriesUID)._displaySets;
    must(displaySets.length).eql(1);
    const ds = displaySets[0];
    must(ds._frames).eql(5);
    must(ds.SOPInstanceUID).eql(simpleMultiframe.SOPInstanceUID);
    must(ds.frameNumber.type).eql("perFrame");
    must(ds.frameNumber.value).eql([1, 2, 3, 4, 5]);
  });

  it("Converts WSI Instance", async () => {
    if (!fs.existsSync(wsiPath)) {
      console.log("No WSI items defined, not creating");
      return;
    }
    const json = await JSONReader(wsiDir, "metadata.gz");
    const jsonSize = sizeOf(json);
    const ds = json.find(it => Tags.getValue(it,Tags.NumberOfFrames)===8);
    must(ds).not.be.undefined();
    const natural = MetadataTree.naturalize(ds);
    must(natural.NumberOfFrames).eql(8);
    const tree = new MetadataTree();
    tree.add(natural);
    const uncomputedSize = sizeOf(tree.patient);
    tree.assignComputed();
    const treeSize = sizeOf(tree.patient);
    console.log("Relative size WSI instance uncomputed, tree, orig", uncomputedSize, treeSize, jsonSize, "ratios", uncomputedSize/treeSize, jsonSize/treeSize);
    // console.log("Single tree", JSON.stringify(tree.patient,null,2));
  });

  it("Converts WSI Series", async () => {
    if (!fs.existsSync(wsiPath)) {
      console.log("No WSI items defined, not creating");
      return;
    }
    const json = await JSONReader(wsiDir, "metadata.gz");
    const jsonSize = sizeOf(json);
    const tree = new MetadataTree();
    for (const ds of json) {
      must(ds).not.be.undefined();
      const natural = MetadataTree.naturalize(ds);
      tree.add(natural, natural.SOPInstanceUID);
    }
    const uncomputedSize = sizeOf(tree.patient);
    tree.assignComputed();
    const treeSize = sizeOf(tree.patient);
    console.log("Relative size WSI series uncomputed, tree, orig", uncomputedSize, treeSize, jsonSize, "ratios", uncomputedSize/treeSize, jsonSize/treeSize);
    // console.log("Tree", JSON.stringify(tree.patient, null, 2));
    await JSONWriter(wsiDir, "metadataTree", tree.patient, { gzip: true, index: false });
  });

  it("Converts singleframe Image Series", async () => {
    if (!fs.existsSync(singleframePath)) {
      console.log("No singleframe items defined, not creating", singleframePath);
      return;
    }
    const json = await JSONReader(singleframeDir, "metadata.gz");
    const jsonSize = sizeOf(json);
    const tree = new MetadataTree();
    for (const ds of json) {
      must(ds).not.be.undefined();
      const natural = MetadataTree.naturalize(ds);
      tree.add(natural, natural.SeriesInstanceUID);
    }

    const uncomputedSize = sizeOf(tree.patient);
    tree.assignComputed();
    const treeSize = sizeOf(tree.patient);
    console.log("Relative size singleframe uncomputed, tree, orig", uncomputedSize, treeSize, jsonSize, "ratios", uncomputedSize/treeSize, jsonSize/treeSize);
    // console.log("Tree", JSON.stringify(tree.patient, null, 2));
    await JSONWriter(singleframeDir, "metadataTree", tree.patient, { gzip: true, index: false });
  });

  it("Converts multiframe Image Series", async () => {
    if (!fs.existsSync(multiframePath)) {
      console.log("No multiframe items defined, not creating", multiframePath);
      return;
    }
    const json = await JSONReader(multiframeDir, "metadata.gz");
    const jsonSize = sizeOf(json);
    const tree = new MetadataTree();
    for (const ds of json) {
      must(ds).not.be.undefined();
      const natural = MetadataTree.naturalize(ds);
      tree.add(natural, natural.SeriesInstanceUID);
    }
    const uncomputedSize = sizeOf(tree.patient);
    tree.assignComputed();
    const treeSize = sizeOf(tree.patient);
    console.log("Relative size multiframe tree uncomputed, tree, orig", uncomputedSize, treeSize, jsonSize, "ratios", uncomputedSize/treeSize, jsonSize/treeSize);
    // console.log("Tree", JSON.stringify(tree.patient, null, 2));
    await JSONWriter(multiframeDir, "metadataTree", tree.patient, { gzip: true, index: false });
  });

  it("Converts large singleframe study", async () => {
    if (!fs.existsSync(largeSingleframeDir)) {
      console.log("Large singleframe dir doesn't exist, not creating", largeSingleframeDir);
      return;
    }
    let jsonSize = 0;
    const tree = new MetadataTree();
    let seriesCount = 0;
    let instanceCount = 0;
    for (const entry of fs.readdirSync(largeSingleframeDir)) {
      const json = await JSONReader(`${largeSingleframeDir}/${entry}`, "metadata.gz", []);
      if (json.length === 0) continue;
      seriesCount++;
      jsonSize += sizeOf(json);
      const naturals = json.map(it => MetadataTree.naturalize(it));
      sortInstances(naturals);
      for (const natural of naturals) {
        tree.add(natural, natural.SeriesInstanceUID);
        instanceCount++;
      }
    }

    const uncomputedSize = sizeOf(tree.patient);
    tree.assignComputed();
    const treeStr = JSON.stringify(tree.patient);
    const treeSize = sizeOf(tree.patient);
    console.log("Relative size singleframe study tree uncomputed, tree, orig", uncomputedSize, treeSize, jsonSize, "ratios", uncomputedSize/treeSize, jsonSize/treeSize);
    console.log("Large singleframe series/instance count", seriesCount, instanceCount);
    // console.log("Tree", JSON.stringify(tree.patient, null, 2));
    await JSONWriter(largeSingleframeDir, "metadataTree", tree.patient, { gzip: true, index: false });

  });
});
