import { resolve } from "node:path";
import { z } from "zod";

export type WorkbenchEnvironmentConfig = {
  skillsDir: string;
  memoryDir: string;
  evidenceDir: string;
  vectorDir: string;
  retrievalCacheTtlSeconds: number;
  maxIndexedFiles: number;
  rateLimitPoints: number;
  rateLimitDurationSeconds: number;
  otlpEndpoint?: string | undefined;
  qdrantUrl?: string | undefined;
  qdrantApiKey?: string | undefined;
  pgConnectionString?: string | undefined;
};

export const parseWorkbenchEnvironment = (
  env: NodeJS.ProcessEnv,
  workspaceRoot: string
): WorkbenchEnvironmentConfig => {
  const parsed = workbenchEnvironmentSchema.parse(env);
  const config: WorkbenchEnvironmentConfig = {
    skillsDir: resolve(workspaceRoot, parsed.AI_SKILLS_DIR),
    memoryDir: resolve(workspaceRoot, parsed.AI_MEMORY_DIR),
    evidenceDir: resolve(workspaceRoot, parsed.AI_EVIDENCE_DIR),
    vectorDir: resolve(workspaceRoot, parsed.AI_VECTOR_DIR),
    retrievalCacheTtlSeconds: parsed.AI_RETRIEVAL_CACHE_TTL_SECONDS,
    maxIndexedFiles: parsed.AI_MAX_INDEXED_FILES,
    rateLimitPoints: parsed.AI_RATE_LIMIT_POINTS,
    rateLimitDurationSeconds: parsed.AI_RATE_LIMIT_DURATION_SECONDS
  };
  const otlpEndpoint = toOptional(parsed.OTEL_EXPORTER_OTLP_ENDPOINT);
  const qdrantUrl = toOptional(parsed.AI_QDRANT_URL);
  const qdrantApiKey = toOptional(parsed.AI_QDRANT_API_KEY);
  const pgConnectionString = toOptional(parsed.AI_PGVECTOR_CONNECTION_STRING);

  if (otlpEndpoint !== undefined) {
    config.otlpEndpoint = otlpEndpoint;
  }

  if (qdrantUrl !== undefined) {
    config.qdrantUrl = qdrantUrl;
  }

  if (qdrantApiKey !== undefined) {
    config.qdrantApiKey = qdrantApiKey;
  }

  if (pgConnectionString !== undefined) {
    config.pgConnectionString = pgConnectionString;
  }

  return config;
};

const toOptional = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

const workbenchEnvironmentSchema = z.object({
  AI_SKILLS_DIR: z.string().default("skills"),
  AI_MEMORY_DIR: z.string().default(".iteronix/memory"),
  AI_EVIDENCE_DIR: z.string().default(".iteronix/evidence"),
  AI_VECTOR_DIR: z.string().default(".iteronix/vector"),
  AI_RETRIEVAL_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  AI_MAX_INDEXED_FILES: z.coerce.number().int().positive().default(200),
  AI_RATE_LIMIT_POINTS: z.coerce.number().int().positive().default(60),
  AI_RATE_LIMIT_DURATION_SECONDS: z.coerce.number().int().positive().default(60),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  AI_QDRANT_URL: z.string().optional(),
  AI_QDRANT_API_KEY: z.string().optional(),
  AI_PGVECTOR_CONNECTION_STRING: z.string().optional()
});
