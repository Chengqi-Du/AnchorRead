import type { AnchorPromptRequest } from "@anchorread/domain";
import type { ModelClient } from "./index";

export type MockScenario = "success" | "error" | "partial-error";

function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    function onAbort() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(signal?.reason);
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export class MockModelClient implements ModelClient {
  constructor(
    private readonly scenario: MockScenario = "success",
    private readonly delayMs = 180,
  ) {}

  async *streamAnchorAnswer(
    _request: AnchorPromptRequest,
    signal?: AbortSignal,
  ): AsyncIterable<string> {
    await wait(this.delayMs, signal);
    if (this.scenario === "error") {
      throw new Error("Simulated model error. Please try again.");
    }
    yield "This is a simulated answer. ";
    await wait(this.delayMs, signal);
    if (this.scenario === "partial-error") {
      throw new Error("Simulated stream interruption. Please try again.");
    }
    yield "No model was contacted and no content was sent.";
  }
}
