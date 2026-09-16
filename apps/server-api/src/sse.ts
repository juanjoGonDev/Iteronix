import type { ServerResponse } from "node:http";
import { HeaderName, HeaderValue, HttpStatus, MimeType } from "./constants";

type SseEvent = {
  event: string;
  data: unknown;
  id?: string;
};

export type SseStream = {
  send: (event: SseEvent) => void;
  close: () => void;
};

const SseField = {
  Event: "event",
  Data: "data",
  Id: "id",
} as const;

export const createSseStream = (res: ServerResponse): SseStream => {
  res.statusCode = HttpStatus.Ok;
  res.setHeader(HeaderName.ContentType, MimeType.EventStream);
  res.setHeader(HeaderName.CacheControl, HeaderValue.NoCache);
  res.setHeader(HeaderName.Connection, HeaderValue.KeepAlive);
  writeSsePayload(res, "\n");

  const send = (event: SseEvent): void => {
    writeSsePayload(res, formatSseEvent(event));
  };

  const close = (): void => {
    if (isResponseClosed(res)) {
      return;
    }

    try {
      res.end();
    } catch {
      return;
    }
  };

  return {
    send,
    close,
  };
};

const escapeSseText = (value: string): string =>
  value.replace(
    /[<>&'\r\n\u2028\u2029]/gu,
    (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );

const formatSseEvent = (event: SseEvent): string => {
  const lines: string[] = [];

  if (event.id) {
    lines.push(`${SseField.Id}: ${escapeSseText(event.id)}`);
  }

  lines.push(`${SseField.Event}: ${escapeSseText(event.event)}`);
  lines.push(`${SseField.Data}: ${escapeSseText(JSON.stringify(event.data))}`);
  lines.push("");

  return `${lines.join("\n")}\n`;
};

const writeSsePayload = (res: ServerResponse, payload: string): void => {
  if (isResponseClosed(res)) {
    return;
  }

  try {
    res.write(payload);
  } catch {
    return;
  }
};

const isResponseClosed = (res: ServerResponse): boolean =>
  res.writableEnded || res.destroyed;
