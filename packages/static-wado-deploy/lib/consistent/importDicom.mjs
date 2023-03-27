import {execFileSync} from "node:child_process";

import DeployGroup from "../DeployGroup.mjs";

export default async function importDicom(config, deployment, studyUID, options) {
  const deployer = new DeployGroup(config, "root", options, config.deployPlugin);

  console.log("deploy=", deployer);

  const directory = `c:/users/wayfa/dicomweb/instances/${studyUID}`;
  debugger;
  const args = ['instance', directory];
  if( options.delete ) args.push('--delete');

  const output = execFileSync('mkdicomweb',args);

  console.log(output);
}