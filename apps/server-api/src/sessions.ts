import { randomUUID } from "node:crypto";
import { ErrorMessage } from "./constants";
import { err, ok, type Result } from "./result";

export const SessionStatus = {
  Running: "running",
  Stopped: "stopped"
} as const;

export type SessionStatus =
  typeof SessionStatus[keyof typeof SessionStatus];

export const SessionEventType = {
  Status: "status"
} as const;

export type SessionEventType =
  typeof SessionEventType[keyof typeof SessionEventType];

export type Session = {
  id: string;
  projectId: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
};

export type SessionEvent = {
  id: string;
  sessionId: string;
  type: SessionEventType;
  status: SessionStatus;
  timestamp: string;
};

export type SessionStartInput = {
  projectId: string;
};

export const SessionStoreErrorCode = {
  InvalidInput: "invalid_input",
  NotFound: "not_found"
} as const;

export type SessionStoreErrorCode =
  typeof SessionStoreErrorCode[keyof typeof SessionStoreErrorCode];

export type SessionStoreError = {
  code: SessionStoreErrorCode;
  message: string;
};

export type SessionStore = {
  start: (input: SessionStartInput) => Result<Session, SessionStoreError>;
  stop: (sessionId: string) => Result<Session, SessionStoreError>;
  getById: (sessionId: string) => Result<Session, SessionStoreError>;
};

export const createSessionStore = (): SessionStore => {
  const sessions = new Map<string, Session>();

  const start = (input: SessionStartInput): Result<Session, SessionStoreError> =>
    startSession(sessions, input);

  const stop = (sessionId: string): Result<Session, SessionStoreError> =>
    stopSession(sessions, sessionId);

  const getById = (sessionId: string): Result<Session, SessionStoreError> =>
    getSessionById(sessions, sessionId);

  return {
    start,
    stop,
    getById
  };
};

export type SessionEventSubscriber = (event: SessionEvent) => void;

export type SessionEventHub = {
  publish: (event: SessionEvent) => void;
  subscribe: (sessionId: string, subscriber: SessionEventSubscriber) => () => void;
};

export const createSessionEventHub = (): SessionEventHub => {
  const subscribers = new Map<string, Set<SessionEventSubscriber>>();

  const publish = (event: SessionEvent): void => {
    const listeners = subscribers.get(event.sessionId);
    if (!listeners) {
      return;
    }

    for (const listener of listeners) {
      listener(event);
    }
  };

  const subscribe = (
    sessionId: string,
    subscriber: SessionEventSubscriber
  ): (() => void) => {
    const existing = subscribers.get(sessionId) ?? new Set<SessionEventSubscriber>();
    existing.add(subscriber);
    subscribers.set(sessionId, existing);

    return () => {
      const current = subscribers.get(sessionId);
      if (!current) {
        return;
      }

      current.delete(subscriber);
      if (current.size === 0) {
        subscribers.delete(sessionId);
      }
    };
  };

  return {
    publish,
    subscribe
  };
};

export const createStatusEvent = (session: Session): SessionEvent => ({
  id: randomUUID(),
  sessionId: session.id,
  type: SessionEventType.Status,
  status: session.status,
  timestamp: new Date().toISOString()
});

const startSession = (
  sessions: Map<string, Session>,
  input: SessionStartInput
): Result<Session, SessionStoreError> => {
  const projectId = input.projectId.trim();
  if (projectId.length === 0) {
    return err({
      code: SessionStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingProjectId
    });
  }

  const session = createSessionEntity({
    projectId,
    status: SessionStatus.Running
  });

  sessions.set(session.id, session);

  return ok(session);
};

const stopSession = (
  sessions: Map<string, Session>,
  sessionId: string
): Result<Session, SessionStoreError> => {
  const existing = sessions.get(sessionId);
  if (!existing) {
    return err({
      code: SessionStoreErrorCode.NotFound,
      message: ErrorMessage.NotFound
    });
  }

  const updated = {
    ...existing,
    status: SessionStatus.Stopped,
    updatedAt: new Date().toISOString()
  };

  sessions.set(updated.id, updated);

  return ok(updated);
};

const getSessionById = (
  sessions: Map<string, Session>,
  sessionId: string
): Result<Session, SessionStoreError> => {
  const existing = sessions.get(sessionId);
  if (!existing) {
    return err({
      code: SessionStoreErrorCode.NotFound,
      message: ErrorMessage.NotFound
    });
  }

  return ok(existing);
};

const createSessionEntity = (input: {
  projectId: string;
  status: SessionStatus;
}): Session => {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    projectId: input.projectId,
    status: input.status,
    createdAt: now,
    updatedAt: now
  };
};
