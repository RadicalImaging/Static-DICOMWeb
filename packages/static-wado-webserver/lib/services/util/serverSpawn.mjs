import path from 'path';
import childProcess from 'child_process';
import {
  extractMultipart,
  uint8ArrayToString,
  execSpawn,
  handleHomeRelative,
  logger,
} from '@radicalimaging/static-wado-util';

const { webserverLog } = logger;

const queue = [];
const runners = [];

export function ensureRunners(count = Math.max(3, runners.length)) {
  for (let i = 0; i < count; i++) {
    if (!queue.length) {
      webserverLog.debug('Nothing in queue');
      return;
    }
    if (!runners[i] || runners[i].terminated) {
      if (runners[i]) {
        webserverLog.info('Recreating runner', i);
      }
      runners[i] = createRunner();
    }
    if (runners[i].available) {
      runners[i].run();
    } else {
      webserverLog.debug('Runner', i, 'not available');
    }
  }
}

const executablePath = process.argv[1];
const bunExecPath = path.join(
  path.dirname(executablePath),
  '..',
  '..',
  'static-wado-creator',
  'bin',
  'mkdicomweb.mjs'
);

const cmd = ['bun', 'run', bunExecPath, 'server', '--quiet'];

let count = 0;

export function createRunner() {
  const child = childProcess.spawn(cmd.join(' '), {
    shell: true,
    stdio: ['overlapped', 'overlapped', 'inherit'],
  });
  const runner = {
    available: true,
    inputData: [],
    child,
    json: null,
    count: count++,
    terminated: false,
    processing: false,
    run: function () {
      if (!queue.length) {
        webserverLog.debug('Queue empty, returning');
        return;
      }
      this.available = false;
      this.processing = queue.splice(0, 1)[0];
      this.processing.startTime = performance.now();
      const { cmdLine } = runner.processing;
      const cmd = Array.isArray(cmdLine) ? cmdLine.join(' ') : cmdLine;
      webserverLog.debug('Starting to process', cmd);
      this.processing.cmd = cmd;
      this.child.stdin.write(`${cmd}\n`);
    },
  };

  child.stdout.on('data', data => {
    if (!runner.processing) {
      return;
    }
    runner.inputData.push(data);
    webserverLog.debug(`${runner.count}.${runner.inputData.length}>`, String(data));
    const resultStr = runner.inputData.join('');
    if (resultStr.indexOf('mkdicomweb server -->') !== -1) {
      runner.processing.endTime = performance.now();
      try {
        let json = null;
        if (runner.processing.options?.parseResults !== false) {
          const jsonResponse = extractMultipart('multipart/related', resultStr);
          const jsonStr = uint8ArrayToString(jsonResponse.pixelData).trim();
          json = JSON.parse(jsonStr);
          runner.json = json;
        }
        runner.processing.resolve(json);
      } catch (e) {
        runner.processing.reject(new Error(`Unable to find JSON results in ${resultStr}`));
      }
      const { queueTime, startTime, endTime, cmd } = runner.processing;
      webserverLog.info(
        'Task done queue time',
        startTime - queueTime,
        'exec time',
        endTime - startTime,
        cmd
      );
      runner.inputData = [];
      runner.processing = null;
      runner.available = true;

      if (queue.length && !runner.terminated) {
        runner.run();
      }
    }
  });
  child.on('close', code => {
    runner.terminated = true;
    webserverLog.info('Runner terminated');
    if (runner.processing) {
      webserverLog.warn(
        'Runner terminated processing',
        runner.processing.cmdLine,
        runner.inputData.join('\n')
      );
      runner.processing.reject(new Error('Unknown failure ' + runner.inputData.join('')));
      ensureRunners();
    }
  });

  return runner;
}

export function mkdicomwebSpawn(cmdLine, options = { runners: 3, parseResults: true }) {
  const promise = new Promise((resolve, reject) => {
    queue.push({
      resolve,
      reject,
      cmdLine,
      options,
      queueTime: performance.now(),
    });
  });
  ensureRunners(options?.runners ?? 3);
  return promise;
}
