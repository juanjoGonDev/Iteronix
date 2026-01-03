import { describe, expect, it } from "vitest";
import { codexCliProviderDescriptor } from "../../../packages/adapters/src/codex-cli/provider";
import { ResultType } from "./result";
import {
  ProviderStoreErrorCode,
  createProviderStore
} from "./providers";

const ProjectId = "project-1";
const ProfileId = "default";
const UnknownProviderId = "unknown-provider";
const ConfigKey = "command";
const ConfigValue = "codex";

describe("provider store", () => {
  it("lists default providers", () => {
    const store = createProviderStore();
    const providers = store.listProviders();

    expect(providers).toHaveLength(1);
    expect(providers[0]?.id).toBe(codexCliProviderDescriptor.id);
  });

  it("selects and reads provider selection", () => {
    const store = createProviderStore();
    const selected = store.selectProvider({
      projectId: ProjectId,
      profileId: ProfileId,
      providerId: codexCliProviderDescriptor.id
    });

    expect(selected.type).toBe(ResultType.Ok);
    if (selected.type === ResultType.Ok) {
      expect(selected.value.providerId).toBe(codexCliProviderDescriptor.id);
    }

    const selection = store.getSelection({
      projectId: ProjectId,
      profileId: ProfileId
    });

    expect(selection.type).toBe(ResultType.Ok);
    if (selection.type === ResultType.Ok) {
      expect(selection.value?.providerId).toBe(codexCliProviderDescriptor.id);
    }
  });

  it("rejects unknown provider selection", () => {
    const store = createProviderStore();
    const result = store.selectProvider({
      projectId: ProjectId,
      profileId: ProfileId,
      providerId: UnknownProviderId
    });

    expect(result.type).toBe(ResultType.Err);
    if (result.type === ResultType.Err) {
      expect(result.error.code).toBe(ProviderStoreErrorCode.NotFound);
    }
  });

  it("updates provider settings", () => {
    const store = createProviderStore();
    const result = store.updateSettings({
      projectId: ProjectId,
      profileId: ProfileId,
      providerId: codexCliProviderDescriptor.id,
      config: {
        [ConfigKey]: ConfigValue
      }
    });

    expect(result.type).toBe(ResultType.Ok);
    if (result.type === ResultType.Ok) {
      expect(result.value.config[ConfigKey]).toBe(ConfigValue);
    }
  });
});
