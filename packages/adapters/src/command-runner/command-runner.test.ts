import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import { ResultType } from "../../../domain/src/result";
import {
  CommandOutputSource,
  createCommandRunnerAdapter
} from "./command-runner";

describe("command runner adapter", () => {
  it("streams stdout and stderr while collecting the final result", async () => {
    const runner = createCommandRunnerAdapter();
    const outputs: Array<{ source: string; text: string }> = [];
    const cwd = process.cwd();

    const result = await runner.run({
      command: process.execPath,
      rootPath: cwd,
      cwd,
      args: [
        "-e",
        "process.stdout.write('alpha\\n'); process.stderr.write('beta\\n');"
      ],
      onOutput: (event) => {
        outputs.push({
          source: event.source,
          text: event.text
        });
      }
    });

    expect(result.type).toBe(ResultType.Ok);
    if (result.type !== ResultType.Ok) {
      return;
    }

    expect(result.value.command).toBe(basename(process.execPath));
    expect(result.value.exitCode).toBe(0);
    expect(result.value.stdout).toContain("alpha");
    expect(result.value.stderr).toContain("beta");
    expect(outputs.some((event) => event.source === CommandOutputSource.Stdout)).toBe(
      true
    );
    expect(outputs.some((event) => event.source === CommandOutputSource.Stderr)).toBe(
      true
    );
  });

  it("returns non-zero exit codes without treating them as adapter errors", async () => {
    const runner = createCommandRunnerAdapter();
    const cwd = process.cwd();

    const result = await runner.run({
      command: process.execPath,
      rootPath: cwd,
      cwd,
      args: [
        "-e",
        "process.stderr.write('boom\\n'); process.exit(2);"
      ]
    });

    expect(result.type).toBe(ResultType.Ok);
    if (result.type !== ResultType.Ok) {
      return;
    }

    expect(result.value.exitCode).toBe(2);
    expect(result.value.stderr).toContain("boom");
  });
});
