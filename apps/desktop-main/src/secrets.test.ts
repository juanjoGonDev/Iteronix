import { describe, expect, it } from "vitest";
import { SecretErrorCode, SecretProviderType } from "./constants";
import { ResultType } from "./result";
import { createSecretStore } from "./secrets";

describe("createSecretStore", () => {
  it("falls back to memory store when no provider is supplied", async () => {
    const store = createSecretStore(null);

    expect(store.provider).toBe(SecretProviderType.Memory);

    const setResult = await store.setAuthToken("token");
    expect(setResult.type).toBe(ResultType.Ok);

    const getResult = await store.getAuthToken();
    expect(getResult.type).toBe(ResultType.Ok);
    if (getResult.type === ResultType.Ok) {
      expect(getResult.value).toBe("token");
    }
  });

  it("uses the provided keychain adapter", async () => {
    const provider = {
      getPassword: async () => "stored",
      setPassword: async () => {},
      deletePassword: async () => true
    };

    const store = createSecretStore(provider);

    expect(store.provider).toBe(SecretProviderType.Keychain);

    const getResult = await store.getAuthToken();
    expect(getResult.type).toBe(ResultType.Ok);
    if (getResult.type === ResultType.Ok) {
      expect(getResult.value).toBe("stored");
    }
  });

  it("rejects empty tokens", async () => {
    const store = createSecretStore(null);

    const result = await store.setAuthToken(" ");
    expect(result.type).toBe(ResultType.Err);
    if (result.type === ResultType.Err) {
      expect(result.error.code).toBe(SecretErrorCode.InvalidToken);
    }
  });
});
