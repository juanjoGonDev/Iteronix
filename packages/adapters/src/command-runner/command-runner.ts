import { spawn } from "node:child_process";
import { basename } from "node:path";
import { ResultType, type Result } from "../../../domain/src/result";

export const CommandOutputSource = {
  Stdout: "stdout",
  Stderr: "stderr"
} as const;

export type CommandOutputSource =
  typeof CommandOutputSource[keyof typeof CommandOutputSource];

export const CommandRunnerErrorCode = {
  SpawnFailed: "spawn_failed"
} as const;

export type CommandRunnerErrorCode =
  typeof CommandRunnerErrorCode[keyof typeof CommandRunnerErrorCode];

export type CommandRunnerError = {
  code: CommandRunnerErrorCode;
  command: string;
  message: string;
};

export type CommandOutputEvent = {
  source: CommandOutputSource;
  text: string;
  timestamp: string;
};

export type CommandRunResult = {
  command: string;
  args: ReadonlyArray<string>;
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  startedAt: string;
  finishedAt: string;
};

export type CommandRunInput = {
  command: string;
  rootPath: string;
  cwd: string;
  args: ReadonlyArray<string>;
  onOutput?: (event: CommandOutputEvent) => void;
};

export type CommandRunner = {
  run: (
    input: CommandRunInput
  ) => Promise<Result<CommandRunResult, CommandRunnerError>>;
};

export const createCommandRunnerAdapter = (): CommandRunner => {
  const run = async (
    input: CommandRunInput
  ): Promise<Result<CommandRunResult, CommandRunnerError>> =>
    spawnCommand(input);

  return {
    run
  };
};

const spawnCommand = (
  input: CommandRunInput
): Promise<Result<CommandRunResult, CommandRunnerError>> =>
  new Promise((resolve) => {
    const startedAt = new Date().toISOString();
    const child = spawn(input.command, [...input.args], {
      cwd: input.cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: unknown) => {
      const text = toText(chunk);
      stdout += text;
      if (text.length > 0) {
        input.onOutput?.({
          source: CommandOutputSource.Stdout,
          text,
          timestamp: new Date().toISOString()
        });
      }
    });

    child.stderr.on("data", (chunk: unknown) => {
      const text = toText(chunk);
      stderr += text;
      if (text.length > 0) {
        input.onOutput?.({
          source: CommandOutputSource.Stderr,
          text,
          timestamp: new Date().toISOString()
        });
      }
    });

    child.once("error", (error: Error) => {
      resolve({
        type: ResultType.Err,
        error: {
          code: CommandRunnerErrorCode.SpawnFailed,
          command: basename(input.command),
          message: error.message
        }
      });
    });

    child.once("close", (code: number | null) => {
      resolve({
        type: ResultType.Ok,
        value: {
          command: basename(input.command),
          args: [...input.args],
          cwd: input.cwd,
          exitCode: code ?? 1,
          stdout,
          stderr,
          startedAt,
          finishedAt: new Date().toISOString()
        }
      });
    });
  });

const toText = (chunk: unknown): string => {
  if (typeof chunk === "string") {
    return chunk;
  }

  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk).toString("utf8");
  }

  return "";
};
