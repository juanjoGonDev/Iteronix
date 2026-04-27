const { spawn } = require("node:child_process");
const { join } = require("node:path");

const DevApiPort = "4001";
const entryPath = join(
  __dirname,
  "..",
  "..",
  "..",
  "dist",
  "apps",
  "server-api",
  "src",
  "index.js"
);

const child = spawn(process.execPath, ["--watch", entryPath], {
  stdio: "inherit",
  env: {
    ...process.env,
    PORT: process.env.PORT ?? DevApiPort
  }
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

child.on("error", (error) => {
  throw error;
});
