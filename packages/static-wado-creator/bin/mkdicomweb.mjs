#!/usr/bin/env node

import path from "path"
import * as childProcess from "child_process"

const executablePath = process.argv[1]
const bunExecPath = path.join(path.dirname(executablePath), "mkdicomwebBun.mjs")

const cmd = ["bun", "run", bunExecPath, ...process.argv.slice(2)]
const cmdLine = cmd.join(" ")

function execSpawn(cmdLine) {
  return new Promise((resolve, reject) => {
    try {
      const child = childProcess.spawn(cmdLine, {
        shell: true,
        stdio: "inherit",
      })
      child.on("close", (code) => {
        resolve(code)
      })
    } catch (e) {
      reject(e)
    }
  })
}

await execSpawn(cmdLine)
