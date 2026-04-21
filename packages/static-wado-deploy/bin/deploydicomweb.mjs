#!/usr/bin/env bun

import {
  deployConfig,
  configureProgram,
} from "../lib/index.mjs";

// Configure program commander and run the action
configureProgram(deployConfig);
