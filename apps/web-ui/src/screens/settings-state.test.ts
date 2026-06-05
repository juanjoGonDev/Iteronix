import { describe, expect, it } from "vitest";
import {
  ProviderKind,
  createProviderProfile,
  createProviderSyncRequests,
  updateProviderProfile
} from "./settings-state.js";

describe("settings state", () => {
  it("creates provider profiles with kind-specific defaults", () => {
    const codex = createProviderProfile(ProviderKind.CodexCli, "2026-04-28T10:00:00.000Z");
    const anthropic = createProviderProfile(ProviderKind.Anthropic, "2026-04-28T10:00:00.000Z");
    const custom = createProviderProfile(ProviderKind.Custom, "2026-04-28T10:00:00.000Z");

    expect(codex.command).toBe("codex");
    expect(codex.promptMode).toBe("stdin");
    expect(anthropic.endpointUrl).toBe("https://api.anthropic.com");
    expect(anthropic.apiKeyEnvVar).toBe("ANTHROPIC_API_KEY");
    expect(custom.endpointUrl).toBe("");
  });

  it("updates provider profile fields and refreshes updatedAt", () => {
    const createdAt = "2026-04-28T10:00:00.000Z";
    const updatedAt = "2026-04-28T11:00:00.000Z";
    const profile = createProviderProfile(ProviderKind.OpenAI, createdAt);

    const updated = updateProviderProfile(
      profile,
      {
        name: "Planner",
        modelId: "gpt-5",
        endpointUrl: "https://example.com/openai",
        apiKey: "secret",
        apiKeyEnvVar: "LOCAL_AI_API_KEY"
      },
      updatedAt
    );

    expect(updated.name).toBe("Planner");
    expect(updated.modelId).toBe("gpt-5");
    expect(updated.apiKey).toBe("secret");
    expect(updated.apiKeyEnvVar).toBe("LOCAL_AI_API_KEY");
    expect(updated.updatedAt).toBe(updatedAt);
  });

  it("creates backend sync requests for runtime-backed provider profiles", () => {
    const createdAt = "2026-04-28T10:00:00.000Z";
    const codex = updateProviderProfile(
      createProviderProfile(ProviderKind.CodexCli, createdAt),
      {
        name: "Codex coding",
        modelId: "gpt-5-codex",
        command: "codex",
        promptMode: "arg"
      },
      "2026-04-28T11:00:00.000Z"
    );
    const openai = updateProviderProfile(
      createProviderProfile(ProviderKind.OpenAI, createdAt),
      {
        modelId: "gpt-5"
      },
      "2026-04-28T11:00:00.000Z"
    );
    const custom = updateProviderProfile(
      createProviderProfile(ProviderKind.Custom, createdAt),
      {
        name: "Local gateway",
        modelId: "llama-3.1",
        endpointUrl: "http://192.168.1.223:3001",
        apiKey: "secret"
      },
      "2026-04-28T11:00:00.000Z"
    );

    const requests = createProviderSyncRequests([codex, openai, custom], "project-1");

    expect(requests).toEqual([
      {
        profileId: codex.id,
        providerId: ProviderKind.CodexCli,
        projectId: "project-1",
        config: {
          command: "codex",
          promptMode: "arg",
          models: [
            {
              id: "gpt-5-codex",
              displayName: "gpt-5-codex"
            }
          ]
        }
      },
      {
        profileId: openai.id,
        providerId: ProviderKind.OpenAI,
        projectId: "project-1",
        config: {
          endpointUrl: "https://api.openai.com/v1",
          apiKeyEnvVar: "OPENAI_API_KEY",
          models: [
            {
              id: "gpt-5",
              displayName: "gpt-5"
            }
          ]
        }
      },
      {
        profileId: custom.id,
        providerId: ProviderKind.Custom,
        projectId: "project-1",
        config: {
          endpointUrl: "http://192.168.1.223:3001",
          apiKey: "secret",
          models: [
            {
              id: "llama-3.1",
              displayName: "llama-3.1"
            }
          ]
        }
      }
    ]);
  });
});
