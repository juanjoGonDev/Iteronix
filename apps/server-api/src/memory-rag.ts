import {
  AssetKind,
  AssetStatus,
  type EditableAssetRecord,
} from "./editable-assets";
import type {
  ArtifactProvenance,
  MemoryRetrieval,
  MemoryScope,
  RagPort,
} from "../../../packages/domain/src/agent-tool-contracts";

export type MemoryDocument = {
  id: string;
  sourceId: string;
  tenantId: string;
  workflowId: string;
  content: string;
  createdAt: string;
  provenance: ArtifactProvenance;
};

export type MemoryDocumentCatalog = {
  documents: ReadonlyArray<MemoryDocument>;
};

export const createMemoryDocumentCatalog = (): MemoryDocumentCatalog => ({
  documents: [],
});

export const indexMemoryDocument = (
  catalog: MemoryDocumentCatalog,
  document: MemoryDocument,
): MemoryDocumentCatalog => {
  assertDocument(document);
  return {
    documents: [
      ...catalog.documents.filter((entry) => entry.id !== document.id),
      copyDocument(document),
    ],
  };
};

export const parseMemoryDocumentCatalog = (
  value: unknown,
): MemoryDocumentCatalog => {
  if (!isRecord(value) || !Array.isArray(value["documents"]))
    return createMemoryDocumentCatalog();
  const documents = value["documents"].flatMap(readDocument);
  return documents.length === value["documents"].length
    ? documents.reduce(indexMemoryDocument, createMemoryDocumentCatalog())
    : createMemoryDocumentCatalog();
};

export const retrieveMemoryDocuments = (input: {
  documents: MemoryDocumentCatalog;
  source: EditableAssetRecord;
  scope: MemoryScope;
  query: string;
  limit: number;
  now: string;
}): ReadonlyArray<MemoryRetrieval> => {
  const memory = readMemorySource(input.source);
  assertScope(memory, input.scope);
  if (!Number.isInteger(input.limit) || input.limit < 1)
    throw new Error("Memory retrieval limit is invalid.");
  const cutoff =
    new Date(input.now).getTime() - memory.retentionDays * MillisecondsPerDay;
  const query = input.query.trim().toLocaleLowerCase();
  return input.documents.documents
    .filter((document) => document.sourceId === input.source.id)
    .filter(
      (document) =>
        document.tenantId === input.scope.tenantId &&
        document.workflowId === input.scope.workflowId,
    )
    .filter((document) => new Date(document.createdAt).getTime() >= cutoff)
    .filter(
      (document) =>
        query.length === 0 ||
        document.content.toLocaleLowerCase().includes(query),
    )
    .sort(
      (left, right) =>
        left.id.localeCompare(right.id) ||
        left.createdAt.localeCompare(right.createdAt),
    )
    .slice(0, input.limit)
    .map((document) => ({
      content: document.content,
      provenance: {
        documentId: document.id,
        documentFingerprint: document.provenance.artifactFingerprint,
        source: document.provenance.source,
        retrievedAt: input.now,
      },
    }));
};

export const createApplicationMemoryRagPort = (input: {
  read: () => {
    editableAssets: { records: ReadonlyArray<EditableAssetRecord> };
    memoryDocuments: MemoryDocumentCatalog;
  };
  now?: () => string;
}): RagPort => ({
  retrieve: async (request) => {
    if (!request.scope.sourceId) return [];
    const state = input.read();
    const source = state.editableAssets.records.find(
      (asset) => asset.id === request.scope.sourceId,
    );
    if (!source) throw new Error("Memory source was not found.");
    return retrieveMemoryDocuments({
      documents: state.memoryDocuments,
      source,
      scope: request.scope,
      query: request.query,
      limit: request.limit,
      now: input.now?.() ?? new Date().toISOString(),
    });
  },
});

const MillisecondsPerDay = 24 * 60 * 60 * 1000;

const readMemorySource = (
  source: EditableAssetRecord,
): NonNullable<EditableAssetRecord["memory"]> => {
  if (source.kind !== AssetKind.MemorySource || !source.memory)
    throw new Error("Memory source was not found.");
  if (source.status !== AssetStatus.Enabled)
    throw new Error("Memory source is disabled.");
  if (!source.memory.optInIndexing)
    throw new Error("Memory source indexing is not enabled.");
  return source.memory;
};

const assertScope = (
  memory: NonNullable<EditableAssetRecord["memory"]>,
  scope: MemoryScope,
): void => {
  if (!scope.enabled) throw new Error("Memory scope must be enabled.");
  if (memory.tenantId !== scope.tenantId)
    throw new Error("Memory source tenant does not match the request.");
  if (memory.workflowId !== scope.workflowId)
    throw new Error("Memory source workflow does not match the request.");
  if (memory.retentionDays !== scope.retentionDays)
    throw new Error("Memory source retention does not match the request.");
};

const readDocument = (value: unknown): ReadonlyArray<MemoryDocument> => {
  if (
    !isRecord(value) ||
    !isString(value["id"]) ||
    !isString(value["sourceId"]) ||
    !isString(value["tenantId"]) ||
    !isString(value["workflowId"]) ||
    !isString(value["content"]) ||
    !isString(value["createdAt"]) ||
    !isRecord(value["provenance"]) ||
    !isString(value["provenance"]["source"]) ||
    !isString(value["provenance"]["artifactFingerprint"]) ||
    !isString(value["provenance"]["registeredAt"])
  )
    return [];
  const document = {
    id: value["id"],
    sourceId: value["sourceId"],
    tenantId: value["tenantId"],
    workflowId: value["workflowId"],
    content: value["content"],
    createdAt: value["createdAt"],
    provenance: {
      source: value["provenance"]["source"],
      artifactFingerprint: value["provenance"]["artifactFingerprint"],
      registeredAt: value["provenance"]["registeredAt"],
    },
  };
  try {
    assertDocument(document);
    return [document];
  } catch {
    return [];
  }
};

const assertDocument = (document: MemoryDocument): void => {
  for (const value of [
    document.id,
    document.sourceId,
    document.tenantId,
    document.workflowId,
    document.content,
    document.createdAt,
    document.provenance.source,
    document.provenance.artifactFingerprint,
    document.provenance.registeredAt,
  ])
    if (!isString(value)) throw new Error("Memory document is invalid.");
  if (!Number.isFinite(new Date(document.createdAt).getTime()))
    throw new Error("Memory document timestamp is invalid.");
};

const copyDocument = (document: MemoryDocument): MemoryDocument => ({
  ...document,
  provenance: { ...document.provenance },
});
const isString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
