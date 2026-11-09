import type { AnchorPromptRequest } from "@anchorread/domain";

export { MockModelClient } from "./mock";
export type { MockScenario } from "./mock";

export interface ModelClient {
  streamAnchorAnswer(
    request: AnchorPromptRequest,
    signal?: AbortSignal,
  ): AsyncIterable<string>;
}
