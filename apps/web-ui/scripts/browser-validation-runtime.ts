import { access, mkdir, readdir, rm } from "node:fs/promises";
import { constants as FsConstants } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import type { Page } from "puppeteer";

export const RuntimeFlag = {
  PreserveScreenshots: "--preserve-screenshots"
} as const;

const ScreenshotArtifact = {
  Extension: ".png"
} as const;

export type WaitForConditionInput = {
  timeoutMs: number;
  intervalMs: number;
};

export type BrowserValidationRuntimeOptions = {
  preserveScreenshots: boolean;
};

export const parseBrowserValidationRuntimeOptions = (
  args: ReadonlyArray<string>
): BrowserValidationRuntimeOptions => ({
  preserveScreenshots: args.includes(RuntimeFlag.PreserveScreenshots)
});

export const prepareBrowserValidationDirectory = async (input: {
  directory: string;
  preserveScreenshots: boolean;
}): Promise<void> => {
  await mkdir(input.directory, {
    recursive: true
  });

  if (input.preserveScreenshots) {
    return;
  }

  const entries = await readdir(input.directory, {
    withFileTypes: true
  });
  const removablePaths = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(ScreenshotArtifact.Extension))
    .map((entry) => join(input.directory, entry.name));

  await Promise.all(
    removablePaths.map((path) =>
      rm(path, {
        force: true
      })
    )
  );
};

export const captureBrowserValidationScreenshot = async (input: {
  page: Page;
  directory: string;
  suffix: string;
  artifactName: string;
}): Promise<void> => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = join(
    input.directory,
    `${timestamp}_${input.suffix}_${input.artifactName}.png`
  );

  await input.page.screenshot({
    path: outputPath,
    fullPage: true
  });
};

export const assertBrowserValidationBuildOutput = async (
  buildOutputPath: string
): Promise<void> => {
  try {
    await access(buildOutputPath, FsConstants.F_OK);
  } catch {
    throw new Error(`Build output missing at ${buildOutputPath}. Run pnpm build before this validation.`);
  }
};

export const startPreviewServer = (projectRoot: string): ChildProcess =>
  spawn("pnpm", ["preview"], {
    cwd: projectRoot,
    stdio: "pipe",
    shell: process.platform === "win32"
  });

export const waitForHttpReady = async (
  url: string,
  input: WaitForConditionInput
): Promise<void> => {
  await waitForCondition(async () => {
    try {
      const response = await fetch(url);
      return response.ok;
    } catch {
      return false;
    }
  }, `HTTP readiness for ${url}`, input);
};

export const waitForCondition = async (
  check: () => Promise<boolean>,
  label: string,
  input: WaitForConditionInput
): Promise<void> => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < input.timeoutMs) {
    if (await check()) {
      return;
    }

    await delay(input.intervalMs);
  }

  throw new Error(`Timed out waiting for ${label}`);
};

export const stopProcess = async (child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null || child.pid === undefined) {
    return;
  }

  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore"
      });
      killer.on("exit", () => resolve());
      killer.on("error", () => resolve());
    });
    return;
  }

  child.kill("SIGTERM");
  await delay(250);
};

export const delay = async (ms: number): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
};
