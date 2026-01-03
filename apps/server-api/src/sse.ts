import type { ServerResponse } from "node:http";
import { HeaderName, HeaderValue, HttpStatus, MimeType } from "./constants";

export type SseEvent = {
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
  Id: "id"
} as const;

export const createSseStream = (res: ServerResponse): SseStream => {
  res.statusCode = HttpStatus.Ok;
  res.setHeader(HeaderName.ContentType, MimeType.EventStream);
  res.setHeader(HeaderName.CacheControl, HeaderValue.NoCache);
  res.setHeader(HeaderName.Connection, HeaderValue.KeepAlive);
  res.write("\n");

  const send = (event: SseEvent): void => {
    const payload = formatSseEvent(event);
    res.write(payload);
  };

  const close = (): void => {
    res.end();
  };

  return {
    send,
    close
  };
};

const formatSseEvent = (event: SseEvent): string => {
  const lines: string[] = [];

  if (event.id) {
    lines.push(`${SseField.Id}: ${event.id}`);
  }

  lines.push(`${SseField.Event}: ${event.event}`);
  lines.push(`${SseField.Data}: ${JSON.stringify(event.data)}`);
  lines.push("");

  return `${lines.join("\n")}\n`;
};