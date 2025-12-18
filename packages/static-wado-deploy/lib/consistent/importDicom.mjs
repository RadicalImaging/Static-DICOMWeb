import { execFileSync } from 'node:child_process';

import DeployGroup from '../DeployGroup.mjs';

export default async function importDicom(config, deployment, studyUID, options) {
  if (!deployment.part10Group) {
    console.verbose('Not uploading instances - no part10Group in ', deployment.name);
    return;
  }
  const deployer = new DeployGroup(deployment, 'part10', options, config.deployPlugin);

  const directory = `${deployer.baseDir}${deployer.group.path}/${studyUID}`;

  console.log('*************************************');
  console.log('Importing from', directory, deployer.group);

  // TODO - add deployment to mkdicomweb
  const args = ['mkdicomweb', 'instance', directory];
  if (options.delete) args.push('--delete');

  execFileSync(args.join(' '), { shell: true, stdio: 'inherit' });
}
