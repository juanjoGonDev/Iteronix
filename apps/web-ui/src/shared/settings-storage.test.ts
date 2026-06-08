import { describe, expect, it } from "vitest";
import {
  DefaultSettingsProfileId,
  ProviderKind,
  createSettingsStorage,
  readSettingsSnapshot,
  writeSettingsSnapshot
} from "./settings-storage.js";

const createMemoryStorage = () => {
  const values = new Map<string, string>();

  return {
    getItem: (key: string): string | null => values.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      values.set(key, value);
    }
  };
};

describe("settings storage", () => {
  it("reads defaults when storage is empty", () => {
    const storage = createMemoryStorage();

    const snapshot = readSettingsSnapshot(storage);

    expect(snapshot.profileId).toBe(DefaultSettingsProfileId);
    expect(snapshot.providerProfiles).toHaveLength(1);
    expect(snapshot.providerProfiles[0]?.providerKind).toBe(ProviderKind.CodexCli);
    expect(snapshot.workflowLimits.maxLoops).toBe(50);
    expect(snapshot.notifications.soundEnabled).toBe(true);
    expect(snapshot.serverConnection.serverUrl).toBe("http://localhost:4000");
    expect(snapshot.serverConnection.authToken).toBe("dev-token");
  });

  it("persists settings without storing secrets", () => {
    const storage = createMemoryStorage();
    const settings = createSettingsStorage(storage);
    const saved = writeSettingsSnapshot(
      {
        profileId: "coding",
        providerProfiles: [
          {
            id: "profile-openai",
            name: "OpenAI planner",
            providerKind: ProviderKind.OpenAI,
            modelId: "gpt-5",
            endpointUrl: "https://api.openai.com/v1",
            apiKey: "secret-api-key",
            apiKeyEnvVar: "LOCAL_AI_API_KEY",
            command: "",
            promptMode: "stdin",
            createdAt: "2026-04-28T10:00:00.000Z",
            updatedAt: "2026-04-28T10:00:00.000Z"
          }
        ],
        workflowLimits: {
          infiniteLoops: true,
          maxLoops: 80,
          externalCalls: false
        },
        notifications: {
          soundEnabled: false,
          webhookUrl: "https://example.com/webhook"
        },
        serverConnection: {
          serverUrl: "https://server.example.com",
          authToken: "server-token"
        }
      },
      storage
    );

    const reloaded = settings.load();

    expect(saved.profileId).toBe("coding");
    expect(reloaded.providerProfiles[0]?.name).toBe("OpenAI planner");
    expect(reloaded.providerProfiles[0]?.apiKey).toBe("secret-api-key");
    expect(reloaded.providerProfiles[0]?.apiKeyEnvVar).toBe("LOCAL_AI_API_KEY");
    expect(reloaded.workflowLimits.infiniteLoops).toBe(true);
    expect(reloaded.notifications.webhookUrl).toBe("https://example.com/webhook");
    expect(reloaded.serverConnection.serverUrl).toBe("https://server.example.com");
    expect(reloaded.serverConnection.authToken).toBe("server-token");
    expect(JSON.stringify(reloaded)).toContain("\"apiKey\":\"secret-api-key\"");
  });

  it("falls back to defaults when persisted storage is invalid", () => {
    const storage = createMemoryStorage();
    storage.setItem("iteronix_settings_snapshot", "{not-json");

    const snapshot = readSettingsSnapshot(storage);

    expect(snapshot.profileId).toBe(DefaultSettingsProfileId);
    expect(snapshot.providerProfiles).toHaveLength(1);
  });
});
