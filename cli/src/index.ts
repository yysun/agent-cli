import { isCliEntrypoint, runCli } from './cli-shell.js';

export {
  REMOTE_RELAY_SERVER_ENV_KEY,
  isCliEntrypoint,
  main,
  parseArguments,
  readRemoteRelayServerUrl,
  runCli,
  runtimeSelectionText,
  startupText,
  usageText,
} from './cli-shell.js';

if (isCliEntrypoint()) {
  await runCli();
}