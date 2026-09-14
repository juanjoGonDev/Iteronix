import { readBackendOrigin } from "./backend-origin.js";

const AuthPath = {
  Login: "/auth/login",
  Me: "/auth/me",
} as const;

export const IdeUserRole = {
  Admin: "admin",
  Member: "member",
} as const;

export type IdeUserRole = (typeof IdeUserRole)[keyof typeof IdeUserRole];

export interface IdeSessionUser {
  id: string;
  email: string;
  role: IdeUserRole;
  enabled: boolean;
}

export interface IdeLoginInput {
  email: string;
  password: string;
}

export const getIdeSession = async (): Promise<IdeSessionUser | null> => {
  const response = await requestSession(AuthPath.Me, {});
  if (response.status === 401) {
    return null;
  }
  return readSuccessfulSession(response);
};

export const loginIdeSession = async (
  input: IdeLoginInput,
): Promise<IdeSessionUser> =>
  readSuccessfulSession(await requestSession(AuthPath.Login, input));

export const parseIdeSessionResponse = (value: unknown): IdeSessionUser => {
  if (!isRecord(value) || !isRecord(value["user"])) {
    throw new Error("The authentication response is invalid.");
  }

  const user = value["user"];
  const id = readRequiredString(user, "id");
  const email = readRequiredString(user, "email");
  const role = readIdeUserRole(user["role"]);
  const enabled = user["enabled"];
  if (!id || !email || !role || typeof enabled !== "boolean") {
    throw new Error("The authentication response is invalid.");
  }

  return { id, email, role, enabled };
};

const requestSession = async (
  path: (typeof AuthPath)[keyof typeof AuthPath],
  body: IdeLoginInput | Readonly<Record<string, never>>,
): Promise<Response> =>
  fetch(`${readBackendOrigin()}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const readSuccessfulSession = async (
  response: Response,
): Promise<IdeSessionUser> => {
  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(readErrorMessage(payload, response.status));
  }
  return parseIdeSessionResponse(payload);
};

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
};

const readErrorMessage = (value: unknown, status: number): string => {
  if (isRecord(value) && isRecord(value["error"])) {
    const message = value["error"]["message"];
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  return `Request failed with status ${status}`;
};

const readIdeUserRole = (value: unknown): IdeUserRole | undefined =>
  value === IdeUserRole.Admin || value === IdeUserRole.Member
    ? value
    : undefined;

const readRequiredString = (
  value: Record<string, unknown>,
  key: string,
): string | undefined => {
  const field = value[key];
  return typeof field === "string" && field.trim() ? field.trim() : undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
