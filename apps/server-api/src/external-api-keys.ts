import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import {
  ExternalApiKeyScopeKind,
  type ExternalApiKeyRecord,
  type ExternalApiKeyScope,
} from "../../../packages/domain/src/external-api-keys";

const KeyPrefix = "itx_wf_";
const HashPrefix = "scrypt";
const SaltBytes = 16;
const SecretBytes = 32;
const HashBytes = 64;

export const createExternalApiKey = (input: {
  name: string;
  scope: ExternalApiKeyScope;
  now: Date;
}): { key: ExternalApiKeyRecord; plaintext: string } => {
  const plaintext = `${KeyPrefix}${randomBytes(SecretBytes).toString("base64url")}`;

  return {
    plaintext,
    key: {
      id: randomUUID(),
      name: input.name.trim(),
      scope: normalizeScope(input.scope),
      secretHash: hashExternalApiKey(plaintext),
      createdAt: input.now.toISOString(),
    },
  };
};

export const hashExternalApiKey = (plaintext: string): string => {
  const salt = randomBytes(SaltBytes);
  const derived = deriveKey(plaintext, salt);
  return [
    HashPrefix,
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
};

export const verifyExternalApiKey = (
  plaintext: string,
  secretHash: string,
): boolean => {
  const hashParts = secretHash.split("$");
  if (hashParts.length !== 3 || hashParts[0] !== HashPrefix) {
    return false;
  }

  try {
    const salt = Buffer.from(hashParts[1] ?? "", "base64url");
    const expected = Buffer.from(hashParts[2] ?? "", "base64url");
    if (salt.length !== SaltBytes || expected.length !== HashBytes) {
      return false;
    }

    return timingSafeEqual(deriveKey(plaintext, salt), expected);
  } catch {
    return false;
  }
};

export const findVerifiedExternalApiKey = (
  keys: ReadonlyArray<ExternalApiKeyRecord>,
  plaintext: string,
): ExternalApiKeyRecord | undefined =>
  keys.find(
    (key) => !key.revokedAt && verifyExternalApiKey(plaintext, key.secretHash),
  );

const deriveKey = (plaintext: string, salt: Buffer): Buffer =>
  scryptSync(plaintext, salt, HashBytes, { maxmem: 64 * 1024 * 1024 });

const normalizeScope = (scope: ExternalApiKeyScope): ExternalApiKeyScope => {
  if (scope.kind === ExternalApiKeyScopeKind.AllWorkflows) {
    return scope;
  }

  return {
    kind: ExternalApiKeyScopeKind.SelectedWorkflows,
    workflowIds: [
      ...new Set(scope.workflowIds.map((workflowId) => workflowId.trim())),
    ].filter((workflowId) => workflowId.length > 0),
  };
};
