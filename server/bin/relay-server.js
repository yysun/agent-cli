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

function readHost(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--host') {
      return String(argv[index + 1] ?? '').trim() || '127.0.0.1';
    }

    if (arg.startsWith('--host=')) {
      return String(arg.split('=')[1] ?? '').trim() || '127.0.0.1';
    }
  }

  return String(process.env.HOST ?? '').trim() || '127.0.0.1';
}

function readStaticDir(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--static-dir') {
      return String(argv[index + 1] ?? '').trim() || undefined;
    }

    if (arg.startsWith('--static-dir=')) {
      return String(arg.split('=')[1] ?? '').trim() || undefined;
    }
  }

  return String(process.env.RELAY_STATIC_DIR ?? '').trim() || undefined;
}

const port = readPort(process.argv.slice(2));
const host = readHost(process.argv.slice(2));
const staticDir = readStaticDir(process.argv.slice(2));
const server = createRelayHttpServer({ staticDir });

server.listen(port, host, () => {
  const address = server.address();
  const resolvedPort = address && typeof address === 'object' ? address.port : port;
  const displayHost = address && typeof address === 'object' ? address.address : host;
  process.stdout.write(`Relay server listening on http://${displayHost}:${resolvedPort}\n`);
});