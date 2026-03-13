import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { LRUCache } from "lru-cache";
import { createConfidenceScore, type Citation, type ConfidenceScore } from "../../ai-core/src/index";
import {
  createEmbeddedQuery,
  type VectorSearchResult,
  type VectorStorePort
} from "./vector-stores";

export type RagDocument = {
  id: string;
  uri: string;
  sourceType: "repo_doc" | "user_doc" | "code";
  updatedAt: string;
  content: string;
};

export type RagChunk = {
  id: string;
  sourceId: string;
  uri: string;
  sourceType: string;
  updatedAt: string;
  content: string;
};

export type RagQueryResult = {
  decision: {
    shouldRetrieve: boolean;
    reason: string;
    confidence: number;
  };
  cache: {
    hit: boolean;
    expiresAt?: string;
  };
  chunks: ReadonlyArray<RagChunk>;
  citations: ReadonlyArray<Citation>;
  confidence: ConfidenceScore;
  context: string;
  credibilityChain: ReadonlyArray<{
    chunkId: string;
    score: number;
    reason: string;
  }>;
};

export type RagService = {
  ingestDocuments: (documents: ReadonlyArray<RagDocument>) => Promise<void>;
  query: (input: {
    query: string;
    sessionId: string;
    topK: number;
  }) => Promise<RagQueryResult>;
};

export const createRagService = (input: {
  vectorStore: VectorStorePort;
  now?: () => Date;
  cacheTtlSeconds?: number;
}): RagService => {
  const now = input.now ?? (() => new Date());
  const cacheTtlSeconds = input.cacheTtlSeconds ?? 300;
  const cache = new LRUCache<string, Omit<RagQueryResult, "cache">>({
    max: 200,
    ttl: cacheTtlSeconds * 1000
  });

  const ingestDocuments = async (
    documents: ReadonlyArray<RagDocument>
  ): Promise<void> => {
    const chunks = documents.flatMap((document) => chunkDocument(document));
    await input.vectorStore.upsertChunks(chunks);
  };

  const query = async (request: {
    query: string;
    sessionId: string;
    topK: number;
  }): Promise<RagQueryResult> => {
    const key = createCacheKey(request);
    const cached = cache.get(key);
    if (cached) {
      return {
        ...cached,
        cache: {
          hit: true,
          expiresAt: new Date(now().getTime() + cacheTtlSeconds * 1000).toISOString()
        }
      };
    }

    const gateDecision = evaluateRetrievalGate(request.query);
    if (!gateDecision.shouldRetrieve) {
      return createSkippedResult(gateDecision);
    }

    const matches = await input.vectorStore.query(request.query, request.topK);
    if (matches.length === 0 || matches[0]?.score === undefined || matches[0].score < 0.05) {
      return createSkippedResult({
        shouldRetrieve: false,
        reason: "Retrieval confidence below threshold",
        confidence: 0.2
      });
    }

    const citations = matches.map((match) => toCitation(match, now().toISOString()));
    const credibilityChain = matches.map((match, index, collection) =>
      toCredibilityStep(match, index, collection)
    );
    const confidence = scoreCredibility(matches);
    const result: Omit<RagQueryResult, "cache"> = {
      decision: {
        shouldRetrieve: true,
        reason: "Query matched indexed context",
        confidence: confidence.score
      },
      chunks: matches.map((match) => match.chunk),
      citations,
      confidence,
      context: citations.map((citation) => citation.snippet).join("\n"),
      credibilityChain
    };

    cache.set(key, result);

    return {
      ...result,
      cache: {
        hit: false,
        expiresAt: new Date(now().getTime() + cacheTtlSeconds * 1000).toISOString()
      }
    };
  };

  return {
    ingestDocuments,
    query
  };
};

export const loadWorkspaceDocuments = async (
  workspaceRoot: string,
  maxFiles: number
): Promise<ReadonlyArray<RagDocument>> => {
  const entries = await walkWorkspace(workspaceRoot, maxFiles);
  const documents: RagDocument[] = [];

  for (const filePath of entries) {
    const content = await readFile(filePath, "utf8");
    const fileStat = await stat(filePath);
    const relativePath = relative(workspaceRoot, filePath).replace(/\\/g, "/");
    documents.push({
      id: relativePath,
      uri: `/${relativePath}`,
      sourceType: inferSourceType(relativePath),
      updatedAt: fileStat.mtime.toISOString(),
      content
    });
  }

  return documents;
};

const walkWorkspace = async (
  directory: string,
  maxFiles: number
): Promise<ReadonlyArray<string>> => {
  const results: string[] = [];
  await collectFiles(directory, maxFiles, results);
  return results;
};

const collectFiles = async (
  directory: string,
  maxFiles: number,
  results: string[]
): Promise<void> => {
  if (results.length >= maxFiles) {
    return;
  }

  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (results.length >= maxFiles) {
      return;
    }

    if (shouldIgnorePath(entry.name)) {
      continue;
    }

    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(fullPath, maxFiles, results);
      continue;
    }

    if (shouldIndexFile(entry.name)) {
      results.push(fullPath);
    }
  }
};

const shouldIgnorePath = (name: string): boolean =>
  name === "node_modules" ||
  name === ".git" ||
  name === "dist" ||
  name === "screenshots";

const shouldIndexFile = (name: string): boolean =>
  name.endsWith(".md") ||
  name.endsWith(".txt") ||
  name.endsWith(".ts") ||
  name.endsWith(".json");

const inferSourceType = (path: string): "repo_doc" | "user_doc" | "code" => {
  if (path.endsWith(".ts") || path.endsWith(".json")) {
    return "code";
  }

  if (path.startsWith("docs/")) {
    return "repo_doc";
  }

  return "user_doc";
};

const createCacheKey = (input: {
  query: string;
  sessionId: string;
  topK: number;
}): string => `${input.sessionId}::${input.topK}::${input.query.toLowerCase().trim()}`;

const evaluateRetrievalGate = (query: string): {
  shouldRetrieve: boolean;
  reason: string;
  confidence: number;
} => {
  const normalized = query.trim().toLowerCase();
  if (normalized.length < 4 || normalized === "hi" || normalized === "hello") {
    return {
      shouldRetrieve: false,
      reason: "Greeting detected, retrieval skipped",
      confidence: 0.1
    };
  }

  return {
    shouldRetrieve: true,
    reason: "Domain query requires retrieval",
    confidence: 0.8
  };
};

const createSkippedResult = (decision: {
  shouldRetrieve: boolean;
  reason: string;
  confidence: number;
}): RagQueryResult => ({
  decision,
  cache: {
    hit: false
  },
  chunks: [],
  citations: [],
  confidence: createConfidenceScore(decision.confidence, [decision.reason]),
  context: "",
  credibilityChain: []
});

const chunkDocument = (document: RagDocument): ReadonlyArray<RagChunk> => {
  const segments = document.content
    .split(/\n{2,}/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  const chunks: RagChunk[] = [];

  for (let index = 0; index < segments.length; index += 1) {
    chunks.push({
      id: `${document.id}#${index}`,
      sourceId: document.id,
      uri: document.uri,
      sourceType: document.sourceType,
      updatedAt: document.updatedAt,
      content: segments[index] ?? ""
    });
  }

  return chunks;
};

const toCitation = (
  match: VectorSearchResult,
  retrievedAt: string
): Citation => ({
  chunkId: match.chunk.id,
  sourceId: match.chunk.sourceId,
  uri: match.chunk.uri,
  snippet: match.chunk.content.slice(0, 220),
  retrievedAt,
  updatedAt: match.chunk.updatedAt,
  score: match.score,
  sourceType: match.chunk.sourceType
});

const toCredibilityStep = (
  match: VectorSearchResult,
  index: number,
  collection: ReadonlyArray<VectorSearchResult>
): {
  chunkId: string;
  score: number;
  reason: string;
} => ({
  chunkId: match.chunk.id,
  score: match.score,
  reason: buildCredibilityReason(match, index, collection)
});

const scoreCredibility = (
  matches: ReadonlyArray<VectorSearchResult>
): ConfidenceScore => {
  const topScore = matches[0]?.score ?? 0;
  const margin = topScore - (matches[1]?.score ?? 0);
  const sourceBoost = matches.every((match) => match.chunk.sourceType === "repo_doc")
    ? 0.15
    : 0.05;
  const recencyBoost = averageRecency(matches);
  const agreementBoost = matches.length > 1 ? 0.1 : 0.03;
  const score = Math.min(
    0.99,
    Math.max(0, topScore * 0.55 + margin * 0.2 + sourceBoost + recencyBoost + agreementBoost)
  );

  return createConfidenceScore(score, [
    `top-score:${topScore.toFixed(2)}`,
    `margin:${margin.toFixed(2)}`,
    `source-boost:${sourceBoost.toFixed(2)}`,
    `recency-boost:${recencyBoost.toFixed(2)}`,
    `agreement-boost:${agreementBoost.toFixed(2)}`
  ]);
};

const averageRecency = (matches: ReadonlyArray<VectorSearchResult>): number => {
  if (matches.length === 0) {
    return 0;
  }

  const values = matches.map((match) => {
    const ageDays =
      (Date.now() - new Date(match.chunk.updatedAt).getTime()) / 86400000;
    return Math.max(0, 0.15 - ageDays * 0.01);
  });

  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const buildCredibilityReason = (
  match: VectorSearchResult,
  index: number,
  collection: ReadonlyArray<VectorSearchResult>
): string => {
  const margin =
    index === 0
      ? match.score - (collection[1]?.score ?? 0)
      : (collection[index - 1]?.score ?? 0) - match.score;
  return `${match.chunk.sourceType}:${margin.toFixed(2)}`;
};

export const createQueryEmbedding = (query: string): number[] =>
  createEmbeddedQuery(query);
