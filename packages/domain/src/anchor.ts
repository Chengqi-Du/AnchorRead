export type AnchorSource =
  | {
      type: "chatgpt-web";
      conversationUrl: string;
      messageId?: string;
      messageFingerprint: string;
      startOffset?: number;
      endOffset?: number;
    }
  | {
      type: "desktop";
      application: "chatgpt" | "codex" | "unknown";
      captureMethod: "paste" | "accessibility";
      conversationId?: string;
    };

export type ContextMode = "anchor-only" | "before" | "before-and-after";

export type Anchor = {
  id: string;
  source: AnchorSource;
  coreText: string;
  beforeText?: string;
  afterText?: string;
  manualContext: string;
  contextMode: ContextMode;
  createdAt: string;
  updatedAt: string;
};
