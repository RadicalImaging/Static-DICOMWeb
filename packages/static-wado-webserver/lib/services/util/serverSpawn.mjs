import path from "path";
import childProcess from "child_process";
import {
  extractMultipart,
  uint8ArrayToString,
  execSpawn,
  handleHomeRelative,
} from "@radicalimaging/static-wado-util";

const queue = [];
const runners = [];

export function ensureRunners(count = 1) {
  for (let i = 0; i < count; i++) {
    if (!queue.length) {
      console.verbose("Nothing in queue");
      return;
    }
    if (!runners[i] || runners[i].terminated) {
      console.noQuiet("Recreating runner", i);
      runners[i] = createRunner();
    }
    if (runners[i].available) {
      runners[i].run();
    } else {
      console.noQuiet("Runner", i, "not available");
    }
  }
}

const executablePath = process.argv[1];
const bunExecPath = path.join(
  path.dirname(executablePath),
  "..",
  "..",
  "static-wado-creator",
  "bin",
  "mkdicomweb.mjs"
);

const cmd = ["bun", "run", bunExecPath, "server", "--quiet"];

export function createRunner() {
  const child = childProcess.spawn(cmd.join(" "), {
    shell: true,
    stdio: ["overlapped", "overlapped", "inherit"],
  });
  const runner = {
    available: true,
    inputData: [],
    child,
    json: null,
    terminated: false,
    processing: false,
    run: function () {
      if (!queue.length) {
        console.warn("Queue empty, returning");
        return;
      }
      this.available = false;
      this.processing = queue.splice(0, 1)[0];
      console.verbose(
        "Starting to process",
        runner.processing.cmdLine.join(" ")
      );
      this.child.stdin.write(`${runner.processing.cmdLine.join(" ")}\n`);
    },
  };

  child.stdout.on("data", (data) => {
    runner.inputData.push(data);
    if (data.indexOf("mkdicomweb server -->") !== -1) {
      const resultStr = runner.inputData.join("");
      try {
        const jsonResponse = extractMultipart("multipart/related", resultStr);
        const jsonStr = uint8ArrayToString(jsonResponse.pixelData).trim();
        const json = JSON.parse(jsonStr);
        runner.json = json;
        runner.processing.resolve(json);
      } catch (e) {
        console.warn("Unable to process", resultStr);
      }
      runner.inputData = [];
      runner.processing = null;
      runner.available = true;
      console.verbose("Runner done");
      if (queue.length) {
        runner.run();
      }
    }
  });
  child.on("close", (code) => {
    runner.terminated = true;
    console.noQuiet("Runner terminated");
    if (runner.processing) {
      runner.processing.reject(
        new Error("Unknown failure " + inputData.join("\n"))
      );
    }
  });

  return runner;
}

export function mkdicomwebSpawn(cmdLine) {
  const promise = new Promise((resolve, reject) => {
    queue.push({ resolve, reject, cmdLine });
  });
  ensureRunners(1);
  return promise;
}
