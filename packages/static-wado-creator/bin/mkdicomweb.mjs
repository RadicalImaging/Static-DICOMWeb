#!/usr/bin/env bun

import StaticWado from "@radicalimaging/static-wado-creator"

// Configure program commander
StaticWado.configureProgram(StaticWado.mkdicomwebConfig).then(() => {
  console.verbose("done")
})
