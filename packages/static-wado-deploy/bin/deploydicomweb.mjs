#!/usr/bin/env node

import { deployConfig, configureProgram } from "@radicalimaging/static-wado-deploy";

// Configure program commander and run the action
configureProgram(deployConfig);
