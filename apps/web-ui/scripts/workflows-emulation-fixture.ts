import {
  WorkflowNodeKind,
  WorkflowReasoningLevel,
  WorkflowVerbosity,
  type WorkflowDefinitionUpsertInput,
} from "../src/screens/workflows-editor-state.js";

export const WorkflowsEmulationFixture = {
  ProjectId: "workflows-emulation-project",
  ProjectName: "Iteronix Workflow Emulation",
  ProjectRootPath: null,
  WorkflowId: "workflows-emulation-workflow",
  WorkflowName: "Emulation · n8n-like debug workflow",
  WorkflowDescription:
    "Stable fixture workflow for visual QA and browser regression tests.",
  Timestamp: "2026-07-07T10:45:00.000Z",
} as const;

export const createWorkflowsEmulationDefinition = (input: {
  projectId: string;
  workspaceId: string;
}): WorkflowDefinitionUpsertInput => ({
  id: WorkflowsEmulationFixture.WorkflowId,
  workspaceId: input.workspaceId,
  name: WorkflowsEmulationFixture.WorkflowName,
  description: WorkflowsEmulationFixture.WorkflowDescription,
  status: "draft",
  trigger: {
    kind: "manual",
    enabled: true,
    config: {},
  },
  viewport: {
    x: 128,
    y: 96,
    zoom: 1,
  },
  nodes: [
    {
      id: "fixture-trigger",
      kind: WorkflowNodeKind.TriggerManual,
      label: "Manual trigger",
      position: { x: 0, y: 120 },
      width: 264,
      collapsed: false,
      config: {},
      inputPorts: [],
      outputPorts: [{ id: "output", name: "Run", acceptsMany: true }],
      attachedGuardrails: [],
    },
    {
      id: "fixture-agent",
      kind: WorkflowNodeKind.AiAgent,
      label: "Fixture agent",
      position: { x: 320, y: 120 },
      width: 264,
      collapsed: false,
      config: {
        role: "executor",
        prompt: "Read $.executedAt and return a deterministic fixture summary.",
        provider: {
          providerId: "fixture-provider",
          modelId: "fixture-model",
          reasoningLevel: WorkflowReasoningLevel.Medium,
          temperature: 0.2,
          verbosity: WorkflowVerbosity.Medium,
        },
        pinnedTestOutput: {
          outputSnapshot: {
            result: "fixture-output",
            source: "workflows-emulation",
          },
          updatedAt: WorkflowsEmulationFixture.Timestamp,
        },
      },
      inputPorts: [{ id: "input", name: "Input", acceptsMany: true }],
      outputPorts: [{ id: "output", name: "Output", acceptsMany: true }],
      attachedGuardrails: [],
      outputContract: {
        id: "fixture-agent-output-contract",
        name: "Fixture agent output",
        schemaVersion: 1,
        rootType: "object",
        schema: {
          type: "object",
          required: ["result", "source"],
          properties: {
            result: { type: "string", title: "Result" },
            source: { type: "string", title: "Source" },
          },
        },
        sampleOutput: '{\n  "result": "",\n  "source": ""\n}',
      },
    },
    {
      id: "fixture-condition",
      kind: WorkflowNodeKind.LogicCondition,
      label: "Route by fixture",
      position: { x: 640, y: 120 },
      width: 264,
      collapsed: false,
      config: {},
      inputPorts: [{ id: "input", name: "Input", acceptsMany: true }],
      outputPorts: [
        { id: "true", name: "True", acceptsMany: true },
        { id: "false", name: "False", acceptsMany: true },
      ],
      attachedGuardrails: [],
    },
    {
      id: "fixture-response",
      kind: WorkflowNodeKind.TerminalResponse,
      label: "Response",
      position: { x: 960, y: 120 },
      width: 264,
      collapsed: false,
      config: {},
      inputPorts: [{ id: "input", name: "Input", acceptsMany: true }],
      outputPorts: [],
      attachedGuardrails: [],
    },
  ],
  edges: [
    {
      id: "fixture-edge-trigger-agent",
      sourceNodeId: "fixture-trigger",
      sourcePortId: "output",
      targetNodeId: "fixture-agent",
      targetPortId: "input",
      mapping: { mode: "passthrough", entries: [] },
    },
    {
      id: "fixture-edge-agent-condition",
      sourceNodeId: "fixture-agent",
      sourcePortId: "output",
      targetNodeId: "fixture-condition",
      targetPortId: "input",
      mapping: { mode: "passthrough", entries: [] },
    },
    {
      id: "fixture-edge-condition-response",
      sourceNodeId: "fixture-condition",
      sourcePortId: "true",
      targetNodeId: "fixture-response",
      targetPortId: "input",
      mapping: { mode: "passthrough", entries: [] },
    },
  ],
  executionPolicy: {
    maxNodeRetries: 3,
    allowManualCheckpointResume: true,
  },
  defaultContextPolicy: {
    language: "en",
    carryMessagesLimit: 8,
    carryArtifactLimit: 8,
  },
  tags: ["emulation", "browser-validation", "reusable-fixture"],
});
