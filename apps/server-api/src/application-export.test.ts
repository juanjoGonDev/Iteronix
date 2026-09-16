import { describe, expect, it } from "vitest";
import {
  ApplicationImportErrorCode,
  exportApplicationState,
  importApplicationState,
} from "./application-export";
import { legacyApplicationStateFixture } from "./fixtures/legacy-application-state";
import { createPostgresApplicationStateStore } from "./postgres-application-state";

describe("application state export and import", () => {
  it("upgrades a legacy workspace fixture and persists every representative record", async () => {
    expect(importApplicationState(legacyApplicationStateFixture).type).toBe(
      "ok",
    );
    const exported = exportApplicationState({
      application: legacyApplicationStateFixture,
      exportedAt: "2026-07-16T12:00:00.000Z",
    });
    const imported = importApplicationState(exported);

    expect(imported.type).toBe("ok");
    if (imported.type !== "ok") {
      return;
    }

    const client = createFixtureStateClient(legacyApplicationStateFixture);
    const store = createPostgresApplicationStateStore(client);
    const legacy = await store.load();
    await store.save(imported.value);
    const reloaded = await store.load();

    expect(legacy.revision).toBe(7);
    expect(reloaded.workflows).toEqual(imported.value.workflows);
    expect(reloaded.workflows.definitions[0]?.nodes).toHaveLength(2);
    expect(reloaded.workflows.definitions[0]?.edges).toHaveLength(1);
    expect(reloaded.workflows.executions[0]?.nodeRuns).toHaveLength(1);
    expect(reloaded.workflows.executions[0]?.nodeRuns[0]?.alerts).toHaveLength(
      1,
    );
    expect(
      reloaded.workflows.executions[0]?.nodeRuns[0]?.guardrailFindings,
    ).toHaveLength(1);
    expect(reloaded.workflows.assets[0]?.scope).toBe("global");
    expect(reloaded.externalApiKeys).toEqual(imported.value.externalApiKeys);
    expect(reloaded.settings).toEqual(imported.value.settings);
    expect(reloaded.providerSelections).toEqual(
      imported.value.providerSelections,
    );
    expect(reloaded.providerSettings).toEqual(imported.value.providerSettings);
    expect(client.loadedKeys).toEqual([
      "application",
      "workspace",
      "application",
    ]);
    expect(client.writtenKeys).toEqual(["application"]);
  });

  it("does not expose plaintext secret values in an application export", () => {
    const exported = exportApplicationState({
      application: legacyApplicationStateFixture,
      exportedAt: "2026-07-16T12:00:00.000Z",
    });

    expect(JSON.stringify(exported)).not.toContain("plaintext-secret");
    expect(JSON.stringify(exported)).not.toContain("access-token-secret");
    expect(JSON.stringify(exported)).not.toContain("refresh-token-secret");
    expect(JSON.stringify(exported)).not.toContain("client-secret-value");
    expect(JSON.stringify(exported)).not.toContain("webhook-token-secret");
    expect(JSON.stringify(exported)).toContain("hashed-external-api-key");
  });

  it("rejects unknown schemas, checksum mismatches, and malformed untrusted payloads", () => {
    const exported = exportApplicationState({
      application: legacyApplicationStateFixture,
      exportedAt: "2026-07-16T12:00:00.000Z",
    });

    const definition = exported.application.workflows.definitions[0];
    const node = definition?.nodes[0];
    const edge = definition?.edges[0];
    const execution = exported.application.workflows.executions[0];
    const nodeRun = execution?.nodeRuns[0];
    if (!definition || !node || !edge || !execution || !nodeRun) {
      throw new Error(
        "The representative fixture must contain nested workflow data.",
      );
    }
    expect(importApplicationState({ ...exported, schemaVersion: 99 })).toEqual({
      type: "err",
      error: { code: ApplicationImportErrorCode.UnknownSchema },
    });
    expect(
      importApplicationState({ ...exported, checksum: "invalid" }),
    ).toEqual({
      type: "err",
      error: { code: ApplicationImportErrorCode.ChecksumMismatch },
    });
    expect(importApplicationState({})).toEqual({
      type: "err",
      error: { code: ApplicationImportErrorCode.MalformedPayload },
    });
    expect(importApplicationState({ ...exported, application: {} })).toEqual({
      type: "err",
      error: { code: ApplicationImportErrorCode.MalformedPayload },
    });
    expect(
      importApplicationState({
        ...exported,
        application: {
          ...exported.application,
          workflows: {
            ...exported.application.workflows,
            definitions: [null],
          },
        },
      }),
    ).toEqual({
      type: "err",
      error: { code: ApplicationImportErrorCode.MalformedPayload },
    });
    expect(
      importApplicationState({
        ...exported,
        application: {
          ...exported.application,
          workflows: {
            ...exported.application.workflows,
            definitions: [
              {
                ...definition,
                nodes: [{ ...node, outputPorts: [{}] }],
              },
            ],
          },
        },
      }),
    ).toEqual({
      type: "err",
      error: { code: ApplicationImportErrorCode.MalformedPayload },
    });
    expect(
      importApplicationState({
        ...exported,
        application: {
          ...exported.application,
          workflows: {
            ...exported.application.workflows,
            definitions: [
              {
                ...definition,
                nodes: [{ ...node, config: { provider: {} } }],
              },
            ],
          },
        },
      }),
    ).toEqual({
      type: "err",
      error: { code: ApplicationImportErrorCode.MalformedPayload },
    });
    expect(
      importApplicationState({
        ...exported,
        application: {
          ...exported.application,
          workflows: {
            ...exported.application.workflows,
            definitions: [
              {
                ...exported.application.workflows.definitions[0],
                description: undefined,
              },
            ],
          },
        },
      }),
    ).toEqual({
      type: "err",
      error: { code: ApplicationImportErrorCode.MalformedPayload },
    });
    for (const catalogField of [
      "definitionVersions",
      "assets",
      "assetUsages",
      "executions",
    ] as const) {
      expect(
        importApplicationState({
          ...exported,
          application: {
            ...exported.application,
            workflows: {
              ...exported.application.workflows,
              [catalogField]: [{}],
            },
          },
        }),
      ).toEqual({
        type: "err",
        error: { code: ApplicationImportErrorCode.MalformedPayload },
      });
    }
    expect(
      importApplicationState({
        ...exported,
        application: {
          ...exported.application,
          workflows: {
            ...exported.application.workflows,
            definitions: [{}],
          },
        },
      }),
    ).toEqual({
      type: "err",
      error: { code: ApplicationImportErrorCode.MalformedPayload },
    });
    expect(
      importApplicationState({
        ...exported,
        application: {
          ...exported.application,
          externalApiKeys: [{ id: "incomplete" }],
        },
      }),
    ).toEqual({
      type: "err",
      error: { code: ApplicationImportErrorCode.MalformedPayload },
    });
    expect(
      importApplicationState({
        ...exported,
        application: {
          ...exported.application,
          providerSelections: [{ profileId: "default" }],
        },
      }),
    ).toEqual({
      type: "err",
      error: { code: ApplicationImportErrorCode.MalformedPayload },
    });
    expect(
      importApplicationState({
        ...exported,
        application: {
          ...exported.application,
          workflows: {
            ...exported.application.workflows,
            definitions: [
              {
                ...definition,
                nodes: [{ ...node, inputPorts: [{}] }],
              },
            ],
          },
        },
      }),
    ).toEqual({
      type: "err",
      error: { code: ApplicationImportErrorCode.MalformedPayload },
    });
    expect(
      importApplicationState({
        ...exported,
        application: {
          ...exported.application,
          workflows: {
            ...exported.application.workflows,
            definitions: [
              {
                ...definition,
                edges: [
                  { ...edge, mapping: { ...edge.mapping, entries: [{}] } },
                ],
              },
            ],
          },
        },
      }),
    ).toEqual({
      type: "err",
      error: { code: ApplicationImportErrorCode.MalformedPayload },
    });
    expect(
      importApplicationState({
        ...exported,
        application: {
          ...exported.application,
          workflows: {
            ...exported.application.workflows,
            executions: [
              {
                ...execution,
                nodeRuns: [{ ...nodeRun, alerts: [{}] }],
              },
            ],
          },
        },
      }),
    ).toEqual({
      type: "err",
      error: { code: ApplicationImportErrorCode.MalformedPayload },
    });
    expect(
      importApplicationState({
        ...exported,
        application: {
          ...exported.application,
          workflows: {
            ...exported.application.workflows,
            executions: [
              {
                ...execution,
                nodeRuns: [{ ...nodeRun, guardrailFindings: [{}] }],
              },
            ],
          },
        },
      }),
    ).toEqual({
      type: "err",
      error: { code: ApplicationImportErrorCode.MalformedPayload },
    });
    expect(
      importApplicationState({
        ...exported,
        application: {
          ...exported.application,
          workflows: {
            ...exported.application.workflows,
            executions: [{ ...execution, nodeRuns: [{}] }],
          },
        },
      }),
    ).toEqual({
      type: "err",
      error: { code: ApplicationImportErrorCode.MalformedPayload },
    });
  });
});

const createFixtureStateClient = (legacyValue: unknown) => {
  let applicationRow: { value: unknown; revision: number } | undefined;
  const loadedKeys: string[] = [];
  const writtenKeys: string[] = [];
  return {
    loadedKeys,
    writtenKeys,
    query: async (text: string, values?: ReadonlyArray<unknown>) => {
      if (text.includes("INSERT INTO app_state")) {
        const key = values?.[0];
        const serialized = values?.[1];
        const revision = values?.[2];
        if (
          key !== "application" ||
          typeof serialized !== "string" ||
          typeof revision !== "number"
        ) {
          return { rows: [] };
        }
        writtenKeys.push(key);
        applicationRow = { value: JSON.parse(serialized), revision };
        return { rows: [{ revision }] };
      }

      const key = values?.[0];
      if (typeof key !== "string") {
        return { rows: [] };
      }
      loadedKeys.push(key);
      if (key === "application") {
        return { rows: applicationRow ? [applicationRow] : [] };
      }

      return key === "workspace"
        ? { rows: [{ value: legacyValue, revision: 7 }] }
        : { rows: [] };
    },
  };
};
