import { readServerConnection } from "./server-config.js";

const HeaderName = {
  Authorization: "Authorization",
  ContentType: "Content-Type"
} as const;

const HeaderValue = {
  Json: "application/json",
  BearerPrefix: "Bearer "
} as const;

export const requestJson = async <TResult>(input: {
  path: string;
  method?: "GET" | "POST";
  body?: Readonly<Record<string, unknown>>;
  parse: (value: unknown) => TResult;
}): Promise<TResult> => {
  const connection = readServerConnection();
  const response = await fetch(`${connection.serverUrl}${input.path}`, {
    method: input.method ?? "POST",
    headers: createHeaders(connection.authToken, input.body !== undefined),
    ...(input.body ? { body: JSON.stringify(input.body) } : {})
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(readErrorMessage(payload, response.status));
  }

  return input.parse(payload);
};

export const streamText = async (input: {
  path: string;
  signal?: AbortSignal;
  onChunk: (chunk: string) => void;
}): Promise<void> => {
  const connection = readServerConnection();
  const response = await fetch(`${connection.serverUrl}${input.path}`, {
    method: "GET",
    headers: createHeaders(connection.authToken, false),
    ...(input.signal ? { signal: input.signal } : {})
  });

  if (!response.ok) {
    const payload = await readJson(response);
    throw new Error(readErrorMessage(payload, response.status));
  }

  if (!response.body) {
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const result = await reader.read();
    if (result.done) {
      break;
    }

    const chunk = decoder.decode(result.value, {
      stream: true
    });
    if (chunk.length > 0) {
      input.onChunk(chunk);
    }
  }

  const finalChunk = decoder.decode();
  if (finalChunk.length > 0) {
    input.onChunk(finalChunk);
  }
};

const createHeaders = (
  authToken: string,
  includeJsonContentType: boolean
): Record<string, string> => ({
  [HeaderName.Authorization]: `${HeaderValue.BearerPrefix}${authToken}`,
  ...(includeJsonContentType
    ? { [HeaderName.ContentType]: HeaderValue.Json }
    : {})
});

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
};

const readErrorMessage = (value: unknown, status: number): string => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const message = (value as Record<string, unknown>)["message"];
    if (typeof message === "string") {
      return message;
    }
  }

  return `Request failed with status ${status}`;
};
