#!/usr/bin/env bun

import StaticWado from '../lib/index.mjs';

// Configure program commander
StaticWado.configureProgram(StaticWado.mkdicomwebConfig).then(() => {
  console.verbose("done")
})
