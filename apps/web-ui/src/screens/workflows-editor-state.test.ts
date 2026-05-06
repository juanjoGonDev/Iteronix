import { describe, expect, it } from "vitest";
import {
  WorkflowAssetKind,
  WorkflowNodeKind,
  attachGuardrailToNode,
  connectWorkflowNodes,
  createEmptyWorkflowDefinition,
  createWorkflowAssetDraft,
  moveWorkflowNode,
  readNodeAssetKind,
  removeWorkflowNode,
  setWorkflowViewport
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
});
