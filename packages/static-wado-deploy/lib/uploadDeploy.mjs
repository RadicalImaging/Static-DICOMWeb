import DeployGroup from "./DeployGroup.mjs";
import fs from "fs";
import { handleHomeRelative } from "@radicalimaging/static-wado-util";

export default async function uploadDeploy(directory, config, name, options, deployPlugin) {
  const deployer = new DeployGroup(config, name, options, deployPlugin);
  await deployer.loadOps();

  const contents = await deployer.dir(directory);

  const results = await deployer.store(directory, "", contents);

  if( options.resultFile) {
    fs.writeFileSync(options.resultFile, JSON.stringify(results,null,2));
    console.noQuiet("Wrote results to", options.resultFile);
  }
  if( options.deleteSuccessful || options.deleteFailure ) {
    const rootDir = handleHomeRelative(config.rootDir);
    for(const [key,value] of Object.entries(results) ) {
      const name = `${rootDir}/${key}`;
      if( options.deleteSuccessful && value ) {
        fs.unlinkSync(name);
      }
      if( options.deleteFailure && !value ) {
        fs.unlinkSync(name);
      }
    }
  }
  
  return results;
}
