#!/usr/bin/env bun

import {
  deployConfig,
  configureProgram,
} from "@radicalimaging/static-wado-deploy";

// Configure program commander and run the action
configureProgram(deployConfig);
