#!/usr/bin/env node
// @ts-check
/**
 * Agent CLI Relay Server Entrypoint
 *
 * Purpose:
 * - Launch the optional local-first relay server used for remote supervision.
 *
 * Key features:
 * - Hosts the HTTP relay API with in-memory pairing, command, event, and notification queues.
 * - Keeps relay state ephemeral so local tools, files, tokens, and memory never leave the machine.
 *
 * Recent changes:
 * - 2026-05-11: Added the initial optional relay server entrypoint.
 */
import { createRelayHttpServer } from '../lib/relay-server.js';

function readPort(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--port') {
      return Number(argv[index + 1] ?? '0') || 0;
    }

    if (arg.startsWith('--port=')) {
      return Number(arg.split('=')[1] ?? '0') || 0;
    }
  }

  return Number(process.env.PORT ?? '8787') || 8787;
}

const port = readPort(process.argv.slice(2));
const server = createRelayHttpServer();

server.listen(port, () => {
  const address = server.address();
  const resolvedPort = address && typeof address === 'object' ? address.port : port;
  process.stdout.write(`Relay server listening on http://127.0.0.1:${resolvedPort}\n`);
});