import { readBackendOrigin } from "./backend-origin.js";

const HeaderName = {
  Authorization: "Authorization",
  ContentType: "Content-Type",
} as const;

const HeaderValue = { Json: "application/json" } as const;

export const requestJson = async <TResult>(input: {
  path: string;
  method?: "GET" | "POST";
  body?: Readonly<Record<string, unknown>>;
  parse: (value: unknown) => TResult;
}): Promise<TResult> => {
  const response = await fetch(`${readBackendOrigin()}${input.path}`, {
    method: input.method ?? "POST",
    headers: createHeaders(input.body !== undefined),
    ...(input.body ? { body: JSON.stringify(input.body) } : {}),
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(readErrorMessage(payload, response.status));
  }

  return input.parse(payload);
};

const createHeaders = (
  includeJsonContentType: boolean,
): Record<string, string> => ({
  ...(includeJsonContentType
    ? { [HeaderName.ContentType]: HeaderValue.Json }
    : {}),
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
