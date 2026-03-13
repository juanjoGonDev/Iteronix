import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

export const MemoryRecordKind = {
  Working: "working",
  Episodic: "episodic",
  Semantic: "semantic"
} as const;

export type MemoryRecordKind =
  typeof MemoryRecordKind[keyof typeof MemoryRecordKind];

export type MemoryRecord = {
  id: string;
  kind: MemoryRecordKind;
  sessionId?: string | undefined;
  runId?: string | undefined;
  content: string;
  createdAt: string;
  expiresAt?: string | undefined;
  pii: boolean;
  tags: ReadonlyArray<string>;
};

export type MemorySearchResult = MemoryRecord & {
  score: number;
  metadata: {
    redacted: boolean;
  };
};

export type MemoryStorePort = {
  put: (record: MemoryRecord) => Promise<void>;
  list: () => Promise<ReadonlyArray<MemoryRecord>>;
};

export type MemoryManager = {
  rememberWorking: (input: {
    sessionId: string;
    runId?: string;
    content: string;
    createdAt?: string;
    ttlSeconds?: number;
    tags?: ReadonlyArray<string>;
  }) => Promise<MemoryRecord>;
  rememberEpisodic: (input: {
    sessionId: string;
    runId?: string;
    content: string;
    createdAt?: string;
    pii?: boolean;
    tags?: ReadonlyArray<string>;
  }) => Promise<MemoryRecord>;
  rememberSemantic: (input: {
    content: string;
    createdAt?: string;
    tags?: ReadonlyArray<string>;
  }) => Promise<MemoryRecord>;
  search: (input: {
    sessionId?: string;
    query: string;
    limit: number;
    kinds?: ReadonlyArray<MemoryRecordKind>;
    piiMode?: "allow" | "redact" | "drop";
  }) => Promise<ReadonlyArray<MemorySearchResult>>;
};

export const createMemoryManager = (input: {
  store: MemoryStorePort;
  now?: () => Date;
}): MemoryManager => {
  const now = input.now ?? (() => new Date());

  const rememberWorking = async (request: {
    sessionId: string;
    runId?: string;
    content: string;
    createdAt?: string;
    ttlSeconds?: number;
    tags?: ReadonlyArray<string>;
  }): Promise<MemoryRecord> => {
    const createdAt = request.createdAt ?? now().toISOString();
    const record = createMemoryRecord({
      kind: MemoryRecordKind.Working,
      sessionId: request.sessionId,
      runId: request.runId,
      content: request.content,
      createdAt,
      expiresAt: createExpiry(createdAt, request.ttlSeconds),
      pii: false,
      tags: request.tags ?? []
    });
    await input.store.put(record);
    return record;
  };

  const rememberEpisodic = async (request: {
    sessionId: string;
    runId?: string;
    content: string;
    createdAt?: string;
    pii?: boolean;
    tags?: ReadonlyArray<string>;
  }): Promise<MemoryRecord> => {
    const record = createMemoryRecord({
      kind: MemoryRecordKind.Episodic,
      sessionId: request.sessionId,
      runId: request.runId,
      content: request.content,
      createdAt: request.createdAt ?? now().toISOString(),
      pii: request.pii ?? false,
      tags: request.tags ?? []
    });
    await input.store.put(record);
    return record;
  };

  const rememberSemantic = async (request: {
    content: string;
    createdAt?: string;
    tags?: ReadonlyArray<string>;
  }): Promise<MemoryRecord> => {
    const record = createMemoryRecord({
      kind: MemoryRecordKind.Semantic,
      content: request.content,
      createdAt: request.createdAt ?? now().toISOString(),
      pii: false,
      tags: request.tags ?? []
    });
    await input.store.put(record);
    return record;
  };

  const search = async (request: {
    sessionId?: string;
    query: string;
    limit: number;
    kinds?: ReadonlyArray<MemoryRecordKind>;
    piiMode?: "allow" | "redact" | "drop";
  }): Promise<ReadonlyArray<MemorySearchResult>> => {
    const records = await input.store.list();
    const piiMode = request.piiMode ?? "allow";
    const filtered = filterRecords(records, request, now());
    const deduplicated = deduplicateRecords(filtered);
    const ranked = rankRecords(deduplicated, request.query, now())
      .map((record) => applyPiiMode(record, piiMode))
      .filter(
        (
          record
        ): record is {
          record: MemoryRecord;
          score: number;
          redacted: boolean;
        } => record !== undefined
      )
      .slice(0, request.limit);

    return ranked.map(({ record, score, redacted }) => ({
      ...record,
      score,
      metadata: {
        redacted
      }
    }));
  };

  return {
    rememberWorking,
    rememberEpisodic,
    rememberSemantic,
    search
  };
};

export const createInMemoryMemoryStore = (): MemoryStorePort => {
  const records: MemoryRecord[] = [];

  const put = async (record: MemoryRecord): Promise<void> => {
    records.push(record);
  };

  const list = async (): Promise<ReadonlyArray<MemoryRecord>> => [...records];

  return {
    put,
    list
  };
};

export const createFileMemoryStore = async (
  baseDir: string
): Promise<MemoryStorePort> => {
  const filePath = `${baseDir}/memory.json`;
  await mkdir(baseDir, { recursive: true });
  await ensureMemoryFile(filePath);

  const put = async (record: MemoryRecord): Promise<void> => {
    const records = await readRecords(filePath);
    records.push(record);
    await writeFile(filePath, JSON.stringify(records, null, 2), "utf8");
  };

  const list = async (): Promise<ReadonlyArray<MemoryRecord>> =>
    readRecords(filePath);

  return {
    put,
    list
  };
};

const ensureMemoryFile = async (filePath: string): Promise<void> => {
  try {
    await readFile(filePath, "utf8");
  } catch {
    await writeFile(filePath, "[]", "utf8");
  }
};

const readRecords = async (filePath: string): Promise<MemoryRecord[]> => {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content) as MemoryRecord[];
};

const filterRecords = (
  records: ReadonlyArray<MemoryRecord>,
  request: {
    sessionId?: string | undefined;
    kinds?: ReadonlyArray<MemoryRecordKind> | undefined;
  },
  now: Date
): ReadonlyArray<MemoryRecord> =>
  records.filter((record) => {
    if (request.sessionId && record.sessionId && record.sessionId !== request.sessionId) {
      return false;
    }

    if (request.kinds && !request.kinds.includes(record.kind)) {
      return false;
    }

    if (record.expiresAt && new Date(record.expiresAt).getTime() <= now.getTime()) {
      return false;
    }

    return true;
  });

const deduplicateRecords = (
  records: ReadonlyArray<MemoryRecord>
): ReadonlyArray<MemoryRecord> => {
  const seen = new Set<string>();
  const deduplicated: MemoryRecord[] = [];

  for (const record of sortByRecency(records)) {
    const key = normalizeText(record.content);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduplicated.push(record);
  }

  return deduplicated;
};

const rankRecords = (
  records: ReadonlyArray<MemoryRecord>,
  query: string,
  now: Date
): ReadonlyArray<{ record: MemoryRecord; score: number }> =>
  [...records]
    .map((record) => ({
      record,
      score: computeRelevanceScore(record, query, now)
    }))
    .sort((left, right) => right.score - left.score);

const applyPiiMode = (
  input: { record: MemoryRecord; score: number },
  piiMode: "allow" | "redact" | "drop"
):
  | {
      record: MemoryRecord;
      score: number;
      redacted: boolean;
    }
  | undefined => {
  if (!input.record.pii || piiMode === "allow") {
    return {
      record: input.record,
      score: input.score,
      redacted: false
    };
  }

  if (piiMode === "drop") {
    return undefined;
  }

  return {
    record: {
      ...input.record,
      content: redactPii(input.record.content)
    },
    score: input.score,
    redacted: true
  };
};

const createMemoryRecord = (input: {
  kind: MemoryRecordKind;
  sessionId?: string | undefined;
  runId?: string | undefined;
  content: string;
  createdAt: string;
  expiresAt?: string | undefined;
  pii: boolean;
  tags: ReadonlyArray<string>;
}): MemoryRecord => ({
  id: randomUUID(),
  kind: input.kind,
  sessionId: input.sessionId,
  runId: input.runId,
  content: input.content,
  createdAt: input.createdAt,
  expiresAt: input.expiresAt,
  pii: input.pii,
  tags: input.tags
});

const createExpiry = (
  createdAt: string,
  ttlSeconds: number | undefined
): string | undefined => {
  if (ttlSeconds === undefined) {
    return undefined;
  }

  return new Date(new Date(createdAt).getTime() + ttlSeconds * 1000).toISOString();
};

const sortByRecency = (
  records: ReadonlyArray<MemoryRecord>
): ReadonlyArray<MemoryRecord> =>
  [...records].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );

const computeRelevanceScore = (
  record: MemoryRecord,
  query: string,
  now: Date
): number => {
  const overlap = computeTokenOverlap(record.content, query);
  const ageMinutes =
    Math.max(0, now.getTime() - new Date(record.createdAt).getTime()) / 60000;
  const recencyBoost = 1 / (1 + ageMinutes / 30);
  return overlap + recencyBoost;
};

const computeTokenOverlap = (left: string, right: string): number => {
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);

  if (rightTokens.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / rightTokens.size;
};

const redactPii = (content: string): string =>
  content.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted]");

const tokenize = (value: string): Set<string> =>
  new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter((token) => token.length > 0)
  );

const normalizeText = (value: string): string =>
  value.toLowerCase().replace(/\s+/g, " ").trim();
