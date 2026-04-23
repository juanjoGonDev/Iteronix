import { describe, expect, it } from "vitest";
import { collapseCitationsBySource } from "./runtime";

describe("runtime citation collapsing", () => {
  it("collapses repeated chunks from the same source deterministically", () => {
    const citations = [
      {
        chunkId: "README.md#0",
        sourceId: "README.md",
        uri: "/README.md",
        snippet: "Older README chunk",
        retrievedAt: "2026-04-24T08:00:00.000Z",
        updatedAt: "2026-04-23T08:00:00.000Z",
        score: 0.91,
        sourceType: "repo_doc"
      },
      {
        chunkId: "docs/AI_WORKBENCH.md#0",
        sourceId: "docs/AI_WORKBENCH.md",
        uri: "/docs/AI_WORKBENCH.md",
        snippet: "Architecture chunk",
        retrievedAt: "2026-04-24T08:00:00.000Z",
        updatedAt: "2026-04-22T08:00:00.000Z",
        score: 0.88,
        sourceType: "repo_doc"
      },
      {
        chunkId: "README.md#1",
        sourceId: "README.md",
        uri: "/README.md",
        snippet: "Newer README chunk",
        retrievedAt: "2026-04-24T08:00:00.000Z",
        updatedAt: "2026-04-24T08:00:00.000Z",
        score: 0.91,
        sourceType: "repo_doc"
      }
    ] as const;

    const result = collapseCitationsBySource(citations);

    expect(result).toEqual([
      {
        chunkId: "README.md#1",
        sourceId: "README.md",
        uri: "/README.md",
        snippet: "Newer README chunk",
        retrievedAt: "2026-04-24T08:00:00.000Z",
        updatedAt: "2026-04-24T08:00:00.000Z",
        score: 0.91,
        sourceType: "repo_doc"
      },
      {
        chunkId: "docs/AI_WORKBENCH.md#0",
        sourceId: "docs/AI_WORKBENCH.md",
        uri: "/docs/AI_WORKBENCH.md",
        snippet: "Architecture chunk",
        retrievedAt: "2026-04-24T08:00:00.000Z",
        updatedAt: "2026-04-22T08:00:00.000Z",
        score: 0.88,
        sourceType: "repo_doc"
      }
    ]);
  });
});
