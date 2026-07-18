import { pbkdf2Sync, timingSafeEqual } from "node:crypto";

export const IdeUserRole = { Admin: "admin", Member: "member" } as const;
export type IdeUserRole = (typeof IdeUserRole)[keyof typeof IdeUserRole];

export type IdeUser = {
  id: string;
  email: string;
  passwordHash: string;
  role: IdeUserRole;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};
export type IdeSession = {
  tokenHash: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
};
export type IdeSessionGrant = { token: string };
export type IdePasswordReset = {
  tokenHash: string;
  userId: string;
  expiresAt: string;
  usedAt?: string;
};
export type PasswordResetDelivery = (input: {
  email: string;
  token: string;
}) => void;

export type IdeAuthState = {
  registrationEnabled: boolean;
  users: ReadonlyArray<IdeUser>;
  sessions: ReadonlyArray<IdeSession>;
  passwordResets: ReadonlyArray<IdePasswordReset>;
};

type IdeAuthPersistence = {
  load: () => IdeAuthState | undefined;
  save: (state: IdeAuthState) => void;
};
export type IdeAuthService = {
  bootstrapAdmin: (input: Credentials) => IdeUser;
  register: (input: Credentials) => Promise<{ user: IdeUser }>;
  login: (input: Credentials) => Promise<IdeSessionGrant>;
  logout: (token: string) => void;
  getSessionUser: (token: string) => IdeUser | undefined;
  requestPasswordReset: (email: string) => void;
  confirmPasswordReset: (input: {
    token: string;
    password: string;
  }) => Promise<void>;
  setRegistrationEnabled: (input: AdminToggle) => void;
  setUserEnabled: (input: AdminUserToggle) => void;
  snapshot: () => IdeAuthState;
};
type Credentials = { email: string; password: string };
type AdminToggle = { actorId: string; enabled: boolean };
type AdminUserToggle = AdminToggle & { userId: string };
type CreateIdeAuthServiceInput = IdeAuthPersistence & {
  now: () => string;
  randomToken: () => string;
  deliverPasswordReset?: PasswordResetDelivery;
};

const PasswordIterations = 210_000;
const PasswordKeyLength = 32;
const PasswordDigest = "sha256";
const PasswordSeparator = ":";
const SessionDurationMilliseconds = 1000 * 60 * 60 * 24 * 7;
const ResetDurationMilliseconds = 1000 * 60 * 30;
const MinimumPasswordLength = 12;

export const createDefaultIdeAuthState = (): IdeAuthState => ({
  registrationEnabled: true,
  users: [],
  sessions: [],
  passwordResets: [],
});

export const parseIdeAuthState = (value: unknown): IdeAuthState => {
  if (!isRecord(value)) return createDefaultIdeAuthState();
  const users = Array.isArray(value["users"])
    ? value["users"].flatMap(parseUser)
    : [];
  const userIds = new Set(users.map((user) => user.id));
  return {
    registrationEnabled:
      typeof value["registrationEnabled"] === "boolean"
        ? value["registrationEnabled"]
        : true,
    users,
    sessions: Array.isArray(value["sessions"])
      ? value["sessions"].flatMap((item) => parseSession(item, userIds))
      : [],
    passwordResets: Array.isArray(value["passwordResets"])
      ? value["passwordResets"].flatMap((item) => parseReset(item, userIds))
      : [],
  };
};

export const createIdeAuthService = (
  input: CreateIdeAuthServiceInput,
): IdeAuthService => {
  let state = parseIdeAuthState(input.load());
  const persist = (): void => input.save(state);
  const now = (): string => input.now();
  const persistMutation = (next: IdeAuthState): void => {
    state = next;
    persist();
  };

  return {
    bootstrapAdmin: (credentials) => {
      if (state.users.some((user) => user.role === IdeUserRole.Admin))
        throw new Error("Administrator already exists");
      const user = createUser(
        credentials,
        IdeUserRole.Admin,
        now(),
        input.randomToken(),
      );
      persistMutation({ ...state, users: [...state.users, user] });
      return user;
    },
    register: async (credentials) => {
      if (!state.registrationEnabled)
        throw new Error("Registration is disabled");
      const user = createUser(
        credentials,
        IdeUserRole.Member,
        now(),
        input.randomToken(),
      );
      assertEmailAvailable(state.users, user.email);
      persistMutation({ ...state, users: [...state.users, user] });
      return { user };
    },
    login: async (credentials) => {
      const user = state.users.find(
        (candidate) => candidate.email === normalizeEmail(credentials.email),
      );
      if (
        !user ||
        !user.enabled ||
        !verifyPassword(credentials.password, user.passwordHash)
      )
        throw new Error("Invalid credentials");
      const createdAt = now();
      const token = input.randomToken();
      const session: IdeSession = {
        tokenHash: hashToken(token),
        userId: user.id,
        createdAt,
        expiresAt: expireAt(createdAt, SessionDurationMilliseconds),
      };
      persistMutation({
        ...state,
        sessions: [
          ...state.sessions.filter((entry) => entry.userId !== user.id),
          session,
        ],
      });
      return { token };
    },
    logout: (token) => {
      const tokenHash = hashToken(token);
      persistMutation({
        ...state,
        sessions: state.sessions.filter(
          (session) => session.tokenHash !== tokenHash,
        ),
      });
    },
    getSessionUser: (token) => {
      const tokenHash = hashToken(token);
      const session = state.sessions.find(
        (candidate) =>
          candidate.tokenHash === tokenHash && candidate.expiresAt > now(),
      );
      if (!session) return undefined;
      const user = state.users.find(
        (candidate) => candidate.id === session.userId && candidate.enabled,
      );
      return user;
    },
    requestPasswordReset: (email) => {
      const user = state.users.find(
        (candidate) => candidate.email === normalizeEmail(email),
      );
      if (!user || !user.enabled || !input.deliverPasswordReset)
        throw new Error("Password reset is unavailable");
      const issuedAt = now();
      const token = input.randomToken();
      const reset = {
        tokenHash: hashToken(token),
        userId: user.id,
        expiresAt: expireAt(issuedAt, ResetDurationMilliseconds),
      };
      persistMutation({
        ...state,
        passwordResets: [
          ...state.passwordResets.filter((entry) => entry.userId !== user.id),
          reset,
        ],
      });
      input.deliverPasswordReset({ email: user.email, token });
    },
    confirmPasswordReset: async ({ token, password }) => {
      const tokenHash = hashToken(token);
      assertPassword(password);
      const reset = state.passwordResets.find(
        (candidate) =>
          candidate.tokenHash === tokenHash &&
          !candidate.usedAt &&
          candidate.expiresAt > now(),
      );
      if (!reset) throw new Error("Invalid password reset token");
      const updatedAt = now();
      persistMutation({
        ...state,
        users: state.users.map((user) =>
          user.id === reset.userId
            ? {
                ...user,
                passwordHash: hashPassword(password, input.randomToken()),
                updatedAt,
              }
            : user,
        ),
        sessions: state.sessions.filter(
          (session) => session.userId !== reset.userId,
        ),
        passwordResets: state.passwordResets.map((entry) =>
          entry.tokenHash === tokenHash
            ? { ...entry, usedAt: updatedAt }
            : entry,
        ),
      });
    },
    setRegistrationEnabled: ({ actorId, enabled }) => {
      assertAdmin(state.users, actorId);
      persistMutation({ ...state, registrationEnabled: enabled });
    },
    setUserEnabled: ({ actorId, userId, enabled }) => {
      assertAdmin(state.users, actorId);
      const target = state.users.find((user) => user.id === userId);
      if (!target) throw new Error("User not found");
      const updatedAt = now();
      persistMutation({
        ...state,
        users: state.users.map((user) =>
          user.id === userId ? { ...user, enabled, updatedAt } : user,
        ),
        sessions: enabled
          ? state.sessions
          : state.sessions.filter((session) => session.userId !== userId),
      });
    },
    snapshot: () => state,
  };
};

const createUser = (
  credentials: Credentials,
  role: IdeUserRole,
  createdAt: string,
  salt: string,
): IdeUser => {
  assertPassword(credentials.password);
  const email = normalizeEmail(credentials.email);
  if (!email) throw new Error("Email is invalid");
  return {
    id: `user-${salt}`,
    email,
    passwordHash: hashPassword(credentials.password, salt),
    role,
    enabled: true,
    createdAt,
    updatedAt: createdAt,
  };
};
const assertAdmin = (users: ReadonlyArray<IdeUser>, actorId: string): void => {
  if (
    users.find(
      (user) =>
        user.id === actorId && user.role === IdeUserRole.Admin && user.enabled,
    ) === undefined
  )
    throw new Error("Administrator access is required");
};
const assertEmailAvailable = (
  users: ReadonlyArray<IdeUser>,
  email: string,
): void => {
  if (users.some((user) => user.email === email))
    throw new Error("Email is already registered");
};
const assertPassword = (password: string): void => {
  if (password.length < MinimumPasswordLength)
    throw new Error("Password must be at least 12 characters");
};
const normalizeEmail = (email: string): string => email.trim().toLowerCase();
const hashPassword = (password: string, salt: string): string =>
  `${salt}${PasswordSeparator}${pbkdf2Sync(password, salt, PasswordIterations, PasswordKeyLength, PasswordDigest).toString("hex")}`;
const hashToken = (token: string): string =>
  pbkdf2Sync(
    token,
    "iteronix-session",
    PasswordIterations,
    PasswordKeyLength,
    PasswordDigest,
  ).toString("hex");
const verifyPassword = (password: string, stored: string): boolean => {
  const [salt, expected] = stored.split(PasswordSeparator);
  if (!salt || !expected) return false;
  const actual = hashPassword(password, salt).split(PasswordSeparator)[1];
  return (
    actual !== undefined &&
    actual.length === expected.length &&
    timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  );
};
const expireAt = (at: string, duration: number): string =>
  new Date(Date.parse(at) + duration).toISOString();
const parseUser = (value: unknown): IdeUser[] => {
  if (!isRecord(value)) return [];
  const id = stringValue(value["id"]);
  const email = stringValue(value["email"]);
  const passwordHash = stringValue(value["passwordHash"]);
  const createdAt = stringValue(value["createdAt"]);
  const updatedAt = stringValue(value["updatedAt"]);
  const role =
    value["role"] === IdeUserRole.Admin || value["role"] === IdeUserRole.Member
      ? value["role"]
      : undefined;
  if (
    !id ||
    !email ||
    !passwordHash ||
    !createdAt ||
    !updatedAt ||
    !role ||
    typeof value["enabled"] !== "boolean"
  )
    return [];
  return [
    {
      id,
      email,
      passwordHash,
      role,
      enabled: value["enabled"],
      createdAt,
      updatedAt,
    },
  ];
};
const parseSession = (
  value: unknown,
  ids: ReadonlySet<string>,
): IdeSession[] => {
  if (!isRecord(value)) return [];
  const tokenHash = stringValue(value["tokenHash"]);
  const userId = stringValue(value["userId"]);
  const createdAt = stringValue(value["createdAt"]);
  const expiresAt = stringValue(value["expiresAt"]);
  return tokenHash && userId && createdAt && expiresAt && ids.has(userId)
    ? [{ tokenHash, userId, createdAt, expiresAt }]
    : [];
};
const parseReset = (
  value: unknown,
  ids: ReadonlySet<string>,
): IdePasswordReset[] => {
  if (!isRecord(value)) return [];
  const tokenHash = stringValue(value["tokenHash"]);
  const userId = stringValue(value["userId"]);
  const expiresAt = stringValue(value["expiresAt"]);
  const usedAt = stringValue(value["usedAt"]);
  return tokenHash && userId && expiresAt && ids.has(userId)
    ? [{ tokenHash, userId, expiresAt, ...(usedAt ? { usedAt } : {}) }]
    : [];
};
const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
