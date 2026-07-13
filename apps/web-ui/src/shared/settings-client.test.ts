import { describe, expect, it } from "vitest";
import {
  parseSettingsResponse,
  parseProviderListResponse,
  parseProviderSettingsResponse,
} from "./settings-client.js";
import { createDefaultSettingsSnapshot } from "./settings-storage.js";

describe("settings client codecs", () => {
  it("parses the settings-only response without a workspace wrapper", () => {
    const settings = createDefaultSettingsSnapshot();

    expect(parseSettingsResponse({ settings })).toEqual({
      ...settings,
      serverConnection: {
        ...settings.serverConnection,
        authToken: "",
      },
    });
  });

  it("does not read an API auth token from the settings response", () => {
    const settings = createDefaultSettingsSnapshot();

    expect(
      parseSettingsResponse({
        settings: {
          ...settings,
          serverConnection: {
            ...settings.serverConnection,
            authToken: "server-secret",
          },
        },
      }).serverConnection.authToken,
    ).toBe("");
  });

  it("parses runtime providers and optional workflow scope selection metadata", () => {
    const parsed = parseProviderListResponse({
      providers: [
        {
          id: "codex-cli",
          displayName: "Codex CLI",
          type: "cli",
          auth: {
            type: "none",
          },
          settingsSchema: {
            type: "object",
          },
        },
      ],
      selection: {
        profileId: "coding",
        providerId: "codex-cli",
        updatedAt: "2026-04-28T10:00:00.000Z",
      },
    });

    expect(parsed.providers[0]?.id).toBe("codex-cli");
    expect(parsed.selection?.profileId).toBe("coding");
  });

  it("parses provider settings update responses", () => {
    const parsed = parseProviderSettingsResponse({
      settings: {
        profileId: "coding",
        providerId: "codex-cli",
        config: {
          command: "codex",
        },
        updatedAt: "2026-04-28T11:00:00.000Z",
      },
    });

    expect(parsed.providerId).toBe("codex-cli");
    expect(parsed.config["command"]).toBe("codex");
  });
});
