import { describe, expect, it } from "vitest";
import { ErrorMessage } from "./constants";
import { createProjectStore, ProjectStoreErrorCode } from "./projects";
import { ResultType } from "./result";

describe("project store", () => {
  it("opens a workflow-only project without a root path when a name is provided", () => {
    const store = createProjectStore();

    const opened = store.open({
      name: "Workflow Lab",
      rootPath: ""
    });

    expect(opened.type).toBe(ResultType.Ok);
    if (opened.type !== ResultType.Ok) {
      return;
    }

    expect(opened.value.name).toBe("Workflow Lab");
    expect(opened.value.rootPath).toBeNull();
  });

  it("creates a workflow-only project without a root path when a name is provided", () => {
    const store = createProjectStore();

    const created = store.create({
      name: "Workflow Lab",
      rootPath: ""
    });

    expect(created.type).toBe(ResultType.Ok);
    if (created.type !== ResultType.Ok) {
      return;
    }

    expect(created.value.name).toBe("Workflow Lab");
    expect(created.value.rootPath).toBeNull();
  });

  it("rejects a workflow-only project without a name", () => {
    const store = createProjectStore();

    const opened = store.open({
      rootPath: ""
    });

    expect(opened).toEqual({
      type: ResultType.Err,
      error: {
        code: ProjectStoreErrorCode.InvalidInput,
        message: ErrorMessage.MissingName
      }
    });
  });
});
