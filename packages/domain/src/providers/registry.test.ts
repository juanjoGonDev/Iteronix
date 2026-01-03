import { describe, expect, it } from "vitest";
import { LLMProviderType } from "../llm/capabilities";
import { ResultType } from "../result";
import { JsonSchemaType } from "./schema";
import {
  ProviderAuthType,
  ProviderRegistryErrorCode,
  createProviderRegistry,
  type ProviderDescriptor
} from "./registry";

const SuiteName = "provider registry";
const CaseList = "lists initial providers";
const CaseGet = "gets provider by id";
const CaseMissing = "returns error for missing provider";
const CaseRegister = "registers provider immutably";
const CaseDuplicate = "rejects duplicate provider id";
const ProviderIdOne = "provider-1";
const ProviderIdTwo = "provider-2";
const ProviderNameOne = "Provider One";
const ProviderNameTwo = "Provider Two";
const SchemaFieldApiKey = "apiKey";

const baseCapabilities = {
  streaming: true,
  jsonSchemaEnforcement: false,
  tokenUsage: true,
  toolCalls: false
};

const baseSchema = {
  type: JsonSchemaType.Object,
  properties: {
    [SchemaFieldApiKey]: {
      type: JsonSchemaType.String
    }
  },
  required: [SchemaFieldApiKey]
};

const createDescriptor = (
  id: string,
  displayName: string
): ProviderDescriptor => ({
  id,
  displayName,
  type: LLMProviderType.Cli,
  capabilities: baseCapabilities,
  auth: {
    type: ProviderAuthType.None
  },
  settingsSchema: baseSchema
});

describe(SuiteName, () => {
  it(CaseList, () => {
    const registry = createProviderRegistry([
      createDescriptor(ProviderIdOne, ProviderNameOne),
      createDescriptor(ProviderIdTwo, ProviderNameTwo)
    ]);

    const list = registry.list();
    expect(list).toHaveLength(2);
    expect(list[0]?.id).toBe(ProviderIdOne);
  });

  it(CaseGet, () => {
    const registry = createProviderRegistry([
      createDescriptor(ProviderIdOne, ProviderNameOne)
    ]);

    const result = registry.get(ProviderIdOne);
    expect(result.type).toBe(ResultType.Ok);
    if (result.type === ResultType.Ok) {
      expect(result.value.id).toBe(ProviderIdOne);
    }
  });

  it(CaseMissing, () => {
    const registry = createProviderRegistry();
    const result = registry.get(ProviderIdOne);

    expect(result.type).toBe(ResultType.Err);
    if (result.type === ResultType.Err) {
      expect(result.error.code).toBe(ProviderRegistryErrorCode.NotFound);
    }
  });

  it(CaseRegister, () => {
    const registry = createProviderRegistry([
      createDescriptor(ProviderIdOne, ProviderNameOne)
    ]);
    const result = registry.register(
      createDescriptor(ProviderIdTwo, ProviderNameTwo)
    );

    expect(result.type).toBe(ResultType.Ok);
    if (result.type === ResultType.Ok) {
      expect(result.value.list()).toHaveLength(2);
      expect(registry.list()).toHaveLength(1);
    }
  });

  it(CaseDuplicate, () => {
    const registry = createProviderRegistry([
      createDescriptor(ProviderIdOne, ProviderNameOne)
    ]);
    const result = registry.register(
      createDescriptor(ProviderIdOne, ProviderNameOne)
    );

    expect(result.type).toBe(ResultType.Err);
    if (result.type === ResultType.Err) {
      expect(result.error.code).toBe(ProviderRegistryErrorCode.DuplicateId);
    }
  });
});
