const { ConfigPoint } = require("config-point");

const { aeConfig } = ConfigPoint.register({
  aeConfig: {
    DICOMWEB: {
      description: "The static-wado SCU and SCP name by default",
      host: "localhost",
      port: 11112,
    },
    // Test configurations
    dcmqrscp: {
      description: "A test AE configuration for sending queries to dcmqrscp",
      host: "localhost",
      port: 11113,
    },
    CLEARCANVAS: {
      description: "Test ClearCanvas System",
      host: "localhost",
      port: 11114,
    },
  },
});

module.exports = aeConfig;
