import { describe, expect, it } from "vitest";
import {
  createMemoryDocumentCatalog,
  indexMemoryDocument,
  parseMemoryDocumentCatalog,
  retrieveMemoryDocuments,
} from "./memory-rag";
import {
  AssetKind,
  AssetStatus,
  type EditableAssetRecord,
} from "./editable-assets";

describe("memory RAG documents", () => {
  it("retrieves only deterministic, retained documents from the selected opt-in source", () => {
    const source = createMemorySource();
    const catalog = indexMemoryDocument(
      indexMemoryDocument(
        createMemoryDocumentCatalog(),
        document("doc-2", "2026-07-20T00:00:00.000Z", "second answer"),
      ),
      document("doc-1", "2026-07-20T00:00:00.000Z", "first answer"),
    );

    const retrievals = retrieveMemoryDocuments({
      documents: catalog,
      source,
      scope: {
        tenantId: "tenant-1",
        workflowId: "workflow-1",
        enabled: true,
        retentionDays: 7,
      },
      query: "answer",
      limit: 10,
      now: "2026-07-21T00:00:00.000Z",
    });
    expect(retrievals.map((retrieval) => retrieval.content)).toEqual([
      "first answer",
      "second answer",
    ]);
    expect(
      retrievals.map((retrieval) => retrieval.provenance.documentId),
    ).toEqual(["doc-1", "doc-2"]);
  });

  it("rejects disabled, non-opted-in, cross-boundary, and expired document retrieval", () => {
    const catalog = indexMemoryDocument(
      createMemoryDocumentCatalog(),
      document("doc-1", "2026-07-01T00:00:00.000Z", "answer"),
    );
    const input = {
      documents: catalog,
      source: createMemorySource(),
      scope: {
        tenantId: "tenant-1",
        workflowId: "workflow-1",
        enabled: true,
        retentionDays: 7,
      },
      query: "answer",
      limit: 1,
      now: "2026-07-21T00:00:00.000Z",
    };

    expect(() =>
      retrieveMemoryDocuments({
        ...input,
        source: { ...input.source, status: AssetStatus.Disabled },
      }),
    ).toThrow("Memory source is disabled.");
    expect(() =>
      retrieveMemoryDocuments({
        ...input,
        source: {
          ...input.source,
          memory: { ...input.source.memory!, optInIndexing: false },
        },
      }),
    ).toThrow("Memory source indexing is not enabled.");
    expect(() =>
      retrieveMemoryDocuments({
        ...input,
        scope: { ...input.scope, workflowId: "workflow-2" },
      }),
    ).toThrow("Memory source workflow does not match the request.");
    expect(retrieveMemoryDocuments(input)).toEqual([]);
  });

  it("falls back safely when persisted JSONB document data is malformed", () => {
    expect(parseMemoryDocumentCatalog({ documents: [{ id: 1 }] })).toEqual(
      createMemoryDocumentCatalog(),
    );
  });
});

const createMemorySource = (): EditableAssetRecord => ({
  id: "source-1",
  kind: AssetKind.MemorySource,
  name: "Memory",
  status: AssetStatus.Enabled,
  capabilities: [],
  permissions: [],
  inputSchema: schema("input"),
  outputSchema: schema("output"),
  limits: { executions: 1, timeoutMs: 1 },
  provenance: {
    source: "test",
    artifactFingerprint: "source-fingerprint",
    registeredAt: "2026-07-01T00:00:00.000Z",
  },
  memory: {
    tenantId: "tenant-1",
    workflowId: "workflow-1",
    optInIndexing: true,
    retentionDays: 7,
    redactRetrievals: true,
  },
});

const document = (id: string, createdAt: string, content: string) => ({
  id,
  sourceId: "source-1",
  tenantId: "tenant-1",
  workflowId: "workflow-1",
  content,
  createdAt,
  provenance: {
    source: "test",
    artifactFingerprint: `${id}-fingerprint`,
    registeredAt: createdAt,
  },
});

const schema = (id: string) => ({
  id,
  version: 1,
  schema: { type: "object" as const },
});
