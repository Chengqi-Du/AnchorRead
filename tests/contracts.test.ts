import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  Anchor,
  AnchorPromptRequest,
  ContextBuilder,
  ContextBuildResult,
} from "@anchorread/domain";
import type { ModelClient } from "@anchorread/model";

describe("shared contracts", () => {
  it("represents web and desktop sources without platform objects", () => {
    const web: Anchor = {
      id: "web-1",
      source: {
        type: "chatgpt-web",
        conversationUrl: "https://chatgpt.com/c/example",
        messageFingerprint: "example",
      },
      coreText: "selected text",
      manualContext: "",
      contextMode: "before-and-after",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    const desktop: Anchor = {
      ...web,
      source: {
        type: "desktop",
        application: "unknown",
        captureMethod: "paste",
      },
      contextMode: "anchor-only",
    };

    expect(web.source.type).toBe("chatgpt-web");
    expect(desktop.source.type).toBe("desktop");
    expect(desktop.source).not.toHaveProperty("conversationId");
  });

  it("passes the exact preview request to the model contract", async () => {
    const result: ContextBuildResult = {
      request: {
        systemInstruction: "Answer about the anchor.",
        coreText: "selected text",
        supportingContext: { manualContext: "user supplied" },
        history: [{ role: "user", content: "Earlier question" }],
        question: "Why?",
      },
      omissions: [
        {
          field: "history",
          reason: "budget",
          messageIndex: 0,
          range: { start: 0, end: 5 },
        },
      ],
    };
    const received: AnchorPromptRequest[] = [];
    const client: ModelClient = {
      async *streamAnchorAnswer(request, signal) {
        signal?.throwIfAborted();
        received.push(request);
        yield "fixture";
      },
    };

    const chunks: string[] = [];
    for await (const chunk of client.streamAnchorAnswer(result.request)) {
      chunks.push(chunk);
    }

    expect(received).toEqual([result.request]);
    expect(chunks).toEqual(["fixture"]);
    expect(result.omissions[0]?.field).toBe("history");
  });

  it("defines synchronous context building and cancellable streaming", () => {
    expectTypeOf<ContextBuilder["build"]>().returns.toEqualTypeOf<ContextBuildResult>();
    expectTypeOf<ModelClient["streamAnchorAnswer"]>()
      .returns.toEqualTypeOf<AsyncIterable<string>>();
  });
});
