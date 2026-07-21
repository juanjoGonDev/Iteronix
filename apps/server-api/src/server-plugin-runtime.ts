import { spawn } from "node:child_process";
import {
  PluginRuntimeKind,
  type ArtifactProvenance,
} from "../../../packages/domain/src/agent-tool-contracts";
import type { JsonValue } from "../../../packages/domain/src/governance-validation";
import {
  AssetKind,
  AssetStatus,
  type EditableAssetRecord,
} from "./editable-assets";

type ServerPluginBinding = {
  assetId: string;
  version: string;
};

export type ProcessIsolatedPluginHost = {
  invoke: (input: {
    pluginId: string;
    version: string;
    input: JsonValue;
    provenance: ArtifactProvenance;
    timeoutMs?: number;
  }) => Promise<JsonValue>;
};

export type TrustedPluginRegistry = {
  refresh: (assets: ReadonlyArray<EditableAssetRecord>) => void;
  isAllowed: (assetId: string) => boolean;
  invoke: (
    input: ServerPluginBinding & { input: JsonValue },
  ) => Promise<JsonValue>;
};

const ReferencePluginTimeoutMs = 1_000;
const ReferencePluginProgram =
  "let source='';process.stdin.setEncoding('utf8');process.stdin.on('data',(chunk)=>{source+=chunk});process.stdin.on('end',()=>{const request=JSON.parse(source);if(request.pluginId==='reference.crash'){process.exitCode=1;return}process.stdout.write(JSON.stringify({echo:request.input}))})";

export const createProcessIsolatedPluginHost = (input: {
  invoke: ProcessIsolatedPluginHost["invoke"];
}): ProcessIsolatedPluginHost => ({ invoke: input.invoke });

export const createChildProcessReferencePluginHost = (input?: {
  timeoutMs?: number;
}): ProcessIsolatedPluginHost => ({
  invoke: async (request) =>
    invokeReferencePluginProcess(
      request,
      request.timeoutMs ?? input?.timeoutMs ?? ReferencePluginTimeoutMs,
    ),
});

export const createTrustedPluginRegistry = (input: {
  allowedPluginIds: ReadonlyArray<string>;
  host: ProcessIsolatedPluginHost;
}): TrustedPluginRegistry => {
  const allowlist = new Set(input.allowedPluginIds);
  let plugins = new Map<string, EditableAssetRecord>();
  return {
    refresh: (assets) => {
      plugins = new Map(
        assets
          .filter(isRunnablePlugin)
          .filter((asset) => allowlist.has(asset.id))
          .map((asset) => [asset.id, asset]),
      );
    },
    isAllowed: (assetId) => allowlist.has(assetId),
    invoke: async (request) => {
      if (!allowlist.has(request.assetId)) {
        throw new Error("Plugin is not allowlisted.");
      }
      const plugin = plugins.get(request.assetId);
      if (!plugin) {
        throw new Error("Plugin is unavailable.");
      }
      if (request.version !== pluginVersion()) {
        throw new Error("Plugin pin does not match the persisted asset.");
      }
      return input.host.invoke({
        pluginId: plugin.id,
        version: request.version,
        input: request.input,
        provenance: plugin.provenance,
        timeoutMs: plugin.limits.timeoutMs,
      });
    },
  };
};

const pluginVersion = (): string => "1";

const isRunnablePlugin = (asset: EditableAssetRecord): boolean =>
  asset.kind === AssetKind.Plugin &&
  asset.status === AssetStatus.Enabled &&
  asset.plugin?.runtime === PluginRuntimeKind.Server &&
  asset.plugin.isolation === "process";

const invokeReferencePluginProcess = async (
  request: Parameters<ProcessIsolatedPluginHost["invoke"]>[0],
  timeoutMs: number,
): Promise<JsonValue> =>
  new Promise<JsonValue>((resolve, reject) => {
    const child = spawn(process.execPath, ["--eval", ReferencePluginProgram], {
      stdio: ["pipe", "pipe", "ignore"],
    });
    let output = "";
    let settled = false;
    const timeout = setTimeout(() => {
      child.kill();
      settle(reject, new Error("Plugin process timed out."));
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.once("error", () => {
      settle(reject, new Error("Plugin process could not start."));
    });
    child.once("close", (code) => {
      if (code !== 0) {
        settle(reject, new Error("Plugin process exited unexpectedly."));
        return;
      }
      const result = parsePluginOutput(output);
      result instanceof Error
        ? settle(reject, result)
        : settle(resolve, result);
    });
    child.stdin.end(JSON.stringify(request));

    function settle(
      complete: (value: JsonValue) => void,
      value: JsonValue,
    ): void;
    function settle(complete: (reason: Error) => void, value: Error): void;
    function settle(
      complete: ((value: JsonValue) => void) | ((reason: Error) => void),
      value: JsonValue | Error,
    ): void {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (value instanceof Error) {
        (complete as (reason: Error) => void)(value);
      } else {
        (complete as (value: JsonValue) => void)(value);
      }
    }
  });

const parsePluginOutput = (value: string): JsonValue | Error => {
  try {
    const parsed: unknown = JSON.parse(value);
    const json = toJsonValue(parsed);
    return json === undefined
      ? new Error("Plugin process returned invalid JSON.")
      : json;
  } catch {
    return new Error("Plugin process returned invalid JSON.");
  }
};

const toJsonValue = (value: unknown): JsonValue | undefined => {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    const output = value.map(toJsonValue);
    return output.every((entry) => entry !== undefined)
      ? (output as ReadonlyArray<JsonValue>)
      : undefined;
  }
  if (typeof value === "object" && value !== null) {
    const output: Record<string, JsonValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      const json = toJsonValue(entry);
      if (json === undefined) return undefined;
      output[key] = json;
    }
    return output;
  }
  return undefined;
};
