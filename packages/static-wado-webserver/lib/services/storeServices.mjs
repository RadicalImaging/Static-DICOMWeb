/* eslint-disable import/prefer-default-export */
import fs from "fs"
import path from "path"
import childProcess from "node:child_process"
import { execSpawn, handleHomeRelative } from "@radicalimaging/static-wado-util"
import {
  extractMultipart,
  uint8ArrayToString,
} from "@radicalimaging/static-wado-util"

const createCommandLine = (args, commandName, params) => {
  let commandline = commandName
  const { files = [], studyUID } = args

  commandline = commandline.replace(
    /<files>/,
    files.map((file) => file.filepath).join(" ")
  )
  commandline = commandline.replace(
    /<rootDir>/,
    path.resolve(handleHomeRelative(params.rootDir))
  )
  if (studyUID) {
    commandline = commandline.replace(/<studyUID>/, StudyInstanceUID)
  }
  return commandline
}

/**
 * Save files using stow service, using the given stow command (from params)
 *
 * @param {*} files files to be stored
 * @param {*} params
 */
export const storeFilesByStow = (stored, params = {}) => {
  const { stowCommands = [], notificationCommand, verbose = false } = params
  const { files, studyUIDs } = stored

  const listFiles = Object.values(files).reduce(
    (prev, curr) => prev.concat(curr),
    []
  )
  console.verbose(
    "Storing files",
    listFiles.map((item) => item.filepath)
  )

  const promises = []
  for (const commandName of stowCommands) {
    const command = createCommandLine(stored, commandName, params)
    console.log("Store command", command)
    const commandPromise = execSpawn(command)
    promises.push(commandPromise)
  }

  return Promise.allSettled(promises).then(() => {
    if (notificationCommand) {
      console.warn("Executing notificationCommand", notificationCommand)
      execSpawn(notificationCommand)
    }
    listFiles.forEach((item) => {
      const { filepath } = item
      console.verbose("Unlinking", filepath)
      fs.unlink(filepath, () => null)
    })
    return listFiles.map((it) => it.filepath)
  })
}

const executablePath = process.argv[1]
const bunExecPath = path.join(
  path.dirname(executablePath),
  "..",
  "..",
  "static-wado-creator",
  "bin",
  "mkdicomwebBun.mjs"
)

/** Creates a separated child process */
function spawnInstances(cmdLine) {
  return new Promise((resolve, reject) => {
    try {
      console.log("Spawning instance", cmdLine)
      const child = childProcess.spawn(cmdLine, {
        shell: true,
        stdio: ["inherit", "overlapped", "inherit"],
      })
      let inputData = []
      child.stdout.on("data", (data) => {
        inputData.push(data)
      })
      child.on("close", (code) => {
        const resultStr = inputData.join("")
        const jsonResponse = extractMultipart("multipart/related", resultStr)
        const jsonStr = uint8ArrayToString(jsonResponse.pixelData).trim()
        const json = JSON.parse(jsonStr)
        json.code = code

        resolve(json)
      })
    } catch (e) {
      reject(e)
    }
  })
}

export const storeFileInstance = (item, params = {}) => {
  console.log("storeFileInstance", item)
  const cmd = [
    "bun",
    "run",
    bunExecPath,
    "instance",
    "--thumb",
    "--quiet",
    "--stow-response",
    item,
  ]
  const cmdLine = cmd.join(" ")
  return spawnInstances(cmdLine)
}
