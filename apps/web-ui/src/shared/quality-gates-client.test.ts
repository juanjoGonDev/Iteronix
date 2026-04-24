import { describe, expect, it } from "vitest";
import {
  decodeServerSentEvents,
  parseProjectOpenResponse,
  parseQualityGateEventsResponse,
  parseQualityGateRunResponse,
  parseQualityGateRunsResponse
} from "./quality-gates-client.js";

describe("quality gates client codecs", () => {
  it("parses project open and quality gate history responses", () => {
    const project = parseProjectOpenResponse({
      project: {
        id: "project-1",
        name: "Iteronix",
        rootPath: "D:/projects/Iteronix",
        createdAt: "2026-04-24T10:00:00.000Z",
        updatedAt: "2026-04-24T10:00:00.000Z"
      }
    });
    const started = parseQualityGateRunResponse({
      run: {
        id: "run-1",
        projectId: "project-1",
        status: "running",
        createdAt: "2026-04-24T10:00:00.000Z",
        updatedAt: "2026-04-24T10:00:00.000Z",
        gates: ["lint", "typecheck", "test", "build"],
        passedCount: 1,
        currentGate: "typecheck"
      }
    });
    const runs = parseQualityGateRunsResponse({
      runs: [
        {
          id: "run-1",
          projectId: "project-1",
          status: "running",
          createdAt: "2026-04-24T10:00:00.000Z",
          updatedAt: "2026-04-24T10:00:00.000Z",
          gates: ["lint", "typecheck"],
          passedCount: 1,
          currentGate: "typecheck"
        },
        {
          id: "run-2",
          projectId: "project-1",
          status: "completed",
          createdAt: "2026-04-24T09:50:00.000Z",
          updatedAt: "2026-04-24T09:55:00.000Z",
          gates: ["lint", "typecheck", "test", "build"],
          passedCount: 4
        }
      ]
    });
    const events = parseQualityGateEventsResponse({
      events: [
        {
          id: "event-1",
          runId: "run-1",
          type: "message",
          timestamp: "2026-04-24T10:00:01.000Z",
          data: {
            gate: "lint",
            text: "Running lint"
          }
        }
      ]
    });

    expect(project.id).toBe("project-1");
    expect(started.currentGate).toBe("typecheck");
    expect(runs[0]?.status).toBe("running");
    expect(runs[1]?.passedCount).toBe(4);
    expect(events[0]?.data["text"]).toBe("Running lint");
  });

  it("decodes server-sent events from streamed chunks", () => {
    const decoded = decodeServerSentEvents(
      [
        'id: evt-1\nevent: quality-gates-progress\ndata: {"id":"event-1","runId":"run-1","type":"message","timestamp":"2026-04-24T10:00:01.000Z","data":{"text":"Running lint","gate":"lint"}}\n\n',
        'id: evt-2\nevent: quality-gates-progress\ndata: {"id":"event-2","runId":"run-1","type":"done","timestamp":"2026-04-24T10:00:03.000Z","data":{"status":"completed"}}\n\n'
      ].join("")
    );

    expect(decoded).toEqual([
      {
        id: "evt-1",
        event: "quality-gates-progress",
        data: {
          id: "event-1",
          runId: "run-1",
          type: "message",
          timestamp: "2026-04-24T10:00:01.000Z",
          data: {
            text: "Running lint",
            gate: "lint"
          }
        }
      },
      {
        id: "evt-2",
        event: "quality-gates-progress",
        data: {
          id: "event-2",
          runId: "run-1",
          type: "done",
          timestamp: "2026-04-24T10:00:03.000Z",
          data: {
            status: "completed"
          }
        }
      }
    ]);
  });
});
