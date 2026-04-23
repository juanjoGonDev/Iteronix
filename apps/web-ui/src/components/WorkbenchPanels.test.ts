import { describe, expect, it } from "vitest";
import {
  createCitationEvidenceGroups,
  createEvidenceSourceSummaries
} from "./WorkbenchPanels.js";
import type { Citation } from "../shared/workbench-types.js";

describe("workbench citation groups", () => {
  it("keeps one visible citation per source and attaches full chunk provenance", () => {
    const citations: ReadonlyArray<Citation> = [
      createCitation({
        chunkId: "README.md#1",
        sourceId: "README.md",
        uri: "/README.md",
        snippet: "Collapsed README citation",
        score: 0.95
      }),
      createCitation({
        chunkId: "docs/AI_WORKBENCH.md#0",
        sourceId: "docs/AI_WORKBENCH.md",
        uri: "/docs/AI_WORKBENCH.md",
        snippet: "Collapsed architecture citation",
        score: 0.91
      })
    ];
    const retrievedSources: ReadonlyArray<Citation> = [
      createCitation({
        chunkId: "README.md#0",
        sourceId: "README.md",
        uri: "/README.md",
        snippet: "README chunk 0",
        score: 0.94
      }),
      createCitation({
        chunkId: "README.md#1",
        sourceId: "README.md",
        uri: "/README.md",
        snippet: "README chunk 1",
        score: 0.95
      }),
      createCitation({
        chunkId: "docs/AI_WORKBENCH.md#0",
        sourceId: "docs/AI_WORKBENCH.md",
        uri: "/docs/AI_WORKBENCH.md",
        snippet: "Architecture chunk",
        score: 0.91
      }),
      createCitation({
        chunkId: "ignored.md#0",
        sourceId: "ignored.md",
        uri: "/ignored.md",
        snippet: "Ignored provenance source",
        score: 0.5
      })
    ];

    const groups = createCitationEvidenceGroups(citations, retrievedSources);

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.citation.sourceId)).toEqual([
      "README.md",
      "docs/AI_WORKBENCH.md"
    ]);
    expect(groups[0]?.provenance.map((citation) => citation.chunkId)).toEqual([
      "README.md#0",
      "README.md#1"
    ]);
    expect(groups[1]?.provenance.map((citation) => citation.chunkId)).toEqual([
      "docs/AI_WORKBENCH.md#0"
    ]);
  });

  it("builds a deterministic per-source summary from retrieved sources", () => {
    const retrievedSources: ReadonlyArray<Citation> = [
      createCitation({
        chunkId: "README.md#0",
        sourceId: "README.md",
        uri: "/README.md",
        snippet: "README chunk 0",
        score: 0.92
      }),
      createCitation({
        chunkId: "docs/AI_WORKBENCH.md#0",
        sourceId: "docs/AI_WORKBENCH.md",
        uri: "/docs/AI_WORKBENCH.md",
        snippet: "Architecture chunk 0",
        score: 0.9
      }),
      createCitation({
        chunkId: "README.md#1",
        sourceId: "README.md",
        uri: "/README.md",
        snippet: "README chunk 1",
        score: 0.91
      }),
      createCitation({
        chunkId: "docs/AI_WORKBENCH.md#1",
        sourceId: "docs/AI_WORKBENCH.md",
        uri: "/docs/AI_WORKBENCH.md",
        snippet: "Architecture chunk 1",
        score: 0.89
      }),
      createCitation({
        chunkId: "AGENTS.md#0",
        sourceId: "AGENTS.md",
        uri: "/AGENTS.md",
        snippet: "Rules chunk 0",
        score: 0.87
      })
    ];

    const summaries = createEvidenceSourceSummaries(retrievedSources);

    expect(summaries).toEqual([
      {
        sourceId: "README.md",
        uri: "/README.md",
        chunkCount: 2
      },
      {
        sourceId: "docs/AI_WORKBENCH.md",
        uri: "/docs/AI_WORKBENCH.md",
        chunkCount: 2
      },
      {
        sourceId: "AGENTS.md",
        uri: "/AGENTS.md",
        chunkCount: 1
      }
    ]);
  });
});

const createCitation = (input: {
  chunkId: string;
  sourceId: string;
  uri: string;
  snippet: string;
  score: number;
}): Citation => ({
  chunkId: input.chunkId,
  sourceId: input.sourceId,
  uri: input.uri,
  snippet: input.snippet,
  retrievedAt: "2026-04-24T09:00:00.000Z",
  updatedAt: "2026-04-24T09:00:00.000Z",
  score: input.score,
  sourceType: "repo_doc"
});
