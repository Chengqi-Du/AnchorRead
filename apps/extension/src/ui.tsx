import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { MockModelClient } from "@anchorread/model";
import type { MockScenario } from "@anchorread/model";
import { readSelection } from "./selection";
import type { SelectionResult, SelectionSnapshot } from "./selection";

type Message = {
  role: "user" | "assistant";
  content: string;
  status?: "streaming" | "complete" | "failed" | "cancelled";
};

function position(rect: SelectionSnapshot["rect"], width: number, height = 44) {
  const left = Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8));
  const top = Math.min(rect.top >= height + 8 ? rect.top - height - 8 : rect.bottom + 8, window.innerHeight - height - 8);
  return { left, top: Math.max(8, top) };
}

export function App({ host }: { host: HTMLElement }) {
  const [selection, setSelection] = useState<SelectionResult>({ kind: "none" });
  const [anchor, setAnchor] = useState<Pick<SelectionSnapshot, "coreText" | "source"> | null>(null);
  const [question, setQuestion] = useState("");
  const [scenario, setScenario] = useState<MockScenario>("success");
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState("");
  const [streaming, setStreaming] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const selectionRef = useRef<SelectionResult>({ kind: "none" });

  useEffect(() => {
    let suspended = false;
    const update = () => {
      if (suspended || host.shadowRoot?.activeElement) return;
      const currentSelection = window.getSelection();
      const selectionNode = currentSelection?.anchorNode;
      if (selectionNode && (selectionNode === host || selectionNode.getRootNode() === host.shadowRoot)) return;
      const next = readSelection(currentSelection);
      selectionRef.current = next;
      setSelection(next);
    };
    const hide = () => {
      selectionRef.current = { kind: "none" };
      setSelection({ kind: "none" });
    };
    const pointerDown = (event: PointerEvent) => {
      if (!event.composedPath().includes(host)) {
        suspended = false;
        hide();
      }
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        suspended = true;
        hide();
      } else if (!event.composedPath().includes(host)) {
        suspended = false;
      }
    };
    const scrollOrResize = () => {
      suspended = true;
      hide();
    };
    document.addEventListener("selectionchange", update);
    document.addEventListener("pointerdown", pointerDown);
    document.addEventListener("keydown", keyDown);
    window.addEventListener("scroll", scrollOrResize, true);
    window.addEventListener("resize", scrollOrResize);
    return () => {
      document.removeEventListener("selectionchange", update);
      document.removeEventListener("pointerdown", pointerDown);
      document.removeEventListener("keydown", keyDown);
      window.removeEventListener("scroll", scrollOrResize, true);
      window.removeEventListener("resize", scrollOrResize);
      controller.current?.abort();
    };
  }, [host]);

  function openAnchor() {
    const current = selectionRef.current;
    if (current.kind !== "valid") return;
    controller.current?.abort();
    controller.current = null;
    setAnchor({ coreText: current.snapshot.coreText, source: current.snapshot.source });
    setMessages([]);
    setError("");
    setQuestion("");
    setStreaming(false);
    selectionRef.current = { kind: "none" };
    setSelection({ kind: "none" });
  }

  function closePanel() {
    controller.current?.abort();
    controller.current = null;
    setAnchor(null);
    setStreaming(false);
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = question.trim();
    if (!text) {
      setError("Enter a question before sending.");
      return;
    }
    if (!anchor || controller.current) return;

    const current = new AbortController();
    controller.current = current;
    setStreaming(true);
    setError("");
    setQuestion("");
    const history = messages
      .filter((message) => message.status === undefined || message.status === "complete")
      .map(({ role, content }) => ({ role, content }));
    setMessages((previous) => [
      ...previous,
      { role: "user", content: text },
      { role: "assistant", content: "", status: "streaming" },
    ]);

    try {
      const client = new MockModelClient(scenario);
      for await (const chunk of client.streamAnchorAnswer({
        systemInstruction: "Answer only about the core anchor.",
        coreText: anchor.coreText,
        supportingContext: {},
        history,
        question: text,
      }, current.signal)) {
        if (controller.current !== current) return;
        setMessages((previous) => {
          const next = [...previous];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = { ...last, content: last.content + chunk };
          }
          return next;
        });
      }
      if (controller.current !== current) return;
      setMessages((previous) => updateLastStatus(previous, "complete"));
    } catch (caught) {
      if (controller.current !== current) return;
      const cancelled = current.signal.aborted;
      setMessages((previous) => updateLastStatus(previous, cancelled ? "cancelled" : "failed"));
      setError(cancelled ? "Generation cancelled." : caught instanceof Error ? caught.message : "The simulated model failed.");
    } finally {
      if (controller.current === current) {
        controller.current = null;
        setStreaming(false);
      }
    }
  }

  return (
    <>
      {selection.kind === "valid" && (
        <button
          className="anchor-button"
          style={position(selection.snapshot.rect, 180, selection.snapshot.source === "unverified" ? 62 : 44)}
          onMouseDown={(event) => event.preventDefault()}
          onClick={openAnchor}
        >
          Ask about this
          {selection.snapshot.source === "unverified" && (
            <span className="source-label">Unverified source</span>
          )}
        </button>
      )}
      {selection.kind === "invalid" && (
        <div className="selection-error" role="status" style={position(selection.rect, 320)}>
          {selection.message}
        </div>
      )}
      {anchor !== null && (
        <aside className="panel" aria-label="AnchorRead follow-up">
          <header>
            <div><strong>AnchorRead</strong><span>Mock preview</span></div>
            <button type="button" onClick={closePanel} aria-label="Close AnchorRead">Close</button>
          </header>
          <p className="notice">Simulated answers only. No model is contacted and nothing is sent to ChatGPT.</p>
          {anchor.source === "unverified" && (
            <p className="source-warning" role="status">
              Source not verified. The selection may include user messages or span multiple messages.
            </p>
          )}
          <section aria-label="Core anchor">
            <h2>Core anchor</h2>
            <pre>{anchor.coreText}</pre>
          </section>
          <section className="conversation" aria-label="Follow-up conversation" aria-live="polite">
            {messages.map((message, index) => (
              <div className={`message ${message.role}`} key={index}>
                <strong>{message.role === "user" ? "You" : "Mock assistant"}</strong>
                <p>{message.content || (message.status === "streaming" ? "Generating…" : "")}</p>
                {message.status === "failed" && <small>Incomplete: failed</small>}
                {message.status === "cancelled" && <small>Incomplete: cancelled</small>}
              </div>
            ))}
          </section>
          {error && <p className="error" role="alert">{error}</p>}
          <form onSubmit={submit}>
            <label htmlFor="anchorread-scenario">Mock scenario</label>
            <select id="anchorread-scenario" value={scenario} onChange={(event) => {
              const value = event.target.value;
              if (value === "success" || value === "error" || value === "partial-error") setScenario(value);
            }} disabled={streaming}>
              <option value="success">Success</option>
              <option value="error">Fail before answer</option>
              <option value="partial-error">Fail after first chunk</option>
            </select>
            <label htmlFor="anchorread-question">Your question</label>
            <textarea id="anchorread-question" value={question} onChange={(event) => setQuestion(event.target.value)} rows={3} />
            <div className="actions">
              <button type="submit" disabled={streaming}>Ask</button>
              {streaming && <button type="button" onClick={() => controller.current?.abort()}>Stop</button>}
            </div>
          </form>
        </aside>
      )}
    </>
  );
}

function updateLastStatus(messages: Message[], status: Message["status"]): Message[] {
  const next = [...messages];
  const last = next[next.length - 1];
  if (last?.role === "assistant") next[next.length - 1] = { ...last, status };
  return next;
}
