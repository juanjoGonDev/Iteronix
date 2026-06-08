import { mkdir, readFile, writeFile } from "node:fs/promises";
import { Pool, type PoolConfig } from "pg";
import { QdrantClient } from "@qdrant/js-client-rest";
import type { RagChunk } from "./rag-service";

export const VectorEmbeddingSize = 48;

export type VectorSearchResult = {
  chunk: RagChunk;
  score: number;
};

export type VectorStorePort = {
  upsertChunks: (chunks: ReadonlyArray<RagChunk>) => Promise<void>;
  query: (
    query: string,
    topK: number
  ) => Promise<ReadonlyArray<VectorSearchResult>>;
};

export const createInMemoryVectorStore = (): VectorStorePort => {
  const chunks: Array<{ chunk: RagChunk; embedding: ReadonlyArray<number> }> = [];

  const upsertChunks = async (records: ReadonlyArray<RagChunk>): Promise<void> => {
    for (const record of records) {
      const embedding = embedText(record.content);
      const index = chunks.findIndex((item) => item.chunk.id === record.id);
      if (index >= 0) {
        chunks[index] = {
          chunk: record,
          embedding
        };
      } else {
        chunks.push({
          chunk: record,
          embedding
        });
      }
    }
  };

  const query = async (
    input: string,
    topK: number
  ): Promise<ReadonlyArray<VectorSearchResult>> => {
    const queryEmbedding = embedText(input);
    return chunks
      .map((item) => ({
        chunk: item.chunk,
        score: cosineSimilarity(queryEmbedding, item.embedding)
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, topK);
  };

  return {
    upsertChunks,
    query
  };
};

export const createFileVectorStore = async (
  baseDir: string
): Promise<VectorStorePort> => {
  const filePath = `${baseDir}/vector-store.json`;
  await mkdir(baseDir, { recursive: true });
  await ensureVectorFile(filePath);

  const upsertChunks = async (records: ReadonlyArray<RagChunk>): Promise<void> => {
    const current = await readStoredChunks(filePath);
    const next = [...current];
    for (const record of records) {
      const item = {
        chunk: record,
        embedding: embedText(record.content)
      };
      const index = next.findIndex((entry) => entry.chunk.id === record.id);
      if (index >= 0) {
        next[index] = item;
      } else {
        next.push(item);
      }
    }

    await writeFile(filePath, JSON.stringify(next, null, 2), "utf8");
  };

  const query = async (
    input: string,
    topK: number
  ): Promise<ReadonlyArray<VectorSearchResult>> => {
    const current = await readStoredChunks(filePath);
    const queryEmbedding = embedText(input);
    return current
      .map((item) => ({
        chunk: item.chunk,
        score: cosineSimilarity(queryEmbedding, item.embedding)
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, topK);
  };

  return {
    upsertChunks,
    query
  };
};

export const createQdrantVectorStore = (input: {
  url: string;
  apiKey?: string | undefined;
  collectionName: string;
}): VectorStorePort => {
  const client = new QdrantClient(
    input.apiKey === undefined
      ? {
          url: input.url
        }
      : {
          url: input.url,
          apiKey: input.apiKey
        }
  );

  const upsertChunks = async (records: ReadonlyArray<RagChunk>): Promise<void> => {
    await ensureQdrantCollection(client, input.collectionName);
    await client.upsert(input.collectionName, {
      wait: true,
      points: records.map((record) => ({
        id: record.id,
        vector: embedText(record.content),
        payload: {
          chunk: record
        }
      }))
    });
  };

  const query = async (
    value: string,
    topK: number
  ): Promise<ReadonlyArray<VectorSearchResult>> => {
    await ensureQdrantCollection(client, input.collectionName);
    const result = await client.search(input.collectionName, {
      vector: embedText(value),
      limit: topK,
      with_payload: true
    });

    return result
      .map((entry) => toQdrantSearchResult(entry.payload, entry.score))
      .filter(
        (entry): entry is VectorSearchResult => entry !== undefined
      );
  };

  return {
    upsertChunks,
    query
  };
};

export const createPgVectorStore = (input: {
  connectionString: string;
  tableName?: string;
}): VectorStorePort => {
  const tableName = input.tableName ?? "iteronix_rag_chunks";
  const pool = new Pool({
    connectionString: input.connectionString
  } satisfies PoolConfig);

  const upsertChunks = async (records: ReadonlyArray<RagChunk>): Promise<void> => {
    await ensurePgVectorSchema(pool, tableName);
    for (const record of records) {
      await pool.query(
        `insert into ${tableName} (id, source_id, uri, source_type, updated_at, content, embedding)
         values ($1, $2, $3, $4, $5, $6, $7::vector)
         on conflict (id) do update
         set source_id = excluded.source_id,
             uri = excluded.uri,
             source_type = excluded.source_type,
             updated_at = excluded.updated_at,
             content = excluded.content,
             embedding = excluded.embedding`,
        [
          record.id,
          record.sourceId,
          record.uri,
          record.sourceType,
          record.updatedAt,
          record.content,
          toPgVector(embedText(record.content))
        ]
      );
    }
  };

  const query = async (
    value: string,
    topK: number
  ): Promise<ReadonlyArray<VectorSearchResult>> => {
    await ensurePgVectorSchema(pool, tableName);
    const result = await pool.query<{
      id: string;
      source_id: string;
      uri: string;
      source_type: string;
      updated_at: string;
      content: string;
      score: number;
    }>(
      `select id, source_id, uri, source_type, updated_at, content,
              1 - (embedding <=> $1::vector) as score
         from ${tableName}
         order by embedding <=> $1::vector
         limit $2`,
      [toPgVector(embedText(value)), topK]
    );

    return result.rows.map((row) => ({
      chunk: {
        id: row.id,
        sourceId: row.source_id,
        uri: row.uri,
        sourceType: row.source_type,
        updatedAt: row.updated_at,
        content: row.content
      },
      score: row.score
    }));
  };

  return {
    upsertChunks,
    query
  };
};

export const createEmbeddedQuery = (query: string): number[] => embedText(query);

export const embedText = (text: string): number[] => {
  const vector = new Array<number>(VectorEmbeddingSize).fill(0);
  const tokens = tokenize(text);

  for (const token of tokens) {
    const index = hashToken(token) % VectorEmbeddingSize;
    vector[index] = (vector[index] ?? 0) + 1;
  }

  return normalizeVector(vector);
};

const ensureVectorFile = async (filePath: string): Promise<void> => {
  try {
    await readFile(filePath, "utf8");
  } catch {
    await writeFile(filePath, "[]", "utf8");
  }
};

const readStoredChunks = async (
  filePath: string
): Promise<Array<{ chunk: RagChunk; embedding: ReadonlyArray<number> }>> => {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content) as Array<{
    chunk: RagChunk;
    embedding: ReadonlyArray<number>;
  }>;
};

const ensureQdrantCollection = async (
  client: QdrantClient,
  collectionName: string
): Promise<void> => {
  const collections = await client.getCollections();
  const exists = collections.collections.some(
    (collection) => collection.name === collectionName
  );

  if (!exists) {
    await client.createCollection(collectionName, {
      vectors: {
        size: VectorEmbeddingSize,
        distance: "Cosine"
      }
    });
  }
};

const toQdrantSearchResult = (
  payload: Record<string, unknown> | null | undefined,
  score: number
): VectorSearchResult | undefined => {
  if (!payload) {
    return undefined;
  }

  const chunk = payload["chunk"];
  if (!isChunkRecord(chunk)) {
    return undefined;
  }

  return {
    chunk,
    score
  };
};

const ensurePgVectorSchema = async (
  pool: Pool,
  tableName: string
): Promise<void> => {
  await pool.query("create extension if not exists vector");
  await pool.query(
    `create table if not exists ${tableName} (
      id text primary key,
      source_id text not null,
      uri text not null,
      source_type text not null,
      updated_at text not null,
      content text not null,
      embedding vector(${VectorEmbeddingSize}) not null
    )`
  );
};

const toPgVector = (values: ReadonlyArray<number>): string =>
  `[${values.map((value) => value.toFixed(6)).join(",")}]`;

const cosineSimilarity = (
  left: ReadonlyArray<number>,
  right: ReadonlyArray<number>
): number => {
  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dotProduct += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
};

const tokenize = (value: string): ReadonlyArray<string> =>
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length > 0);

const hashToken = (token: string): number => {
  let hash = 0;
  for (let index = 0; index < token.length; index += 1) {
    hash = (hash * 31 + token.charCodeAt(index)) >>> 0;
  }

  return hash;
};

const normalizeVector = (values: ReadonlyArray<number>): number[] => {
  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) {
    return [...values];
  }

  return values.map((value) => value / magnitude);
};

const isChunkRecord = (value: unknown): value is RagChunk => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record["id"] === "string" &&
    typeof record["sourceId"] === "string" &&
    typeof record["uri"] === "string" &&
    typeof record["sourceType"] === "string" &&
    typeof record["updatedAt"] === "string" &&
    typeof record["content"] === "string"
  );
};
