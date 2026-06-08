import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createInMemoryVectorStore,
  createRagService,
  loadWorkspaceDocuments
} from "./index";

const CurrentTime = "2026-03-12T10:00:00.000Z";

describe("rag service", () => {
  it("retrieves chunks with citations, confidence and cache metadata", async () => {
    const service = createRagService({
      vectorStore: createInMemoryVectorStore(),
      now: () => new Date(CurrentTime)
    });

    await service.ingestDocuments([
      {
        id: "doc-1",
        uri: "/docs/overview.md",
        sourceType: "repo_doc",
        updatedAt: "2026-03-11T10:00:00.000Z",
        content:
          "Iteronix is an AI Engineering Workbench for orchestrating coding agents with auditability."
      },
      {
        id: "doc-2",
        uri: "/docs/security.md",
        sourceType: "repo_doc",
        updatedAt: "2026-03-10T10:00:00.000Z",
        content:
          "The platform uses security guardrails, evidence reports and explicit tool policies."
      }
    ]);

    const first = await service.query({
      query: "What is the Iteronix AI Engineering Workbench?",
      sessionId: "session-rag",
      topK: 3
    });
    const second = await service.query({
      query: "What is the Iteronix AI Engineering Workbench?",
      sessionId: "session-rag",
      topK: 3
    });

    expect(first.decision.shouldRetrieve).toBe(true);
    expect(first.citations.length).toBeGreaterThan(0);
    expect(first.confidence.score).toBeGreaterThan(0.4);
    expect(second.cache.hit).toBe(true);
  });

  it("skips retrieval when the context-aware gate rejects the query", async () => {
    const service = createRagService({
      vectorStore: createInMemoryVectorStore(),
      now: () => new Date(CurrentTime)
    });

    const result = await service.query({
      query: "hi",
      sessionId: "session-gate",
      topK: 3
    });

    expect(result.decision.shouldRetrieve).toBe(false);
    expect(result.citations).toHaveLength(0);
    expect(result.cache.hit).toBe(false);
  });

  it("ignores generated workbench directories during workspace ingestion", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "iteronix-rag-"));
    await mkdir(join(workspaceRoot, "docs"), { recursive: true });
    await mkdir(join(workspaceRoot, ".iteronix"), { recursive: true });
    await writeFile(join(workspaceRoot, "docs", "guide.md"), "# Guide\n\nWorkbench docs", "utf8");
    await writeFile(
      join(workspaceRoot, ".iteronix", "vector-store.json"),
      JSON.stringify([{ content: "generated artifact" }]),
      "utf8"
    );

    try {
      const documents = await loadWorkspaceDocuments(workspaceRoot, 10);
      expect(documents).toHaveLength(1);
      expect(documents[0]?.id).toBe("docs/guide.md");
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});
