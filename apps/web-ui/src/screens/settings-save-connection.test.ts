import { describe, expect, it } from "vitest";
import { ProviderKind, createProviderProfile } from "./settings-state.js";
import {
  checkSettingsConnection,
  readSaveConnection,
} from "./settings-save-connection.js";
import { createDefaultSettingsSnapshot } from "../shared/settings-storage.js";

describe("settings save connection", () => {
  it("rejects a changed candidate until that exact connection was checked", () => {
    const validatedConnection = {
      serverUrl: "http://localhost:4001",
      authToken: "previous-token",
    };
    const changedCandidate = {
      serverUrl: "http://localhost:4002",
      authToken: "next-token",
    };

    expect(
      readSaveConnection(changedCandidate, validatedConnection),
    ).toBeNull();
  });

  it("returns the checked candidate for every save request", () => {
    const connection = {
      serverUrl: "http://localhost:4001",
      authToken: "current-token",
    };

    expect(readSaveConnection(connection, connection)).toEqual(connection);
  });

  it("hydrates the remote snapshot before persisting a checked local connection", async () => {
    const connection = {
      serverUrl: "https://iteronix.example.com",
      authToken: "browser-only-token",
    };
    const remoteProfile = createProviderProfile(
      ProviderKind.OpenAI,
      "2026-07-13T22:00:00.000Z",
    );
    const remoteSettings = {
      ...createDefaultSettingsSnapshot(),
      providerProfiles: [
        {
          ...remoteProfile,
          name: "Remote planner",
          modelId: "gpt-5",
        },
      ],
      workflowLimits: {
        infiniteLoops: true,
        maxLoops: 80,
        externalCalls: false,
      },
    };
    const calls: string[] = [];

    const checked = await checkSettingsConnection(connection, {
      load: async () => {
        calls.push("load");
        return remoteSettings;
      },
      listProviders: async () => {
        calls.push("listProviders");
        return {
          providers: [],
        };
      },
    });

    expect(calls).toEqual(["load", "listProviders"]);
    expect(checked.serverConnection).toEqual(connection);
    expect(checked.settings.providerProfiles).toEqual(
      remoteSettings.providerProfiles,
    );
    expect(checked.settings.workflowLimits).toEqual(
      remoteSettings.workflowLimits,
    );
  });
});
