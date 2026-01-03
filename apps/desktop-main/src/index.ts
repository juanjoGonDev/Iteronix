import { DesktopMode, UiMode } from "./constants";
import { resolveDesktopConfig } from "./config";
import { ResultType } from "./result";
import { startLocalServer } from "./server";

const config = resolveDesktopConfig(process.env, process.cwd());

if (config.type === ResultType.Err) {
  process.stderr.write(`${config.error.message}\n`);
  process.exit(1);
}

if (config.value.ui.mode === UiMode.Dev) {
  process.stdout.write(`UI source: ${config.value.ui.url}\n`);
} else {
  process.stdout.write(`UI source: ${config.value.ui.entryUrl}\n`);
}

if (config.value.mode === DesktopMode.Local) {
  const server = startLocalServer(config.value.server);
  if (server.type === ResultType.Err) {
    process.stderr.write(`${server.error.message}\n`);
    process.exit(1);
  }
}
