#!/usr/bin/env bun

import { spawn } from 'child_process';
import { WebSocket } from 'ws';

const DEBUGGER_PORT = 6499;
const STATUS_CHECK_INTERVAL = 30000; // 30 seconds
const STATUS_TIMEOUT = 30000; // 30 seconds
const STATUS_URL = 'http://localhost:5000/dicomweb/status';

let serverProcess = null;
let debuggerWs = null;
let messageId = 1;

// Detect platform for process killing
const isWindows = process.platform === 'win32';

// Start the dicomwebserver with debugging enabled
function startServer() {
  console.log('[Monitor] Starting dicomwebserver with debugger...');

  // Pass through any command-line arguments (skip the first two: bun and script name)
  const additionalArgs = process.argv.slice(2);
  const args = ['--inspect', 'dicomwebserver', ...additionalArgs];

  console.log('[Monitor] Running with args:', args.join(' '));

  serverProcess = spawn('bun', args, {
    stdio: 'inherit',
    env: { ...process.env }
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

// Connect to the debugger
async function connectDebugger() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${DEBUGGER_PORT}`);

    ws.on('open', () => {
      console.log('[Monitor] Connected to debugger');
      resolve(ws);
    });

    ws.on('error', (err) => {
      console.error('[Monitor] Debugger connection error:', err.message);
      reject(err);
    });
  });
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
    if (!debuggerWs || debuggerWs.readyState !== WebSocket.OPEN) {
      debuggerWs = await connectDebugger();
    }

    // Enable the debugger domain
    await sendDebugCommand(debuggerWs, 'Debugger.enable');

    // Pause execution to get stack traces
    await sendDebugCommand(debuggerWs, 'Debugger.pause');

    // Wait a bit for the pause to take effect
    await new Promise(resolve => setTimeout(resolve, 100));

    // Get the stack trace
    const stackTrace = await sendDebugCommand(debuggerWs, 'Debugger.getStackTrace');

    console.log('\n========== STACK TRACE ==========');
    if (stackTrace && stackTrace.result) {
      console.log(JSON.stringify(stackTrace.result, null, 2));
    } else {
      console.log('No stack trace available');
    }
    console.log('==================================\n');

    // Resume execution
    await sendDebugCommand(debuggerWs, 'Debugger.resume');

    debuggerWs.close();
    debuggerWs = null;
  } catch (err) {
    console.error('[Monitor] Failed to get stack trace:', err.message);
  }
}

// Kill the server process (cross-platform)
function killServer() {
  if (!serverProcess) return;

  console.log('[Monitor] Killing unresponsive dicomwebserver...');

  if (isWindows) {
    // On Windows, try to kill gracefully but warn that it might not work
    console.log('[Monitor] Note: Process killing on Windows may not work if the process is truly hung');
    try {
      serverProcess.kill('SIGTERM');
    } catch (err) {
      console.error('[Monitor] Error killing process:', err.message);
    }

    // Force kill after 5 seconds if still running
    setTimeout(() => {
      if (serverProcess && !serverProcess.killed) {
        console.log('[Monitor] Force killing dicomwebserver...');
        try {
          serverProcess.kill('SIGKILL');
        } catch (err) {
          console.error('[Monitor] Error force killing process:', err.message);
        }
      }
    }, 5000);
  } else {
    // On Linux/Unix, standard kill signals should work
    serverProcess.kill('SIGTERM');

    // Force kill after 5 seconds if still running
    setTimeout(() => {
      if (serverProcess && !serverProcess.killed) {
        console.log('[Monitor] Force killing dicomwebserver...');
        serverProcess.kill('SIGKILL');
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

  while (true) {
    const isHealthy = await checkStatus();

    if (!isHealthy) {
      console.log('[Monitor] Server is unresponsive, collecting stack trace...');

      // Get stack trace
      await getStackTraces();

      // Kill the server process
      killServer();

      // Wait before next check (the process will restart automatically)
      await new Promise(resolve => setTimeout(resolve, 10000));
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
