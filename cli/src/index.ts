/**
 * Agent CLI package entrypoint.
 *
 * Purpose:
 * - Re-export the supported local CLI API and run the CLI when invoked directly.
 *
 * Recent changes:
 * - 2026-05-26: Removed remote relay exports with the deleted relay product surface.
 */
import { isCliEntrypoint, runCli } from './agent-cli.js';

export {
  isCliEntrypoint,
  main,
  parseArguments,
  runCli,
  runtimeSelectionText,
  startupText,
  usageText,
} from './agent-cli.js';

if (isCliEntrypoint()) {
  await runCli();
}
