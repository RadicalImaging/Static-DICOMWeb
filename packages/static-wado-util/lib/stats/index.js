class Stats {
  constructor(name, description, parent) {
    this.stats = {};
    this.name = name;
    this.description = description;
    this.parent = parent;
    Stats[name] = this;
  }

  add(item, description, messageCount = 250) {
    if (!this.stats[item]) {
      this.stats[item] = 0;
    }
    this.stats[item] += 1;
    if (messageCount && this.stats[item] % messageCount == 0) {
      console.log(item, this.stats[item], description);
    }
    if (this.parent) this.parent.add(item, description, 0);
  }

  summarize(msg = "") {
    console.log(msg, this.description);
    Object.keys(this.stats).forEach((key) => {
      console.log(key, this.stats[key]);
    });
    this.reset();
  }

  reset() {
    this.stats = {};
  }
}

const OverallStats = new Stats("OverallStats", "Overall statistics");
const StudyStats = new Stats("StudyStats", "Study Generation", OverallStats);
const BufferStats = new Stats("BufferStats", "Buffer Statistics", StudyStats);

exports.Stats = {
  OverallStats,
  StudyStats,
  BufferStats,
};
