import { apiUrl, errorFromResponse } from "@/lib/api/client";
import type { PlanStreamEvent } from "@/lib/types";

export interface SseMessage {
  event: string;
  data: string;
}

export class StreamProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StreamProtocolError";
  }
}

/**
 * Incremental parser for the text/event-stream wire format. `fetch` is used (not EventSource)
 * because plan requests are POSTs with a JSON body. Chunks may split anywhere, including inside
 * a multi-byte character or a "\r\n" pair.
 */
export function createSseParser(onMessage: (msg: SseMessage) => void) {
  let buffer = "";

  const dispatch = (block: string) => {
    let event = "message";
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (line === "" || line.startsWith(":")) continue; // blank or comment (keep-alive)
      const idx = line.indexOf(":");
      const field = idx === -1 ? line : line.slice(0, idx);
      let value = idx === -1 ? "" : line.slice(idx + 1);
      if (value.startsWith(" ")) value = value.slice(1);
      if (field === "event") event = value;
      else if (field === "data") data.push(value);
    }
    if (data.length > 0) onMessage({ event, data: data.join("\n") });
  };

  const drain = (final: boolean) => {
    buffer = buffer.replace(/\r\n?/g, "\n");
    let sep = buffer.indexOf("\n\n");
    while (sep !== -1) {
      dispatch(buffer.slice(0, sep));
      buffer = buffer.slice(sep + 2);
      sep = buffer.indexOf("\n\n");
    }
    if (final && buffer.trim() !== "") {
      dispatch(buffer);
      buffer = "";
    }
  };

  return {
    push(chunk: string) {
      buffer += chunk;
      // Hold back a trailing "\r" so "\r" + "\n" split across chunks isn't read as two newlines.
      const held = buffer.endsWith("\r") ? "\r" : "";
      buffer = buffer.slice(0, buffer.length - held.length);
      drain(false);
      buffer += held;
    },
    flush() {
      drain(true);
    },
  };
}

const EVENT_TYPES = new Set(["status", "stop", "complete", "error"]);

/** Trust boundary: confirm the discriminant before handing JSON to typed code. */
export function isPlanStreamEvent(value: unknown): value is PlanStreamEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    EVENT_TYPES.has((value as { type?: unknown }).type as string)
  );
}

interface StreamOptions {
  signal?: AbortSignal;
  onEvent: (event: PlanStreamEvent) => void;
}

export async function streamPlanEvents(
  path: string,
  body: unknown,
  { signal, onEvent }: StreamOptions,
): Promise<void> {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw await errorFromResponse(res);
  if (!res.body) throw new StreamProtocolError("The server sent an empty response.");

  const parser = createSseParser((msg) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(msg.data);
    } catch {
      throw new StreamProtocolError("The server sent a malformed event.");
    }
    if (!isPlanStreamEvent(parsed)) throw new StreamProtocolError("Unknown event type received.");
    onEvent(parsed);
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.push(decoder.decode(value, { stream: true }));
  }
  parser.push(decoder.decode());
  parser.flush();
}
