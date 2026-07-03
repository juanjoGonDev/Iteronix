import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import { stopProcess } from "./browser-validation-runtime.js";

const ProcessWait = {
  StartupMs: 150,
  ExitMs: 2000,
} as const;

describe("browser validation runtime", () => {
  it("terminates preview child processes", async () => {
    const child = spawn(
      process.execPath,
      ["-e", "setInterval(() => {}, 1000)"],
      {
        detached: process.platform !== "win32",
        stdio: "ignore",
      },
    );

    await delay(ProcessWait.StartupMs);
    await stopProcess(child);

    const exited = await waitForExit(child, ProcessWait.ExitMs);

    expect(exited).toBe(true);
  });
});

const delay = async (ms: number): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
};

const waitForExit = async (
  child: ReturnType<typeof spawn>,
  timeoutMs: number,
): Promise<boolean> => {
  if (child.exitCode !== null || child.signalCode !== null) {
    return true;
  }

  return new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      child.off("exit", onExit);
      resolve(false);
    }, timeoutMs);

    const onExit = (): void => {
      clearTimeout(timeout);
      resolve(true);
    };

    child.once("exit", onExit);
  });
};
