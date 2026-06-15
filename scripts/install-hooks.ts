import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const SKIP_GIT_HOOKS = process.env.SKIP_GIT_HOOKS === "true";
const CI = process.env.CI === "true";
const NODE_ENV = process.env.NODE_ENV === "production";
const NO_GIT = !existsSync(".git");

if (SKIP_GIT_HOOKS || CI || NODE_ENV || NO_GIT) {
  process.exit(0);
}

const gitCheck = spawnSync("git", ["--version"], {
  stdio: "ignore",
  shell: process.platform === "win32",
});

if (gitCheck.status !== 0) {
  process.exit(0);
}

const lefthookResult = spawnSync("lefthook", ["install"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

process.exit(lefthookResult.status ?? 1);
