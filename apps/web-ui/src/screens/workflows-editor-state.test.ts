import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  addWorkflowNode,
  addWorkflowEdgeMappingEntry,
  addWorkflowGuardrailValidation,
  JsonSchemaItemsSegment,
  WorkflowAssetKind,
  WorkflowNodeKind,
  WorkflowGuardrailSeverity,
  attachGuardrailToNode,
  compileJsonContractSchema,
  connectWorkflowNodes,
  createEmptyWorkflowDefinition,
  createWorkflowAssetDraft,
  createWorkflowOutputContractField,
  createJsonSchemaNode,
  formatJsonOutputContractDocument,
  insertWorkflowExpressionVariable,
  removeJsonSchemaProperty,
  renameJsonSchemaProperty,
  readJsonContractValidation,
  readGuardrailDefinitionValidity,
  parseJsonOutputContractDocument,
  parseWorkflowExpression,
  safeParseJsonContractValue,
  serializeJsonContractForProvider,
  serializeWorkflowExpression,
  moveWorkflowNode,
  readNodeAssetKind,
  removeWorkflowEdge,
  removeWorkflowNode,
  setWorkflowViewport,
  updateJsonSchemaNode,
  updateWorkflowAssetGuardrail,
  updateWorkflowNodeOutputContract,
  upsertJsonSchemaProperty,
  WorkflowExpressionSegmentKind,
  WorkflowExpressionVariableKind
} from "./workflows-editor-state.js";

describe("workflows editor state", () => {
  it("creates a default workflow with trigger and terminal nodes", () => {
    const definition = createEmptyWorkflowDefinition({
      projectId: "project-1",
      name: "Review PR"
    });

    expect(definition.trigger.kind).toBe("manual");
    expect(definition.nodes.map((node) => node.kind)).toEqual([
      WorkflowNodeKind.TriggerManual,
      WorkflowNodeKind.TerminalResponse
    ]);
  });

  it("creates project-scoped prompt and guardrail assets", () => {
    const prompt = createWorkflowAssetDraft({
      kind: WorkflowAssetKind.Prompt,
      projectId: "project-1",
      idFactory: () => "prompt-asset"
    });
    const guardrail = createWorkflowAssetDraft({
      kind: WorkflowAssetKind.Guardrail,
      projectId: "project-1",
      idFactory: () => "guardrail-asset"
    });

    expect(prompt.kind).toBe(WorkflowAssetKind.Prompt);
    expect(prompt.scope).toBe("project");
    expect(prompt.outputContract?.schema.properties?.["result"]?.type).toBe("string");
    expect(guardrail.guardrail?.validations).toHaveLength(1);
  });

  it("moves nodes, connects ports, and prevents duplicate edges", () => {
    const seedIds = ["node-a", "node-b", "edge-a"];
    let index = 0;
    const nextId = (): string => seedIds[index++] ?? `generated-${index}`;
    const definition = createEmptyWorkflowDefinition({
      projectId: "project-1",
      name: "Review PR"
    });
    const triggerNode = definition.nodes[0];
    const terminalNode = definition.nodes[1];
    expect(triggerNode).toBeDefined();
    expect(terminalNode).toBeDefined();
    if (!triggerNode || !terminalNode) {
      throw new Error("Expected default workflow nodes to exist.");
    }
    const withPrompt = {
      ...definition,
      nodes: [
        triggerNode,
        {
          ...terminalNode,
          id: "node-terminal"
        }
      ]
    };
    const moved = moveWorkflowNode(withPrompt, triggerNode.id, {
      x: 220,
      y: 140
    });
    const movedTriggerNode = moved.nodes[0];
    const movedTerminalNode = moved.nodes[1];
    expect(movedTriggerNode).toBeDefined();
    expect(movedTerminalNode).toBeDefined();
    if (!movedTriggerNode || !movedTerminalNode) {
      throw new Error("Expected moved workflow nodes to exist.");
    }
    const connected = connectWorkflowNodes(moved, {
      sourceNodeId: movedTriggerNode.id,
      sourcePortId: movedTriggerNode.outputPorts[0]?.id ?? "",
      targetNodeId: movedTerminalNode.id,
      targetPortId: movedTerminalNode.inputPorts[0]?.id ?? ""
    }, nextId);
    const duplicated = connectWorkflowNodes(connected, {
      sourceNodeId: movedTriggerNode.id,
      sourcePortId: movedTriggerNode.outputPorts[0]?.id ?? "",
      targetNodeId: movedTerminalNode.id,
      targetPortId: movedTerminalNode.inputPorts[0]?.id ?? ""
    }, nextId);

    expect(moved.nodes[0]?.position).toEqual({ x: 220, y: 140 });
    expect(connected.edges).toHaveLength(1);
    expect(duplicated.edges).toHaveLength(1);
  });

  it("keeps multiple incoming edges when the target port accepts many", () => {
    const definition = createEmptyWorkflowDefinition({
      projectId: "project-1",
      name: "Multi input"
    });
    const withPrompt = addWorkflowNode(definition, WorkflowNodeKind.AssetPrompt, () => "prompt-node");
    const triggerNode = withPrompt.nodes.find((node) => node.kind === WorkflowNodeKind.TriggerManual);
    const promptNode = withPrompt.nodes.find((node) => node.kind === WorkflowNodeKind.AssetPrompt);
    const terminalNode = withPrompt.nodes.find((node) => node.kind === WorkflowNodeKind.TerminalResponse);

    expect(triggerNode).toBeDefined();
    expect(promptNode).toBeDefined();
    expect(terminalNode).toBeDefined();
    if (!triggerNode || !promptNode || !terminalNode) {
      throw new Error("Expected trigger, prompt and terminal nodes to exist.");
    }

    const firstConnection = connectWorkflowNodes(withPrompt, {
      sourceNodeId: triggerNode.id,
      sourcePortId: triggerNode.outputPorts[0]?.id ?? "",
      targetNodeId: terminalNode.id,
      targetPortId: terminalNode.inputPorts[0]?.id ?? ""
    }, () => "edge-a");
    const secondConnection = connectWorkflowNodes(firstConnection, {
      sourceNodeId: promptNode.id,
      sourcePortId: promptNode.outputPorts[0]?.id ?? "",
      targetNodeId: terminalNode.id,
      targetPortId: terminalNode.inputPorts[0]?.id ?? ""
    }, () => "edge-b");

    expect(secondConnection.edges).toHaveLength(2);
    expect(secondConnection.edges.map((edge) => edge.id)).toEqual(["edge-a", "edge-b"]);
  });

  it("removes a selected edge without touching other connections", () => {
    const definition = createEmptyWorkflowDefinition({
      projectId: "project-1",
      name: "Removable edge"
    });
    const triggerNode = definition.nodes[0];
    const terminalNode = definition.nodes[1];
    if (!triggerNode || !terminalNode) {
      throw new Error("Expected default workflow nodes to exist.");
    }
    const withPrompt = addWorkflowNode(definition, WorkflowNodeKind.AssetPrompt, () => "node-prompt");
    const promptNode = withPrompt.nodes.find((node) => node.id === "node-prompt");
    if (!promptNode) {
      throw new Error("Expected prompt node to exist.");
    }

    const firstConnection = connectWorkflowNodes(withPrompt, {
      sourceNodeId: triggerNode.id,
      sourcePortId: triggerNode.outputPorts[0]?.id ?? "",
      targetNodeId: terminalNode.id,
      targetPortId: terminalNode.inputPorts[0]?.id ?? ""
    }, () => "edge-a");
    const secondConnection = connectWorkflowNodes(firstConnection, {
      sourceNodeId: promptNode.id,
      sourcePortId: promptNode.outputPorts[0]?.id ?? "",
      targetNodeId: terminalNode.id,
      targetPortId: terminalNode.inputPorts[0]?.id ?? ""
    }, () => "edge-b");

    const removed = removeWorkflowEdge(secondConnection, "edge-a");

    expect(removed.edges.map((edge) => edge.id)).toEqual(["edge-b"]);
    expect(removed.nodes).toHaveLength(secondConnection.nodes.length);
  });

  it("attaches guardrails and removes node edges when a node is deleted", () => {
    const definition = createEmptyWorkflowDefinition({
      projectId: "project-1",
      name: "Review PR"
    });
    const triggerNode = definition.nodes[0];
    const terminalNode = definition.nodes[1];
    expect(triggerNode).toBeDefined();
    expect(terminalNode).toBeDefined();
    if (!triggerNode || !terminalNode) {
      throw new Error("Expected default workflow nodes to exist.");
    }
    const connected = connectWorkflowNodes(definition, {
      sourceNodeId: triggerNode.id,
      sourcePortId: triggerNode.outputPorts[0]?.id ?? "",
      targetNodeId: terminalNode.id,
      targetPortId: terminalNode.inputPorts[0]?.id ?? ""
    }, () => "edge-1");
    const connectedTerminal = connected.nodes[1];
    expect(connectedTerminal).toBeDefined();
    if (!connectedTerminal) {
      throw new Error("Expected connected terminal node to exist.");
    }
    const guarded = attachGuardrailToNode(
      connected,
      connectedTerminal.id,
      "guardrail-asset"
    );
    const guardedTerminal = guarded.nodes[1];
    expect(guardedTerminal).toBeDefined();
    if (!guardedTerminal) {
      throw new Error("Expected guarded terminal node to exist.");
    }
    const removed = removeWorkflowNode(guarded, guardedTerminal.id);

    expect(guarded.nodes[1]?.attachedGuardrails).toHaveLength(1);
    expect(removed.nodes).toHaveLength(1);
    expect(removed.edges).toHaveLength(0);
  });

  it("clamps viewport zoom and maps asset-backed node kinds", () => {
    const definition = createEmptyWorkflowDefinition({
      projectId: "project-1",
      name: "Review PR"
    });
    const viewport = setWorkflowViewport(definition, {
      x: 12.4,
      y: 18.7,
      zoom: 9
    });

    expect(viewport.viewport).toEqual({
      x: 12,
      y: 19,
      zoom: 1.8
    });
    expect(readNodeAssetKind(WorkflowNodeKind.AssetPrompt)).toBe(WorkflowAssetKind.Prompt);
    expect(readNodeAssetKind(WorkflowNodeKind.AiAgent)).toBeNull();
  });

  it("updates node JSON output contracts and validates required object fields", () => {
    const definition = createEmptyWorkflowDefinition({
      projectId: "project-1",
      name: "Contracts"
    });
    const withAgent = addWorkflowNode(definition, WorkflowNodeKind.AiAgent, () => "agent-node");
    const withContract = updateWorkflowNodeOutputContract(withAgent, "agent-node", (contract) => ({
      ...contract,
      name: "Planner result",
      schema: createWorkflowOutputContractField({
        name: "summary",
        type: "string",
        required: true
      }, contract.schema)
    }));
    const agentNode = withContract.nodes.find((node) => node.id === "agent-node");

    expect(agentNode?.outputContract?.name).toBe("Planner result");
    expect(agentNode?.outputContract?.schema.required).toContain("summary");
    expect(agentNode?.outputContract?.schema.properties?.["summary"]?.type).toBe("string");
    expect(readJsonContractValidation(agentNode?.outputContract ?? null).valid).toBe(true);
  });

  it("adds edge mapping entries for prior node outputs", () => {
    const definition = createEmptyWorkflowDefinition({
      projectId: "project-1",
      name: "Mapped workflow"
    });
    const triggerNode = definition.nodes[0];
    const terminalNode = definition.nodes[1];
    if (!triggerNode || !terminalNode) {
      throw new Error("Expected default workflow nodes to exist.");
    }
    const connected = connectWorkflowNodes(definition, {
      sourceNodeId: triggerNode.id,
      sourcePortId: triggerNode.outputPorts[0]?.id ?? "",
      targetNodeId: terminalNode.id,
      targetPortId: terminalNode.inputPorts[0]?.id ?? ""
    }, () => "edge-1");
    const mapped = addWorkflowEdgeMappingEntry(connected, "edge-1", {
      targetPath: "$.context",
      source: {
        kind: "node_output",
        nodeId: triggerNode.id,
        path: "$.result"
      }
    });

    expect(mapped.edges[0]?.mapping.mode).toBe("object");
    expect(mapped.edges[0]?.mapping.entries).toEqual([
      {
        targetPath: "$.context",
        source: {
          kind: "node_output",
          nodeId: triggerNode.id,
          path: "$.result"
        }
      }
    ]);
  });

  it("limits guardrail validations to four and treats warnings as permissive", () => {
    const guardrail = createWorkflowAssetDraft({
      kind: WorkflowAssetKind.Guardrail,
      projectId: "project-1",
      idFactory: createSequentialIdFactory("guardrail")
    });
    const warnGuardrail = updateWorkflowAssetGuardrail(guardrail, (definition) => ({
      ...definition,
      severity: WorkflowGuardrailSeverity.Warn,
      validations: []
    }));
    const first = addWorkflowGuardrailValidation(warnGuardrail, () => "validation-1");
    const second = addWorkflowGuardrailValidation(first, () => "validation-2");
    const third = addWorkflowGuardrailValidation(second, () => "validation-3");
    const fourth = addWorkflowGuardrailValidation(third, () => "validation-4");
    const ignored = addWorkflowGuardrailValidation(fourth, () => "validation-5");

    expect(ignored.guardrail?.validations).toHaveLength(4);
    expect(readGuardrailDefinitionValidity(warnGuardrail.guardrail ?? null).blocking).toBe(false);
    expect(readGuardrailDefinitionValidity({
      id: "error-guardrail",
      severity: WorkflowGuardrailSeverity.Error,
      operator: "all",
      validations: []
    }).blocking).toBe(true);
  });

  it("supports nested contract editing, zod validation, and compact provider serialization", () => {
    const prompt = createWorkflowAssetDraft({
      kind: WorkflowAssetKind.Prompt,
      projectId: "project-1",
      idFactory: createSequentialIdFactory("contract")
    });
    const contract = prompt.outputContract;
    if (!contract) {
      throw new Error("Expected prompt assets to include an output contract.");
    }

    let schema = renameJsonSchemaProperty(contract.schema, [], "result", "summary");
    schema = upsertJsonSchemaProperty(schema, [], {
      name: "meta",
      node: createJsonSchemaNode("object"),
      required: false
    });
    schema = upsertJsonSchemaProperty(schema, ["meta"], {
      name: "email",
      node: createJsonSchemaNode("string"),
      required: true
    });
    schema = updateJsonSchemaNode(schema, ["meta", "email"], (node) => ({
      ...node,
      format: "email"
    }));
    schema = upsertJsonSchemaProperty(schema, [], {
      name: "tags",
      node: createJsonSchemaNode("array"),
      required: false
    });
    schema = updateJsonSchemaNode(schema, ["tags", JsonSchemaItemsSegment], (node) => ({
      ...node,
      type: "string",
      minLength: 2
    }));
    schema = removeJsonSchemaProperty(schema, [], "result");

    const nestedContract = {
      ...contract,
      schema
    };
    const providerSchema = serializeJsonContractForProvider(nestedContract);

    expect(readJsonContractValidation(nestedContract)).toEqual({
      valid: true,
      message: "Output contract is valid."
    });
    const compiledSchema = compileJsonContractSchema(nestedContract);
    const buildZodSchema = new Function("z", `return ${compiledSchema.zodExpression};`) as (input: typeof z) => {
      safeParse: (value: unknown) => { success: boolean };
    };
    const zodSchema = buildZodSchema(z);

    expect(zodSchema.safeParse({
      summary: "Done",
      meta: { email: "ops@example.com" },
      tags: ["ok"]
    }).success).toBe(true);
    expect(safeParseJsonContractValue(nestedContract, {
      summary: "Done",
      meta: { email: "not-an-email" }
    }).success).toBe(false);
    expect(providerSchema).toEqual({
      t: "o",
      p: {
        summary: { t: "s", r: 1 },
        meta: {
          t: "o",
          p: {
            email: { t: "s", r: 1, f: "email" }
          }
        },
        tags: {
          t: "a",
          i: { t: "s", min: 2 }
        }
      }
    });
  });

  it("keeps nested required flags in sync when properties are renamed or removed", () => {
    let schema = createJsonSchemaNode("object");
    schema = upsertJsonSchemaProperty(schema, [], {
      name: "details",
      node: createJsonSchemaNode("object"),
      required: true
    });
    schema = upsertJsonSchemaProperty(schema, ["details"], {
      name: "email",
      node: createJsonSchemaNode("string"),
      required: true
    });
    schema = renameJsonSchemaProperty(schema, ["details"], "email", "contactEmail");
    schema = removeJsonSchemaProperty(schema, [], "details");

    expect(schema.required).not.toContain("details");
    expect(schema.properties?.["details"]).toBeUndefined();
  });

  it("flags invalid schema constraints before save", () => {
    const prompt = createWorkflowAssetDraft({
      kind: WorkflowAssetKind.Prompt,
      projectId: "project-1",
      idFactory: createSequentialIdFactory("invalid")
    });
    const contract = prompt.outputContract;
    if (!contract) {
      throw new Error("Expected prompt assets to include an output contract.");
    }

    const invalidContract = {
      ...contract,
      schema: updateJsonSchemaNode(contract.schema, ["result"], (node) => ({
        ...node,
        minLength: 8,
        maxLength: 3,
        pattern: "["
      }))
    };

    const validation = readJsonContractValidation(invalidContract);

    expect(validation.valid).toBe(false);
    expect(validation.message).toContain("result");
  });

  it("parses and inserts canonical workflow expression variables", () => {
    const inserted = insertWorkflowExpressionVariable({
      value: "Summarize: ",
      selectionStart: 11,
      selectionEnd: 11,
      reference: {
        kind: WorkflowExpressionVariableKind.NodeOutput,
        sourceId: "node-42",
        path: "$.summary"
      }
    });

    expect(inserted.value).toBe("Summarize: {{var|node_output|node-42|$.summary}}");
    expect(inserted.expression.segments).toEqual([
      {
        kind: WorkflowExpressionSegmentKind.Text,
        value: "Summarize: "
      },
      {
        kind: WorkflowExpressionSegmentKind.Variable,
        reference: {
          kind: WorkflowExpressionVariableKind.NodeOutput,
          sourceId: "node-42",
          path: "$.summary"
        }
      }
    ]);
    expect(serializeWorkflowExpression(inserted.expression)).toBe(inserted.value);
    expect(parseWorkflowExpression(inserted.value).segments).toEqual(inserted.expression.segments);
  });

  it("round-trips raw contract documents through canonical schema parsing", () => {
    const prompt = createWorkflowAssetDraft({
      kind: WorkflowAssetKind.Prompt,
      projectId: "project-1",
      idFactory: createSequentialIdFactory("raw-contract")
    });
    const contract = prompt.outputContract;
    if (!contract) {
      throw new Error("Expected prompt assets to include an output contract.");
    }

    const updatedContract = {
      ...contract,
      name: "Raw editor contract",
      schema: {
        type: "object",
        required: ["summary"],
        properties: {
          summary: {
            type: "string",
            minLength: 3
          },
          meta: {
            type: "object",
            properties: {
              email: {
                type: "string",
                format: "email"
              }
            }
          }
        }
      },
      sampleOutput: "{\n  \"summary\": \"{{var|node_output|node-42|$.summary}}\"\n}"
    } as const;

    const formatted = formatJsonOutputContractDocument(updatedContract);
    const parsed = parseJsonOutputContractDocument(formatted, contract);

    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      throw new Error(parsed.error);
    }
    expect(parsed.contract.name).toBe("Raw editor contract");
    expect(parsed.contract.schema.properties?.["summary"]?.minLength).toBe(3);
    expect(parsed.contract.sampleOutput).toContain("{{var|node_output|node-42|$.summary}}");
  });
});

const createSequentialIdFactory = (prefix: string): (() => string) => {
  let index = 0;
  return () => {
    index += 1;
    return `${prefix}-${index}`;
  };
};
