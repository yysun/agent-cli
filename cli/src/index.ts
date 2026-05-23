import { isCliEntrypoint, runCli } from './agent-cli.js';

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
} from './agent-cli.js';

if (isCliEntrypoint()) {
  await runCli();
}
