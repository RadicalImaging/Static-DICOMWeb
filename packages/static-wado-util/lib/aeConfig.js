const { ConfigPoint } = require("config-point");

const { aeConfig } = ConfigPoint.register({
  aeConfig: {
    dcmqrscp: {
      description: "A test AE configuration for sending queries to dcmqrscp",
      host: "localhost",
      port: 11113,
    },
  },
});

module.exports = aeConfig;
