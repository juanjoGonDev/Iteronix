const { spawn } = require("node:child_process");

const env = { ...process.env };
env.NODE_ENV = "development";
env.ITERONIX_DESKTOP_UI_MODE = "dev";
env.ITERONIX_DESKTOP_UI_DEV_URL =
  env.ITERONIX_DESKTOP_UI_DEV_URL ?? "http://localhost:5173";

const child = spawn(
  "node",
  ["--watch", "../../dist/apps/desktop-main/src/index.js"],
  {
    stdio: "inherit",
    env
  }
);

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
