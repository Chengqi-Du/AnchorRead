import { describe, expect, it } from "vitest";
import { MockModelClient } from "@anchorread/model";
import type { AnchorPromptRequest } from "@anchorread/domain";

const request: AnchorPromptRequest = {
  systemInstruction: "fixture",
  coreText: "selected text",
  supportingContext: {},
  history: [],
  question: "Why?",
};

describe("mock model", () => {
  it("streams deterministic chunks", async () => {
    const chunks: string[] = [];
    for await (const chunk of new MockModelClient("success", 0).streamAnchorAnswer(request)) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual([
      "This is a simulated answer. ",
      "No model was contacted and no content was sent.",
    ]);
  });

  it("fails explicitly before output", async () => {
    const stream = new MockModelClient("error", 0).streamAnchorAnswer(request)[Symbol.asyncIterator]();
    await expect(stream.next()).rejects.toThrow("Simulated model error");
  });

  it("preserves the first chunk before a simulated interruption", async () => {
    const stream = new MockModelClient("partial-error", 0).streamAnchorAnswer(request)[Symbol.asyncIterator]();
    expect((await stream.next()).value).toBe("This is a simulated answer. ");
    await expect(stream.next()).rejects.toThrow("Simulated stream interruption");
  });

  it("responds to cancellation while waiting", async () => {
    const abort = new AbortController();
    const stream = new MockModelClient("success", 10_000).streamAnchorAnswer(request, abort.signal)[Symbol.asyncIterator]();
    const next = stream.next();
    abort.abort();
    await expect(next).rejects.toMatchObject({ name: "AbortError" });
  });
});
