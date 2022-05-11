function configGroup(config, name) {
  const group = { ...config[`${name}Group`] };
  const dir = config[`${name}Dir`];
  console.log("dir for", name, dir);
  Object.defineProperty(group, "dir", { value: dir });
  Object.defineProperty(group, "name", { value: name });
  return group;
}

module.exports = configGroup;
