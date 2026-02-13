#!/usr/bin/env bun

import { spawn } from 'child_process';
import { WebSocket } from 'ws';
import { fileURLToPath } from 'url';

const DEBUGGER_PORT = 6499;
const STATUS_CHECK_INTERVAL = 30000; // 30 seconds
const STATUS_TIMEOUT = 30000; // 30 seconds
const STATUS_URL = 'http://localhost:5000/dicomweb/status';

let serverProcess = null;
let debuggerWs = null;
let messageId = 1;
let debuggerUrl = null;

// Detect platform for process killing
const isWindows = process.platform === 'win32';

// Start the dicomwebserver with debugging enabled
function startServer() {
  console.log('[Monitor] Starting dicomwebserver with debugger...');

  // Reset debugger URL
  debuggerUrl = null;

  // Pass through any command-line arguments (skip the first two: bun and script name)
  const additionalArgs = process.argv.slice(2);

  // Find the actual dicomwebserver script path (use fileURLToPath for cross-platform compatibility)
  const scriptPath = fileURLToPath(new URL('./dicomwebserver.mjs', import.meta.url));
  const args = [`--inspect=0.0.0.0:${DEBUGGER_PORT}`, scriptPath, ...additionalArgs];

  console.log('[Monitor] Running with args:', args.join(' '));

  serverProcess = spawn('bun', args, {
    stdio: ['inherit', 'pipe', 'pipe'],
    env: { ...process.env }
  });

  // Capture stdout to find the debugger URL
  serverProcess.stdout.on('data', (data) => {
    const output = data.toString();
    process.stdout.write(data); // Still show the output

    // Look for the WebSocket URL in Bun's output
    const match = output.match(/ws:\/\/[^\s]+/);
    if (match && !debuggerUrl) {
      debuggerUrl = match[0];
      console.log('[Monitor] Found debugger URL:', debuggerUrl);
    }
  });

  // Capture stderr
  serverProcess.stderr.on('data', (data) => {
    const output = data.toString();
    process.stderr.write(data); // Still show the output

    // Look for the WebSocket URL in stderr too
    const match = output.match(/ws:\/\/[^\s]+/);
    if (match && !debuggerUrl) {
      debuggerUrl = match[0];
      console.log('[Monitor] Found debugger URL:', debuggerUrl);
    }
  });

  serverProcess.on('exit', (code, signal) => {
    console.log(`[Monitor] dicomwebserver exited with code ${code}, signal ${signal}`);
    console.log('[Monitor] Restarting dicomwebserver...');
    setTimeout(() => startServer(), 1000);
  });

  serverProcess.on('error', (err) => {
    console.error('[Monitor] Failed to start dicomwebserver:', err);
  });
}

// Connect to the debugger with retries
async function connectDebugger(retries = 3) {
  if (!debuggerUrl) {
    throw new Error('Debugger URL not found - Bun may not have started with --inspect');
  }

  for (let i = 0; i < retries; i++) {
    try {
      console.log(`[Monitor] Attempting to connect to debugger (attempt ${i + 1}/${retries})...`);
      console.log(`[Monitor] Using URL: ${debuggerUrl}`);
      const ws = await new Promise((resolve, reject) => {
        const ws = new WebSocket(debuggerUrl);

        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error('Connection timeout'));
        }, 2000);

        ws.on('open', () => {
          clearTimeout(timeout);
          console.log('[Monitor] Connected to debugger');
          resolve(ws);
        });

        ws.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
      return ws;
    } catch (err) {
      console.error(`[Monitor] Debugger connection failed (attempt ${i + 1}):`, err.message);
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }
  throw new Error(`Failed to connect to debugger after ${retries} attempts`);
}

// Send a command to the debugger and wait for response
function sendDebugCommand(ws, method, params = {}) {
  return new Promise((resolve) => {
    const id = messageId++;
    const handlers = {};

    handlers.message = (data) => {
      const response = JSON.parse(data.toString());
      if (response.id === id) {
        ws.off('message', handlers.message);
        resolve(response);
      }
    };

    ws.on('message', handlers.message);
    ws.send(JSON.stringify({ id, method, params }));

    // Timeout after 5 seconds
    setTimeout(() => {
      ws.off('message', handlers.message);
      resolve(null);
    }, 5000);
  });
}

// Get stack traces from all threads
async function getStackTraces() {
  try {
    // Wait up to 5 seconds for debugger URL to be found
    let waitTime = 0;
    while (!debuggerUrl && waitTime < 5000) {
      await new Promise(resolve => setTimeout(resolve, 500));
      waitTime += 500;
    }

    if (!debuggerWs || debuggerWs.readyState !== WebSocket.OPEN) {
      debuggerWs = await connectDebugger();
    }

    // Enable the debugger domain
    await sendDebugCommand(debuggerWs, 'Debugger.enable');

    // Try to capture paused event (may not work with tight loops in Bun)
    let pausedParams = null;
    const globalHandler = (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.method === 'Debugger.paused') {
          pausedParams = message.params;
        }
      } catch (err) {
        // Ignore parse errors
      }
    };

    debuggerWs.on('message', globalHandler);

    // Send pause command
    await sendDebugCommand(debuggerWs, 'Debugger.pause');

    // Wait for paused event (note: Bun's debugger has limitations with tight loops)
    console.log('[Monitor] Waiting for paused event (up to 5 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Clean up listener
    debuggerWs.off('message', globalHandler);

    const pausedEvent = pausedParams;

    console.log('\n========== STACK TRACE ==========');
    if (pausedEvent && pausedEvent.callFrames) {
      console.log('Call stack:');
      pausedEvent.callFrames.forEach((frame, index) => {
        const location = frame.location || {};
        const functionName = frame.functionName || '<anonymous>';
        const url = frame.url || 'unknown';
        const line = location.lineNumber !== undefined ? location.lineNumber + 1 : '?';
        const col = location.columnNumber !== undefined ? location.columnNumber + 1 : '?';
        console.log(`  ${index}: ${functionName} (${url}:${line}:${col})`);
      });
      console.log('\nFull details:');
      console.log(JSON.stringify(pausedEvent.callFrames, null, 2));
    } else {
      console.log('No call frames available');
    }
    console.log('==================================\n');

    // Resume execution
    await sendDebugCommand(debuggerWs, 'Debugger.resume');

    debuggerWs.close();
    debuggerWs = null;
  } catch (err) {
    console.error('[Monitor] Failed to get stack trace:', err.message);

    // Fallback: log process information instead
    console.log('\n========== PROCESS INFO (FALLBACK) ==========');
    if (serverProcess) {
      console.log('Process PID:', serverProcess.pid);
      console.log('Process killed:', serverProcess.killed);
      console.log('Process exit code:', serverProcess.exitCode);
      console.log('Process signal code:', serverProcess.signalCode);
    }
    console.log('Platform:', process.platform);
    console.log('Node version:', process.version);
    console.log('Uptime:', process.uptime(), 'seconds');
    console.log('Memory usage:', JSON.stringify(process.memoryUsage(), null, 2));
    console.log('CPU usage:', JSON.stringify(process.cpuUsage(), null, 2));
    console.log('==============================================\n');
  }
}

// Kill the server process (cross-platform)
function killServer() {
  if (!serverProcess) return;

  console.log('[Monitor] Killing unresponsive dicomwebserver...');

  // Capture the specific process instance to kill (so we don't kill a restarted process)
  const processToKill = serverProcess;

  if (isWindows) {
    // On Windows, try to kill gracefully but warn that it might not work
    console.log('[Monitor] Note: Process killing on Windows may not work if the process is truly hung');
    try {
      processToKill.kill('SIGTERM');
    } catch (err) {
      console.error('[Monitor] Error killing process:', err.message);
    }

    // Force kill after 5 seconds if still running
    setTimeout(() => {
      if (processToKill && !processToKill.killed) {
        console.log('[Monitor] Force killing dicomwebserver...');
        try {
          processToKill.kill('SIGKILL');
        } catch (err) {
          console.error('[Monitor] Error force killing process:', err.message);
        }
      }
    }, 5000);
  } else {
    // On Linux/Unix, standard kill signals should work
    processToKill.kill('SIGTERM');

    // Force kill after 5 seconds if still running
    setTimeout(() => {
      if (processToKill && !processToKill.killed) {
        console.log('[Monitor] Force killing dicomwebserver...');
        processToKill.kill('SIGKILL');
      }
    }, 5000);
  }
}

// Check the status endpoint
async function checkStatus() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STATUS_TIMEOUT);

  try {
    const response = await fetch(STATUS_URL, {
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      console.log('[Monitor] Status check OK');
      return true;
    } else {
      console.error(`[Monitor] Status check failed with status ${response.status}`);
      return false;
    }
  } catch (err) {
    clearTimeout(timeoutId);

    if (err.name === 'AbortError') {
      console.error('[Monitor] Status check timed out after 30 seconds');
    } else {
      console.error('[Monitor] Status check failed:', err.message);
    }
    return false;
  }
}

// Main monitoring loop
async function monitorLoop() {
  // Wait a bit for the server to start
  await new Promise(resolve => setTimeout(resolve, 5000));

  let consecutiveFailures = 0;
  const FAILURE_THRESHOLD = 3;

  while (true) {
    const isHealthy = await checkStatus();

    if (!isHealthy) {
      consecutiveFailures++;
      console.log(`[Monitor] Server check failed (${consecutiveFailures}/${FAILURE_THRESHOLD})`);

      if (consecutiveFailures >= FAILURE_THRESHOLD) {
        console.log('[Monitor] Server is unresponsive after 3 failed checks, collecting stack trace...');

        // Get stack trace
        await getStackTraces();

        // Kill the server process
        killServer();

        // Reset counter
        consecutiveFailures = 0;

        // Wait before next check (the process will restart automatically)
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    } else {
      // Reset failure counter on successful check
      if (consecutiveFailures > 0) {
        console.log('[Monitor] Server recovered, resetting failure counter');
        consecutiveFailures = 0;
      }
    }

    await new Promise(resolve => setTimeout(resolve, STATUS_CHECK_INTERVAL));
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Monitor] Received SIGTERM, shutting down...');
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
  if (debuggerWs) {
    debuggerWs.close();
  }
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Monitor] Received SIGINT, shutting down...');
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
  if (debuggerWs) {
    debuggerWs.close();
  }
  process.exit(0);
});

// Start everything
console.log('[Monitor] Starting monitoring system...');
console.log(`[Monitor] Platform: ${process.platform}`);
startServer();
monitorLoop().catch(err => {
  console.error('[Monitor] Monitor loop crashed:', err);
  process.exit(1);
});
