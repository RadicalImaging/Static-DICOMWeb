function configGroup(config, name) {
  const group = { ...config[`${name}Group`] };
  const dir = config[`${name}Dir`];
  console.log("dir for", name, dir);
  Object.defineProperty(group, "dir", { value: dir });
  Object.defineProperty(group, "name", { value: name });
  if (!group.region) {
    // Set the region at the overall level
    group.region = config.region;
  }
  console.log("Group region is", group, group.region, config);
  return group;
}

module.exports = configGroup;
