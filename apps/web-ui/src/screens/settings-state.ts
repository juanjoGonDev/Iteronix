export const ProviderKind = {
  CodexCli: "codex-cli",
  OpenAI: "openai",
  Anthropic: "anthropic",
  Ollama: "ollama",
  Custom: "custom"
} as const;

export type ProviderKind = typeof ProviderKind[keyof typeof ProviderKind];

export const ProviderPromptMode = {
  Stdin: "stdin",
  Arg: "arg"
} as const;

export type ProviderPromptMode =
  typeof ProviderPromptMode[keyof typeof ProviderPromptMode];

export type ProviderProfileRecord = {
  id: string;
  name: string;
  providerKind: ProviderKind;
  modelId: string;
  endpointUrl: string;
  apiKey: string;
  apiKeyEnvVar: string;
  command: string;
  promptMode: ProviderPromptMode;
  createdAt: string;
  updatedAt: string;
};

export type ProviderSyncRequest = {
  projectId: string;
  profileId: string;
  providerId: ProviderKind;
  config: Record<string, unknown>;
};

const ProviderDefaults: Record<ProviderKind, {
  name: string;
  endpointUrl: string;
  apiKey: string;
  apiKeyEnvVar: string;
  command: string;
  promptMode: ProviderPromptMode;
}> = {
  [ProviderKind.CodexCli]: {
    name: "Codex CLI",
    endpointUrl: "",
    apiKey: "",
    apiKeyEnvVar: "",
    command: "codex",
    promptMode: ProviderPromptMode.Stdin
  },
  [ProviderKind.OpenAI]: {
    name: "OpenAI",
    endpointUrl: "https://api.openai.com/v1",
    apiKey: "",
    apiKeyEnvVar: "OPENAI_API_KEY",
    command: "",
    promptMode: ProviderPromptMode.Stdin
  },
  [ProviderKind.Anthropic]: {
    name: "Anthropic",
    endpointUrl: "https://api.anthropic.com",
    apiKey: "",
    apiKeyEnvVar: "ANTHROPIC_API_KEY",
    command: "",
    promptMode: ProviderPromptMode.Stdin
  },
  [ProviderKind.Ollama]: {
    name: "Ollama",
    endpointUrl: "http://localhost:11434",
    apiKey: "",
    apiKeyEnvVar: "",
    command: "",
    promptMode: ProviderPromptMode.Stdin
  },
  [ProviderKind.Custom]: {
    name: "Custom",
    endpointUrl: "",
    apiKey: "",
    apiKeyEnvVar: "",
    command: "",
    promptMode: ProviderPromptMode.Stdin
  }
};

export const createDefaultProviderProfiles = (): ReadonlyArray<ProviderProfileRecord> => [
  createProviderProfile(ProviderKind.CodexCli)
];

export const createProviderProfile = (
  kind: ProviderKind,
  timestamp: string = new Date().toISOString()
): ProviderProfileRecord => {
  const defaults = ProviderDefaults[kind];

  return {
    id: crypto.randomUUID(),
    name: defaults.name,
    providerKind: kind,
    modelId: "",
    endpointUrl: defaults.endpointUrl,
    apiKey: defaults.apiKey,
    apiKeyEnvVar: defaults.apiKeyEnvVar,
    command: defaults.command,
    promptMode: defaults.promptMode,
    createdAt: timestamp,
    updatedAt: timestamp
  };
};

export const updateProviderProfile = (
  profile: ProviderProfileRecord,
  patch: Partial<ProviderProfileRecord>,
  timestamp: string = new Date().toISOString()
): ProviderProfileRecord => {
  const nextKind = patch.providerKind ?? profile.providerKind;
  const defaults = ProviderDefaults[nextKind];

  const normalizedProfile = normalizeProviderProfile({
    ...profile,
    ...patch,
    providerKind: nextKind,
    endpointUrl: patch.endpointUrl ?? (nextKind === profile.providerKind ? profile.endpointUrl : defaults.endpointUrl),
    apiKey: patch.apiKey ?? (nextKind === profile.providerKind ? profile.apiKey : defaults.apiKey),
    apiKeyEnvVar: patch.apiKeyEnvVar ?? (nextKind === profile.providerKind ? profile.apiKeyEnvVar : defaults.apiKeyEnvVar),
    command: patch.command ?? (nextKind === profile.providerKind ? profile.command : defaults.command),
    promptMode: patch.promptMode ?? (nextKind === profile.providerKind ? profile.promptMode : defaults.promptMode),
    updatedAt: timestamp
  });

  return normalizedProfile ?? {
      ...profile,
      ...patch,
      providerKind: nextKind,
      endpointUrl: patch.endpointUrl ?? (nextKind === profile.providerKind ? profile.endpointUrl : defaults.endpointUrl),
      apiKey: patch.apiKey ?? (nextKind === profile.providerKind ? profile.apiKey : defaults.apiKey),
      apiKeyEnvVar: patch.apiKeyEnvVar ?? (nextKind === profile.providerKind ? profile.apiKeyEnvVar : defaults.apiKeyEnvVar),
      command: patch.command ?? (nextKind === profile.providerKind ? profile.command : defaults.command),
      promptMode: patch.promptMode ?? (nextKind === profile.providerKind ? profile.promptMode : defaults.promptMode),
      updatedAt: timestamp
  };
};

export const normalizeProviderProfiles = (
  value: unknown
): ReadonlyArray<ProviderProfileRecord> => {
  if (!Array.isArray(value)) {
    return [];
  }

  const profiles: ProviderProfileRecord[] = [];

  for (const entry of value) {
    const profile = normalizeProviderProfile(entry);
    if (!profile) {
      continue;
    }

    if (!profiles.some((item) => item.id === profile.id)) {
      profiles.push(profile);
    }
  }

  return profiles;
};

export const createProviderSyncRequests = (
  profiles: ReadonlyArray<ProviderProfileRecord>,
  projectId: string
): ReadonlyArray<ProviderSyncRequest> =>
  profiles
    .filter((profile) =>
      profile.providerKind === ProviderKind.CodexCli ||
      profile.providerKind === ProviderKind.OpenAI ||
      profile.providerKind === ProviderKind.Ollama ||
      profile.providerKind === ProviderKind.Custom
    )
    .map((profile) => ({
      projectId,
      profileId: profile.id,
      providerId: readRuntimeProviderId(profile.providerKind),
      config: createRuntimeProviderConfig(profile)
    }));

const createRuntimeProviderConfig = (
  profile: ProviderProfileRecord
): Record<string, unknown> => {
  if (profile.providerKind !== ProviderKind.CodexCli) {
    const config: Record<string, unknown> = {
      endpointUrl: profile.endpointUrl
    };

    if (profile.apiKey.length > 0) {
      config["apiKey"] = profile.apiKey;
    }

    if (profile.apiKeyEnvVar.length > 0) {
      config["apiKeyEnvVar"] = profile.apiKeyEnvVar;
    }

    if (profile.modelId.length > 0) {
      config["models"] = [
        {
          id: profile.modelId,
          displayName: profile.modelId
        }
      ];
    }

    return config;
  }

  const config: Record<string, unknown> = {
    command: profile.command,
    promptMode: profile.promptMode
  };

  if (profile.modelId.length > 0) {
    config["models"] = [
      {
        id: profile.modelId,
        displayName: profile.modelId
      }
    ];
  }

  return config;
};

const readRuntimeProviderId = (providerKind: ProviderKind): ProviderKind => {
  return providerKind;
};

const normalizeProviderProfile = (
  value: unknown
): ProviderProfileRecord | null => {
  if (!isRecord(value)) {
    return null;
  }

  const providerKind = readProviderKind(value["providerKind"]);
  if (!providerKind) {
    return null;
  }

  const defaults = ProviderDefaults[providerKind];
  const id = readString(value["id"]);
  const createdAt = readString(value["createdAt"]);
  const updatedAt = readString(value["updatedAt"]);

  return {
    id: id.length > 0 ? id : crypto.randomUUID(),
    name: readString(value["name"]) || defaults.name,
    providerKind,
    modelId: readString(value["modelId"]),
    endpointUrl: readString(value["endpointUrl"]) || defaults.endpointUrl,
    apiKey: readString(value["apiKey"]) || defaults.apiKey,
    apiKeyEnvVar: readString(value["apiKeyEnvVar"]) || defaults.apiKeyEnvVar,
    command: readString(value["command"]) || defaults.command,
    promptMode: readPromptMode(value["promptMode"]) ?? defaults.promptMode,
    createdAt: createdAt.length > 0 ? createdAt : new Date().toISOString(),
    updatedAt: updatedAt.length > 0 ? updatedAt : new Date().toISOString()
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const readString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const readProviderKind = (value: unknown): ProviderKind | null => {
  if (
    value === ProviderKind.CodexCli ||
    value === ProviderKind.OpenAI ||
    value === ProviderKind.Anthropic ||
    value === ProviderKind.Ollama ||
    value === ProviderKind.Custom
  ) {
    return value;
  }

  return null;
};

const readPromptMode = (value: unknown): ProviderPromptMode | null => {
  if (value === ProviderPromptMode.Arg || value === ProviderPromptMode.Stdin) {
    return value;
  }

  return null;
};
