import { describe, expect, it } from "vitest";
import {
  GuardrailDecisionKind,
  createEvaluationContract,
  createRepairProposal,
  evaluateGuardrails,
  evaluateReproducibleDataset,
  validateVersionedJsonSchema,
} from "./governance-validation";

const outputSchema = {
  id: "answer",
  version: 1,
  schema: {
    type: "object",
    properties: {
      answer: { type: "string", minLength: 1 },
      score: { type: "number", minimum: 0, maximum: 1 },
    },
    required: ["answer", "score"],
    additionalProperties: false,
  },
} as const;

describe("governance validation", () => {
  it("validates versioned JSON Schema values without exposing rejected data", () => {
    const result = validateVersionedJsonSchema(outputSchema, {
      answer: "",
      score: 2,
      secret: "never expose this",
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "$.answer", code: "minLength" }),
        expect.objectContaining({ path: "$.score", code: "maximum" }),
        expect.objectContaining({
          path: "$.secret",
          code: "additionalProperties",
        }),
      ]),
    );
    expect(JSON.stringify(result.errors)).not.toContain("never expose this");
  });

  it("denies undeclared tools, unsafe data handling, missing capabilities, and runtime limit overruns", () => {
    const decision = evaluateGuardrails(
      {
        allowedToolIds: ["search"],
        allowSensitiveData: false,
        requiredProviderCapabilities: ["structured-output"],
        maxNodes: 3,
        maxParallelism: 2,
      },
      {
        toolIds: ["search", "send-email"],
        handlesSensitiveData: true,
        providerCapabilities: ["streaming"],
        nodeCount: 4,
        parallelism: 3,
      },
    );

    expect(decision.kind).toBe(GuardrailDecisionKind.Deny);
    expect(decision.reasons.map((reason) => reason.code)).toEqual([
      "tool-not-allowed",
      "sensitive-data-not-allowed",
      "provider-capability-missing",
      "node-limit-exceeded",
      "parallelism-limit-exceeded",
    ]);
  });

  it("creates a bounded proposal that keeps failing evidence immutable", () => {
    const proposal = createRepairProposal({
      id: "repair-1",
      lifecycleId: "lifecycle-1",
      failureEvidence: "validation-failure-fingerprint",
      proposedOutput: { answer: "repaired", score: 1 },
      schema: outputSchema,
      guardrailPolicy: {
        allowedToolIds: ["search"],
        allowSensitiveData: false,
        requiredProviderCapabilities: ["structured-output"],
        maxNodes: 3,
        maxParallelism: 2,
      },
      guardrailInput: {
        toolIds: ["search"],
        handlesSensitiveData: false,
        providerCapabilities: ["structured-output"],
        nodeCount: 2,
        parallelism: 1,
      },
    });

    expect(proposal.failureEvidence).toBe("validation-failure-fingerprint");
    expect(proposal.proposedOutput).toEqual({ answer: "repaired", score: 1 });
    expect(proposal.schema).toEqual(outputSchema);
    expect(proposal.guardrailInput).toEqual({
      toolIds: ["search"],
      handlesSensitiveData: false,
      providerCapabilities: ["structured-output"],
      nodeCount: 2,
      parallelism: 1,
    });
    expect(() =>
      createRepairProposal({
        id: "repair-invalid",
        lifecycleId: "lifecycle-1",
        failureEvidence: "validation-failure-fingerprint",
        proposedOutput: { answer: "", score: 1 },
        schema: outputSchema,
        guardrailPolicy: {
          allowedToolIds: [],
          allowSensitiveData: false,
          requiredProviderCapabilities: [],
          maxNodes: 1,
          maxParallelism: 1,
        },
        guardrailInput: {
          toolIds: [],
          handlesSensitiveData: false,
          providerCapabilities: [],
          nodeCount: 1,
          parallelism: 1,
        },
      }),
    ).toThrow("Repair proposal does not satisfy its output schema");
  });

  it("produces comparable deterministic evaluation reports for the same contract and dataset", () => {
    const contract = createEvaluationContract({
      id: "evaluation-1",
      workflowId: "workflow-1",
      workflowVersion: "v1",
      providerId: "provider-1",
      providerVersion: "2026-07",
      dataset: [
        {
          id: "case-a",
          inputFingerprint: "input-a",
          expectedFingerprint: "output-a",
        },
        {
          id: "case-b",
          inputFingerprint: "input-b",
          expectedFingerprint: "output-b",
        },
      ],
    });
    const outcomes = [
      {
        caseId: "case-b",
        outputFingerprint: "output-b",
        latencyMs: 12,
        costMicros: 3,
      },
      {
        caseId: "case-a",
        outputFingerprint: "output-a",
        latencyMs: 10,
        costMicros: 2,
      },
    ];

    expect(evaluateReproducibleDataset(contract, outcomes)).toEqual(
      evaluateReproducibleDataset(contract, [...outcomes].reverse()),
    );
    const duplicateOutcome = outcomes.at(-1);
    if (!duplicateOutcome) {
      throw new Error("Expected evaluation fixture outcome.");
    }
    expect(() =>
      evaluateReproducibleDataset(contract, [
        duplicateOutcome,
        duplicateOutcome,
      ]),
    ).toThrow("Evaluation outcomes must match the contract dataset exactly");
  });
});
