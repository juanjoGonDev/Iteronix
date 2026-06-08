import { describe, expect, it } from "vitest";
import {
  parseProviderListResponse,
  parseProviderSettingsResponse
} from "./settings-client.js";

describe("settings client codecs", () => {
  it("parses runtime providers and optional project selection metadata", () => {
    const parsed = parseProviderListResponse({
      providers: [
        {
          id: "codex-cli",
          displayName: "Codex CLI",
          type: "cli",
          auth: {
            type: "none"
          },
          settingsSchema: {
            type: "object"
          }
        }
      ],
      selection: {
        projectId: "project-1",
        profileId: "coding",
        providerId: "codex-cli",
        updatedAt: "2026-04-28T10:00:00.000Z"
      }
    });

    expect(parsed.providers[0]?.id).toBe("codex-cli");
    expect(parsed.selection?.profileId).toBe("coding");
  });

  it("parses provider settings update responses", () => {
    const parsed = parseProviderSettingsResponse({
      settings: {
        projectId: "project-1",
        profileId: "coding",
        providerId: "codex-cli",
        config: {
          command: "codex"
        },
        updatedAt: "2026-04-28T11:00:00.000Z"
      }
    });

    expect(parsed.providerId).toBe("codex-cli");
    expect(parsed.config["command"]).toBe("codex");
  });
});
