#!/usr/bin/env node

import { deployConfig, configureProgram } from "../lib/index.mjs";

// Configure program commander and run the action
configureProgram(deployConfig);
