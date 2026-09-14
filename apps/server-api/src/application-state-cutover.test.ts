import { describe, expect, it } from "vitest";
import {
  cutOverLegacyExternalApiKeys,
  createDefaultApplicationState,
} from "./application-state";
import { createPostgresApplicationStateStore } from "./postgres-application-state";

const Now = "2026-07-28T12:00:00.000Z";
const RevokedAt = "2026-07-28T11:00:00.000Z";

describe("legacy external credential cutover", () => {
  it("locks legacy state, imports each verifier, and removes hashes from persisted state", async () => {
    const state = createDefaultApplicationState();
    const legacyState = {
      ...state,
      externalApiKeys: [
        {
          id: "credential-1",
          name: "Legacy",
          scope: { kind: "all_workflows" as const },
          secretHash: "scrypt$salt$verifier",
          createdAt: Now,
        },
      ],
    };
    const queries: ReadonlyArray<unknown>[] = [];
    const client = {
      query: async (text: string, values?: ReadonlyArray<unknown>) => {
        queries.push(values ?? [text]);
        if (text.includes("FOR UPDATE")) {
          return { rows: [{ value: legacyState }] };
        }
        return { rows: [] };
      },
    };

    await expect(
      cutOverLegacyExternalApiKeys({ client, now: Now }),
    ).resolves.toMatchObject({
      externalApiKeys: [],
      revision: legacyState.revision + 1,
      updatedAt: Now,
    });

    expect(queries.some((values) => values.includes("application"))).toBe(true);
    expect(
      queries.some((values) => values.includes("scrypt$salt$verifier")),
    ).toBe(true);
    expect(
      queries.some((values) =>
        values.includes(
          JSON.stringify({
            ...legacyState,
            externalApiKeys: [],
            revision: legacyState.revision + 1,
            updatedAt: Now,
          }),
        ),
      ),
    ).toBe(true);
    expect(
      queries.some(
        (values) =>
          values.includes("migrate") &&
          values.includes("system") &&
          values.includes("legacy-cutover"),
      ),
    ).toBe(true);
  });

  it("does not re-import after a completed cutover", async () => {
    const state = createDefaultApplicationState();
    const queries: string[] = [];
    const client = {
      query: async (text: string) => {
        queries.push(text);
        return { rows: text.includes("FOR UPDATE") ? [{ value: state }] : [] };
      },
    };

    await expect(
      cutOverLegacyExternalApiKeys({ client, now: Now }),
    ).resolves.toEqual(state);

    expect(
      queries.some((text) =>
        text.includes("external_workflow_credential_verifiers"),
      ),
    ).toBe(false);
  });

  it("preserves a legacy credential revocation during cutover", async () => {
    const legacyState = {
      ...createDefaultApplicationState(),
      externalApiKeys: [
        {
          id: "credential-revoked",
          name: "Revoked legacy credential",
          scope: { kind: "all_workflows" as const },
          secretHash: "scrypt$salt$verifier",
          createdAt: Now,
          revokedAt: RevokedAt,
        },
      ],
    };
    const queries: Array<{ text: string; values: ReadonlyArray<unknown> }> = [];
    const client = {
      query: async (text: string, values?: ReadonlyArray<unknown>) => {
        queries.push({ text, values: values ?? [] });
        return {
          rows: text.includes("FOR UPDATE") ? [{ value: legacyState }] : [],
        };
      },
    };

    await cutOverLegacyExternalApiKeys({ client, now: Now });

    const importedCredential = queries.find((query) =>
      query.text.includes("INSERT INTO external_workflow_credentials"),
    );
    expect(importedCredential?.values).toContain(RevokedAt);
  });
});

it("makes a state loaded before cutover conflict instead of restoring legacy hashes", async () => {
  const baseline = createDefaultApplicationState();
  const legacyState = {
    ...baseline,
    revision: 7,
    externalApiKeys: [
      {
        id: "credential-1",
        name: "Legacy",
        scope: { kind: "all_workflows" as const },
        secretHash: "scrypt$salt$verifier",
        createdAt: Now,
      },
    ],
  };
  let persisted = legacyState;
  let databaseRevision = legacyState.revision;
  const client = {
    query: async (text: string, values?: ReadonlyArray<unknown>) => {
      if (text.includes("SELECT value, revision")) {
        return { rows: [{ value: persisted, revision: databaseRevision }] };
      }
      if (text.includes("FOR UPDATE")) {
        return { rows: [{ value: persisted }] };
      }
      if (text.includes("SET value = $2::jsonb")) {
        const value = values?.[1];
        if (!value || typeof value !== "string") return { rows: [] };
        persisted = JSON.parse(value) as typeof legacyState;
        databaseRevision += 1;
        return { rows: [{ value: undefined, revision: databaseRevision }] };
      }
      if (text.includes("INSERT INTO app_state")) {
        const expectedRevision = values?.[3];
        return expectedRevision === databaseRevision
          ? { rows: [{ value: undefined, revision: databaseRevision + 1 }] }
          : { rows: [] };
      }
      return { rows: [] };
    },
  };
  const staleStore = createPostgresApplicationStateStore(client);
  const stale = await staleStore.load();

  await cutOverLegacyExternalApiKeys({ client, now: Now });

  await expect(staleStore.save(stale)).rejects.toThrow(
    "Application state revision conflict",
  );
  expect(persisted.externalApiKeys).toEqual([]);
});

it("uses a checked-out client and releases it after the legacy cutover", async () => {
  const state = createDefaultApplicationState();
  let released = false;
  const transaction = {
    query: async (text: string) => ({
      rows: text.includes("FOR UPDATE") ? [{ value: state }] : [],
    }),
    release: () => {
      released = true;
    },
  };
  const pool = {
    connect: async () => transaction,
    query: async () => {
      throw new Error("cutover must not use pool.query");
    },
  };

  await cutOverLegacyExternalApiKeys({ client: pool, now: Now });

  expect(released).toBe(true);
});
