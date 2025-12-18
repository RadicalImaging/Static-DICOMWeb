function configGroup(config, name, options = {}) {
  if (!config[`${name}Group`]) return;
  const group = { ...config[`${name}Group`] };
  const dir = group.dir || group[`${name}Dir`] || config[`${name}Dir`];
  if (!dir) {
    throw new Error(`Must supply configuration ${name}Dir in ${config}`);
  }
  Object.defineProperty(group, 'dir', { value: dir });
  Object.defineProperty(group, 'name', { value: name });
  if (!group.region) {
    // Set the region at the overall level
    group.region = config.region;
  }
  if (options?.bucket) {
    group.Bucket = options.bucket;
  }
  if (options?.region) {
    group.region = options.region;
  }
  return group;
}

module.exports = configGroup;
