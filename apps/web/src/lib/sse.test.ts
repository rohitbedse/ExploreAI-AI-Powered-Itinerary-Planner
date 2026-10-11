import { describe, expect, it } from "vitest";
import { createSseParser, isPlanStreamEvent, type SseMessage } from "./sse";

function parse(chunks: string[]): SseMessage[] {
  const out: SseMessage[] = [];
  const p = createSseParser((m) => out.push(m));
  for (const c of chunks) p.push(c);
  p.flush();
  return out;
}

describe("createSseParser", () => {
  it("parses a single event", () => {
    expect(parse(['data: {"a":1}\n\n'])).toEqual([{ event: "message", data: '{"a":1}' }]);
  });

  it("handles events split across arbitrary chunk boundaries", () => {
    const wire = 'event: x\ndata: one\n\ndata: two\n\n';
    const bytes = [...wire]; // one character per chunk
    expect(parse(bytes)).toEqual([
      { event: "x", data: "one" },
      { event: "message", data: "two" },
    ]);
  });

  it("joins multi-line data with newlines", () => {
    expect(parse(["data: a\ndata: b\n\n"])).toEqual([{ event: "message", data: "a\nb" }]);
  });

  it("ignores comments / keep-alives", () => {
    expect(parse([": ping\n\ndata: hi\n\n"])).toEqual([{ event: "message", data: "hi" }]);
  });

  it("supports CRLF, including a CR/LF pair split across chunks", () => {
    expect(parse(["data: a\r", "\n\r", "\ndata: b\r\n\r\n"])).toEqual([
      { event: "message", data: "a" },
      { event: "message", data: "b" },
    ]);
  });

  it("flushes a final event that lacks the trailing blank line", () => {
    expect(parse(["data: tail"])).toEqual([{ event: "message", data: "tail" }]);
  });
});

describe("isPlanStreamEvent", () => {
  it("accepts known discriminants and rejects the rest", () => {
    expect(isPlanStreamEvent({ type: "status" })).toBe(true);
    expect(isPlanStreamEvent({ type: "bogus" })).toBe(false);
    expect(isPlanStreamEvent(null)).toBe(false);
    expect(isPlanStreamEvent("status")).toBe(false);
  });
});
