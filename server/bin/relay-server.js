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
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createRelayHttpServer } from '../lib/relay-server.js';
import { listRelayListenUrls } from '../lib/relay-server.js';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixedStaticDir = path.join(packageRoot, 'web', 'dist');

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

/** @param {string} host */
function resolveStaticDir(host) {
  if (host !== '0.0.0.0' && host !== '::') {
    return undefined;
  }

  if (!existsSync(path.join(fixedStaticDir, 'index.html'))) {
    return undefined;
  }

  return fixedStaticDir;
}

const port = readPort(process.argv.slice(2));
const host = readHost(process.argv.slice(2));
const staticDir = resolveStaticDir(host);
const server = createRelayHttpServer({ staticDir });

server.listen(port, host, () => {
  const address = server.address();

  if (!address || typeof address === 'string') {
    process.stdout.write(`Relay server listening on http://${host}:${port}\n`);
    return;
  }

  const urls = listRelayListenUrls(address);

  if (urls.length === 1) {
    process.stdout.write(`Relay server listening on ${urls[0]}\n`);
    if (staticDir) {
      process.stdout.write(`Serving static web app from ${staticDir}\n`);
    }
    return;
  }

  process.stdout.write(`Relay server listening on:\n${urls.map((url) => `- ${url}`).join('\n')}\n`);
  if (staticDir) {
    process.stdout.write(`Serving static web app from ${staticDir}\n`);
  }
});