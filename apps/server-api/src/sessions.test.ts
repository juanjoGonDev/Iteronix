import { describe, expect, it } from "vitest";
import { ResultType } from "./result";
import { createSessionStore, SessionStatus } from "./sessions";

describe("session store", () => {
  it("starts a session", () => {
    const store = createSessionStore();
    const result = store.start({ projectId: "project-1" });

    expect(result.type).toBe(ResultType.Ok);
    if (result.type === ResultType.Ok) {
      expect(result.value.projectId).toBe("project-1");
      expect(result.value.status).toBe(SessionStatus.Running);
    }
  });

  it("rejects empty project id", () => {
    const store = createSessionStore();
    const result = store.start({ projectId: "  " });

    expect(result.type).toBe(ResultType.Err);
  });

  it("stops a session", () => {
    const store = createSessionStore();
    const started = store.start({ projectId: "project-1" });

    if (started.type !== ResultType.Ok) {
      throw new Error("Expected ok session");
    }

    const stopped = store.stop(started.value.id);
    expect(stopped.type).toBe(ResultType.Ok);
    if (stopped.type === ResultType.Ok) {
      expect(stopped.value.status).toBe(SessionStatus.Stopped);
    }
  });

  it("returns error for missing session", () => {
    const store = createSessionStore();
    const result = store.stop("missing");

    expect(result.type).toBe(ResultType.Err);
  });
});