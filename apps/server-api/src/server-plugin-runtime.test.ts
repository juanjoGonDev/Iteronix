import { describe, expect, it } from "vitest";
import {
  createProcessIsolatedPluginHost,
  createChildProcessReferencePluginHost,
  createTrustedPluginRegistry,
} from "./server-plugin-runtime";

const plugin = {
  id: "reference.echo",
  kind: "plugin" as const,
  name: "Reference echo",
  status: "enabled" as const,
  capabilities: ["tool-calls"] as const,
  permissions: ["tool.invoke"] as const,
  inputSchema: {
    id: "reference.echo.input",
    version: 1,
    schema: { type: "object" as const },
  },
  outputSchema: {
    id: "reference.echo.output",
    version: 1,
    schema: { type: "object" as const },
  },
  limits: { executions: 1, timeoutMs: 1000 },
  provenance: {
    source: "reference",
    artifactFingerprint: "reference-plugin-v1",
    registeredAt: "2026-07-21T00:00:00.000Z",
  },
  plugin: {
    runtime: "server" as const,
    isolation: "process" as const,
    auditEvents: [],
  },
};

describe("trusted server plugin registry", () => {
  it("runs the deterministic reference plugin in a child process", async () => {
    const host = createChildProcessReferencePluginHost();

    await expect(
      host.invoke({
        pluginId: "reference.echo",
        version: "1",
        input: { value: "isolated" },
        provenance: plugin.provenance,
      }),
    ).resolves.toEqual({ echo: { value: "isolated" } });
  });

  it("terminates an unresponsive child process deterministically", async () => {
    const host = createChildProcessReferencePluginHost({ timeoutMs: 1 });

    await expect(
      host.invoke({
        pluginId: "reference.echo",
        version: "1",
        input: {},
        provenance: plugin.provenance,
      }),
    ).rejects.toThrow("Plugin process timed out");
  });

  it("reports a crashed child process without exposing its internals", async () => {
    const host = createChildProcessReferencePluginHost();

    await expect(
      host.invoke({
        pluginId: "reference.crash",
        version: "1",
        input: {},
        provenance: plugin.provenance,
      }),
    ).rejects.toThrow("Plugin process exited unexpectedly");
  });

  it("executes only an enabled allowlisted version-pinned plugin through an isolated host", async () => {
    const executions: string[] = [];
    const timeouts: number[] = [];
    const registry = createTrustedPluginRegistry({
      allowedPluginIds: [plugin.id],
      host: createProcessIsolatedPluginHost({
        invoke: async (request) => {
          executions.push(request.pluginId);
          timeouts.push(request.timeoutMs ?? 0);
          return { echoed: request.input };
        },
      }),
    });

    registry.refresh([plugin]);
    await expect(
      registry.invoke({
        assetId: plugin.id,
        version: "1",
        input: { value: "ok" },
      }),
    ).resolves.toEqual({ echoed: { value: "ok" } });
    expect(executions).toEqual([plugin.id]);
    expect(timeouts).toEqual([plugin.limits.timeoutMs]);
  });

  it("rejects disabled, untrusted, and stale plugin pins before host invocation", async () => {
    const registry = createTrustedPluginRegistry({
      allowedPluginIds: [plugin.id],
      host: createProcessIsolatedPluginHost({
        invoke: async () => ({ ok: true }),
      }),
    });
    registry.refresh([{ ...plugin, status: "disabled" }]);

    await expect(
      registry.invoke({ assetId: plugin.id, version: "1", input: {} }),
    ).rejects.toThrow("unavailable");
    registry.refresh([{ ...plugin, id: "untrusted.plugin" }]);
    await expect(
      registry.invoke({ assetId: "untrusted.plugin", version: "1", input: {} }),
    ).rejects.toThrow("not allowlisted");
    registry.refresh([plugin]);
    await expect(
      registry.invoke({ assetId: plugin.id, version: "2", input: {} }),
    ).rejects.toThrow("pin does not match");
  });
});
