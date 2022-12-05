function configGroup(config, name) {
  const group = { ...config[`${name}Group`] };
  const dir = config[`${name}Dir`];
  Object.defineProperty(group, "dir", { value: dir });
  Object.defineProperty(group, "name", { value: name });
  if (!group.region) {
    // Set the region at the overall level
    group.region = config.region;
  }
  return group;
}

module.exports = configGroup;
