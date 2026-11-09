export const MAX_ANCHOR_CHARACTERS = 8_000;

const MESSAGE_SELECTOR = "[data-message-author-role], [data-turn]";
const ROLE_MARKER_SELECTOR =
  '[data-message-author-role], [data-turn="assistant"], [data-turn="user"]';
const EDITABLE_SELECTOR =
  'form, input, textarea, select, option, [role="textbox"], [role="searchbox"], [role="combobox"], [contenteditable]:not([contenteditable="false"])';
const UNSUPPORTED_SELECTOR = `button, [role="button"], ${EDITABLE_SELECTOR}`;

export type SelectionSnapshot = {
  coreText: string;
  source: "verified-assistant" | "unverified";
  rect: { left: number; top: number; bottom: number; width: number };
};

export type SelectionResult =
  | { kind: "none" }
  | { kind: "invalid"; message: string; rect: SelectionSnapshot["rect"] }
  | { kind: "valid"; snapshot: SelectionSnapshot };

function parentElement(node: Node): Element | null {
  return node.nodeType === Node.ELEMENT_NODE
    ? (node as Element)
    : node.parentElement;
}

function selectedMessage(range: Range): Element | null {
  const root = range.commonAncestorContainer;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null = root.nodeType === Node.TEXT_NODE ? root : walker.nextNode();
  let message: Element | null = null;
  let visited = 0;

  while (node) {
    if (++visited > 10_000) return null;
    const text = node as Text;
    if (range.comparePoint(text, 0) > 0) break;
    if (
      text.length > 0 &&
      range.intersectsNode(text) &&
      range.comparePoint(text, text.length) >= 0 &&
      range.comparePoint(text, 0) <= 0 &&
      !(range.startContainer === text && range.startOffset === text.length) &&
      !(range.endContainer === text && range.endOffset === 0)
    ) {
      const element = text.parentElement;
      if (!element) return null;
      const owner = element.closest(MESSAGE_SELECTOR);
      const role = owner?.getAttribute("data-message-author-role") ?? owner?.getAttribute("data-turn");
      if (!owner || role !== "assistant" || (message && owner !== message)) return null;
      message = owner;
    }
    node = walker.nextNode();
  }
  return message;
}

export function readSelection(selection: Selection | null): SelectionResult {
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) {
    return { kind: "none" };
  }

  const range = selection.getRangeAt(0);
  const bounds = range.getBoundingClientRect();
  const rect = {
    left: bounds.left,
    top: bounds.top,
    bottom: bounds.bottom,
    width: bounds.width,
  };
  const start = parentElement(range.startContainer);
  const end = parentElement(range.endContainer);

  if (!start || !end || start.closest(EDITABLE_SELECTOR) || end.closest(EDITABLE_SELECTOR)) {
    return { kind: "none" };
  }

  const hasRoleMarkers = document.querySelector(ROLE_MARKER_SELECTOR) !== null;
  const message = hasRoleMarkers ? selectedMessage(range) : null;
  if (hasRoleMarkers && !message) {
    return {
      kind: "invalid",
      message: "Select text within a single ChatGPT assistant response.",
      rect,
    };
  }

  const contents = range.cloneContents();
  if (
    start.closest(UNSUPPORTED_SELECTOR) ||
    end.closest(UNSUPPORTED_SELECTOR) ||
    contents.querySelector(UNSUPPORTED_SELECTOR)
  ) {
    return {
      kind: "invalid",
      message: "Select text or code without interactive controls.",
      rect,
    };
  }

  const nestedMessages = Array.from(contents.querySelectorAll(MESSAGE_SELECTOR));
  const outerMessages = nestedMessages.filter(
    (element) => !element.parentElement?.closest(MESSAGE_SELECTOR),
  );
  const hasOtherRole = nestedMessages.some((element) => {
    const role = element.getAttribute("data-message-author-role") ?? element.getAttribute("data-turn");
    return role !== "assistant";
  });
  if (
    message &&
    (hasOtherRole ||
      outerMessages.length > 1 ||
      (nestedMessages.length > 0 &&
        (message.contains(range.startContainer) || message.contains(range.endContainer))))
  ) {
    return {
      kind: "invalid",
      message: "Select text within a single ChatGPT assistant response.",
      rect,
    };
  }

  const coreText = selection.toString();
  if (!coreText.trim()) {
    return { kind: "invalid", message: "Select non-empty text or code.", rect };
  }
  if (coreText.length > MAX_ANCHOR_CHARACTERS) {
    return {
      kind: "invalid",
      message: `Selection is too long. Select at most ${MAX_ANCHOR_CHARACTERS.toLocaleString("en-US")} characters.`,
      rect,
    };
  }
  return {
    kind: "valid",
    snapshot: { coreText, rect, source: message ? "verified-assistant" : "unverified" },
  };
}
