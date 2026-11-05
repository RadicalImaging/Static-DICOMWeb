#!/usr/bin/env bun
import { parseArgs } from 'node:util';
import { loadConfig, createContext } from '../lib/context.mjs';
import { directoryStore } from '../lib/stores/directory.mjs';
import { createLocalServer } from '../lib/localServer.mjs';

const { values } = parseArgs({
  options: {
    dir: { type: 'string', default: './proxy-store' },
    port: { type: 'string', default: '5050' },
  },
});

const config = loadConfig();
const context = createContext({ config, store: directoryStore(values.dir) });
createLocalServer(context).listen(Number(values.port), () => {
  console.log(
    `Proxy on http://localhost:${values.port}${config.root}, store ${values.dir}, upstream ${config.upstream}`
  );
});
