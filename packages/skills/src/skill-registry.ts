import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  parseSerializableSchema,
  type SerializableSchema
} from "../../ai-core/src/index";

export type SkillManifest = {
  metadata: {
    name: string;
    version: string;
    description: string;
    tags: ReadonlyArray<string>;
  };
  inputSchema: SerializableSchema;
  outputSchema: SerializableSchema;
  toolAllowlist: ReadonlyArray<string>;
  promptTemplate: string;
  evaluationRubric: ReadonlyArray<string>;
  fixtures?: ReadonlyArray<{
    name: string;
    input: Record<string, unknown>;
  }> | undefined;
  options?: {
    useRag?: boolean | undefined;
    topK?: number | undefined;
  } | undefined;
};

export type SkillRegistry = {
  list: () => ReadonlyArray<SkillManifest>;
  get: (skillName: string) => SkillManifest | undefined;
};

export const createSkillRegistry = async (input: {
  skillsDir: string;
}): Promise<SkillRegistry> => {
  const manifests = await loadSkillManifests(input.skillsDir);
  const manifestsByName = new Map<string, SkillManifest>();

  for (const manifest of manifests) {
    manifestsByName.set(manifest.metadata.name, manifest);
  }

  const list = (): ReadonlyArray<SkillManifest> => [...manifestsByName.values()];

  const get = (skillName: string): SkillManifest | undefined =>
    manifestsByName.get(skillName);

  return {
    list,
    get
  };
};

const loadSkillManifests = async (
  skillsDir: string
): Promise<ReadonlyArray<SkillManifest>> => {
  const entries = await readdir(skillsDir, { withFileTypes: true });
  const manifests: SkillManifest[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const filePath = join(skillsDir, entry.name, "skill.json");
    const content = await readFile(filePath, "utf8");
    manifests.push(parseSkillManifest(JSON.parse(content) as unknown));
  }

  return manifests;
};

const parseSkillManifest = (value: unknown): SkillManifest => {
  const parsed = skillManifestSchema.parse(value);

  return {
    metadata: parsed.metadata,
    inputSchema: parsed.inputSchema,
    outputSchema: parsed.outputSchema,
    toolAllowlist: parsed.toolAllowlist,
    promptTemplate: parsed.promptTemplate,
    evaluationRubric: parsed.evaluationRubric,
    fixtures: parsed.fixtures,
    options: parsed.options
  };
};

const skillManifestSchema = z.object({
  metadata: z.object({
    name: z.string().min(1),
    version: z.string().min(1),
    description: z.string().min(1),
    tags: z.array(z.string())
  }),
  inputSchema: z.unknown().transform((value) => parseSerializableSchema(value)),
  outputSchema: z.unknown().transform((value) => parseSerializableSchema(value)),
  toolAllowlist: z.array(z.string()),
  promptTemplate: z.string().min(1),
  evaluationRubric: z.array(z.string()),
  fixtures: z
    .array(
      z.object({
        name: z.string().min(1),
        input: z.record(z.string(), z.unknown())
      })
    )
    .optional(),
  options: z
    .object({
      useRag: z.boolean().optional(),
      topK: z.number().int().positive().optional()
    })
    .optional()
});
