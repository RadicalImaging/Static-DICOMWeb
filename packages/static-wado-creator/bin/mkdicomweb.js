#!/usr/bin/env node

import { mkdicomwebConfig, configureProgram } from "@radicalimaging/static-wado-creator";

// Configure program commander
configureProgram(mkdicomwebConfig).then(() => {
  console.log("done");
});
