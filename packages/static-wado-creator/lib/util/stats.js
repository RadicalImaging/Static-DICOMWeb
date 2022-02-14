class Stats {
  stats = {};

  constructor(name, description, parent) {
    this.name = name;
    this.description = description;
    this.parent = parent;
    Stats[name] = this;
  }

  add(item, description, messageCount = 250) {
    if (!this.stats[item]) {
      this.stats[item] = 0;
    }
    this.stats[item]++;
    if (messageCount && this.stats[item] % messageCount == 0) {
      console.log(item, this.stats[item], description);
    }
    if (this.parent) this.parent.add(item, description, 0);
  }

  summarize(msg) {
    console.log(msg);
    console.log(this.description);
    Object.keys(this.stats).forEach((key) => {
      console.log(key, this.stats[key]);
    });
    this.reset();
  }

  reset() {
    this.stats = {};
  }
}

module.exports = Stats;
