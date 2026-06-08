import { describe, expect, it } from "vitest";
import {
  MemoryRecordKind,
  createInMemoryMemoryStore,
  createMemoryManager
} from "./index";

const CurrentTime = "2026-03-12T10:00:00.000Z";
const OldTime = "2026-03-12T08:00:00.000Z";
const RecentTime = "2026-03-12T09:59:00.000Z";
const DuplicateTime = "2026-03-12T09:58:00.000Z";

describe("memory manager", () => {
  it("filters expired entries, boosts recency and removes noisy duplicates", async () => {
    const store = createInMemoryMemoryStore();
    const manager = createMemoryManager({
      store,
      now: () => new Date(CurrentTime)
    });

    await manager.rememberWorking({
      sessionId: "session-1",
      runId: "run-old",
      content: "Recent build note",
      createdAt: OldTime,
      ttlSeconds: 60
    });
    await manager.rememberWorking({
      sessionId: "session-1",
      runId: "run-new",
      content: "Recent build note",
      createdAt: RecentTime,
      ttlSeconds: 600
    });
    await manager.rememberWorking({
      sessionId: "session-1",
      runId: "run-duplicate",
      content: "Recent build note",
      createdAt: DuplicateTime,
      ttlSeconds: 600
    });

    const results = await manager.search({
      sessionId: "session-1",
      query: "recent build",
      limit: 5,
      kinds: [MemoryRecordKind.Working]
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.runId).toBe("run-new");
    expect(results[0]?.kind).toBe(MemoryRecordKind.Working);
  });

  it("redacts pii content when pii retention is disabled", async () => {
    const store = createInMemoryMemoryStore();
    const manager = createMemoryManager({
      store,
      now: () => new Date(CurrentTime)
    });

    await manager.rememberEpisodic({
      sessionId: "session-2",
      runId: "run-pii",
      content: "Contact juan@example.com for deployment",
      createdAt: RecentTime,
      pii: true
    });

    const results = await manager.search({
      sessionId: "session-2",
      query: "deployment contact",
      limit: 5,
      kinds: [MemoryRecordKind.Episodic],
      piiMode: "redact"
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.content.includes("@")).toBe(false);
    expect(results[0]?.metadata.redacted).toBe(true);
  });
});
