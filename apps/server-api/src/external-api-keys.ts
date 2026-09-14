import {
  randomBytes,
  randomUUID,
  scrypt,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import {
  ExternalApiKeyScopeKind,
  type ExternalWorkflowOperation,
  type ExternalApiKeyRecord,
  type ExternalApiKeyScope,
} from "../../../packages/domain/src/external-api-keys";

const KeyPrefix = "itx_wf_";
const KeyVersion = "v1";
const KeySegmentSeparator = "_";
const HashPrefix = "scrypt";
const SaltBytes = 16;
const SecretBytes = 32;
const HashBytes = 64;
const ScryptMaxMemoryBytes = 64 * 1024 * 1024;

export const createExternalApiKey = (input: {
  name: string;
  scope: ExternalApiKeyScope;
  now: Date;
  operations?: ReadonlyArray<ExternalWorkflowOperation>;
  expiresAt?: string;
  rateLimitPerMinute?: number;
  id?: string;
}): { key: ExternalApiKeyRecord; plaintext: string } => {
  const id = input.id ?? randomUUID();
  const plaintext = `${KeyPrefix}${KeyVersion}${KeySegmentSeparator}${id}${KeySegmentSeparator}${randomBytes(SecretBytes).toString("base64url")}`;

  return {
    plaintext,
    key: {
      id,
      name: input.name.trim(),
      scope: normalizeScope(input.scope),
      secretHash: hashExternalApiKey(plaintext),
      createdAt: input.now.toISOString(),
      ...(input.operations ? { operations: input.operations } : {}),
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      ...(input.rateLimitPerMinute !== undefined
        ? { rateLimitPerMinute: input.rateLimitPerMinute }
        : {}),
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
  const verifier = readVerifier(secretHash);
  if (!verifier) {
    return false;
  }

  try {
    return timingSafeEqual(
      deriveKey(plaintext, verifier.salt),
      verifier.expected,
    );
  } catch {
    return false;
  }
};

export const readExternalApiKeyCredentialId = (
  plaintext: string,
): string | undefined => {
  const versionPrefix = `${KeyPrefix}${KeyVersion}${KeySegmentSeparator}`;
  if (!plaintext.startsWith(versionPrefix)) {
    return undefined;
  }
  const remainder = plaintext.slice(versionPrefix.length);
  const separatorIndex = remainder.indexOf(KeySegmentSeparator);
  if (separatorIndex <= 0 || separatorIndex === remainder.length - 1) {
    return undefined;
  }
  return remainder.slice(0, separatorIndex);
};

export const verifyExternalApiKeyAsync = async (
  plaintext: string,
  secretHash: string,
): Promise<boolean> => {
  const verifier = readVerifier(secretHash);
  if (!verifier) {
    return false;
  }

  try {
    return timingSafeEqual(
      await deriveKeyAsync(plaintext, verifier.salt),
      verifier.expected,
    );
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

const readVerifier = (
  secretHash: string,
): { salt: Buffer; expected: Buffer } | undefined => {
  const hashParts = secretHash.split("$");
  if (hashParts.length !== 3 || hashParts[0] !== HashPrefix) {
    return undefined;
  }
  const salt = Buffer.from(hashParts[1] ?? "", "base64url");
  const expected = Buffer.from(hashParts[2] ?? "", "base64url");
  return salt.length === SaltBytes && expected.length === HashBytes
    ? { salt, expected }
    : undefined;
};

const deriveKey = (plaintext: string, salt: Buffer): Buffer =>
  scryptSync(plaintext, salt, HashBytes, { maxmem: ScryptMaxMemoryBytes });

const deriveKeyAsync = (plaintext: string, salt: Buffer): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(
      plaintext,
      salt,
      HashBytes,
      { maxmem: ScryptMaxMemoryBytes },
      (error, derived) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derived);
      },
    );
  });

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
