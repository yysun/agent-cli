// @ts-check
/**
 * Agent CLI Entrypoint Unit Tests
 *
 * Purpose:
 * - Validate argument parsing and executable-entrypoint detection for direct and linked CLI usage.
 *
 * Key features:
 * - Verifies symlinked binaries still execute the CLI module.
 * - Confirms basic CLI flag parsing stays stable.
 *
 * Recent changes:
 * - 2026-05-07: Added regression coverage for npm-linked CLI execution.
 * - 2026-05-07: Added flag coverage for the verbose CLI diagnostics mode.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** @type {string[]} */
const tempPathsToClean = [];

async function loadCliModule() {
  vi.resetModules();
  return await import('../../bin/agent-cli.js');
}

afterEach(async () => {
  while (tempPathsToClean.length > 0) {
    const tempPath = tempPathsToClean.pop();

    if (!tempPath) {
      break;
    }

    await rm(tempPath, { recursive: true, force: true });
  }
});

describe('agent-cli entrypoint', () => {
  it('parses the supported flags and message body', async () => {
    const { parseArguments } = await loadCliModule();

    expect(parseArguments(['--new-chat', 'Map', 'the', 'terrain'])).toEqual({
      help: false,
      newChat: true,
      verbose: false,
      message: 'Map the terrain',
    });
    expect(parseArguments(['--help'])).toEqual({
      help: true,
      newChat: false,
      verbose: false,
      message: '',
    });
    expect(parseArguments(['--verbose', 'Inspect', 'status'])).toEqual({
      help: false,
      newChat: false,
      verbose: true,
      message: 'Inspect status',
    });
  });

  it('treats a symlinked bin path as the CLI entrypoint', async () => {
    const { isCliEntrypoint } = await loadCliModule();
    const cliPath = fileURLToPath(new URL('../../bin/agent-cli.js', import.meta.url));
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'agent-cli-bin-'));
    const symlinkPath = path.join(tempDirectory, 'agent-cli');
    tempPathsToClean.push(tempDirectory);

    await symlink(cliPath, symlinkPath);

    expect(isCliEntrypoint(symlinkPath, pathToFileURL(cliPath).href)).toBe(true);
  });

  it('does not treat a different file as the CLI entrypoint', async () => {
    const { isCliEntrypoint } = await loadCliModule();
    const cliPath = fileURLToPath(new URL('../../bin/agent-cli.js', import.meta.url));
    const otherPath = fileURLToPath(new URL('../../package.json', import.meta.url));

    expect(isCliEntrypoint(otherPath, pathToFileURL(cliPath).href)).toBe(false);
  });
});