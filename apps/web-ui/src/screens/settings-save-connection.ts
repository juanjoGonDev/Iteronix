import type { ServerConnection } from "../shared/server-config.js";
import type {
  RuntimeProviderRecord,
  SettingsClient,
} from "../shared/settings-client.js";
import type { SettingsSnapshot } from "../shared/settings-storage.js";

type SettingsConnectionCheckClient = Pick<
  SettingsClient,
  "load" | "listProviders"
>;

export type CheckedSettingsConnection = {
  serverConnection: ServerConnection;
  settings: SettingsSnapshot;
  runtimeProviders: ReadonlyArray<RuntimeProviderRecord>;
};

export const checkSettingsConnection = async (
  serverConnection: ServerConnection,
  client: SettingsConnectionCheckClient,
): Promise<CheckedSettingsConnection> => {
  const settings = await client.load();
  const providerResponse = await client.listProviders();

  return {
    serverConnection,
    settings,
    runtimeProviders: providerResponse.providers,
  };
};

export const readSaveConnection = (
  candidate: ServerConnection,
  validatedConnection: ServerConnection | null,
): ServerConnection | null =>
  validatedConnection !== null &&
  candidate.serverUrl === validatedConnection.serverUrl &&
  candidate.authToken === validatedConnection.authToken
    ? candidate
    : null;
