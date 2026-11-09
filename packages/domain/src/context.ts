import type { Anchor } from "./anchor";

export type ConversationMessage = {
  readonly role: "user" | "assistant";
  readonly content: string;
};

export type SupportingContext = {
  readonly beforeText?: string;
  readonly afterText?: string;
  readonly manualContext?: string;
};

export type AnchorPromptRequest = {
  readonly systemInstruction: string;
  readonly coreText: string;
  readonly supportingContext: SupportingContext;
  readonly history: readonly ConversationMessage[];
  readonly question: string;
};

// Character counts and offsets use JavaScript UTF-16 code units.
export type ContextBudget = {
  maxCoreCharacters: number;
  maxSupportingCharacters: number;
  maxHistoryCharacters: number;
};

export type ContextBuildInput = {
  anchor: Anchor;
  systemInstruction: string;
  history: readonly ConversationMessage[];
  question: string;
  budget: ContextBudget;
};

export type TextRange = {
  readonly start: number;
  readonly end: number;
};

export type ContextOmission =
  | {
      readonly field: "beforeText" | "afterText" | "manualContext";
      readonly reason: "budget";
      readonly range: TextRange;
    }
  | {
      readonly field: "history";
      readonly reason: "budget";
      readonly messageIndex: number;
      readonly range: TextRange;
    };

export type ContextBuildResult = {
  readonly request: AnchorPromptRequest;
  readonly omissions: readonly ContextOmission[];
};

/**
 * Builds a previewable request. Implementations must reject invalid input and
 * oversized core text, preserve the core, and report every budget omission.
 */
export interface ContextBuilder {
  build(input: ContextBuildInput): ContextBuildResult;
}
