# AnchorRead

AnchorRead is a Chrome extension prototype and planned macOS companion for asking
independent follow-up questions about selected AI-generated text or code.
It is not affiliated with OpenAI.

## Status

The Chrome extension is an early **mock-only** prototype. It detects selected
text in supported ChatGPT assistant responses, opens an independent panel,
and streams deterministic mock answers. No real model is called. The desktop
application, real context construction, sending previews, BYOK model calls,
history, and recovery are not implemented.

## Structure

- `apps/extension`: Manifest V3 extension, ChatGPT selection adapter, and
  independent mock follow-up panel.
- `apps/desktop`: placeholder for the React/Tauri macOS companion.
- `packages/domain`: platform-independent anchor and context-builder contracts.
- `packages/model`: model-client contract and deterministic mock; no real
  provider implementation or key storage.
- `packages/ui`: placeholder for shared React components.
- `tests`: Vitest contract and mock tests, plus Playwright extension tests
  against a controlled ChatGPT-shaped page fixture.

The workspace uses npm, TypeScript, React, Vite, Vitest, and Playwright.
Workspace package exports point to TypeScript source for the bundler; these
private packages are not distribution-ready. The Tauri project is not yet set
up.

## Setup and checks

For the local environment configured on this machine, activate it in bash or
zsh before running the commands below:

```sh
source .venv/bin/activate
```

The local activation adds project-local Node and Rust to `PATH` and directs
their caches, pip's cache, and temporary files into `.venv`. Run `deactivate`
to restore the previous shell environment. The ignored `.venv` is specific to
this machine and is not included in the repository. It depends on the system
Python interpreter and macOS Command Line Tools; it is not a security sandbox.
There are no project Python dependencies. npm installs workspace dependencies
in the project-local `node_modules/`, not inside `.venv` or globally.

On another machine, install Node.js and npm using the [official Node.js
instructions](https://nodejs.org/), or set up an equivalent local toolchain.
Node 24 LTS is recommended; the supported minimum is Node 20.19 or 22.12 on
the corresponding release lines.

```sh
npm ci
npm run typecheck
npm test
npm run build
```

`build` compiles shared TypeScript and creates an unpacked extension in
`apps/extension/dist/`. It does not produce a macOS app.

To run the browser tests with browser binaries isolated inside the local
environment:

```sh
export PLAYWRIGHT_BROWSERS_PATH="$PWD/.venv/ms-playwright"
npx playwright install chromium --no-shell  # once, or after a browser version update
npm run test:browser
```

The browser tests rebuild the extension, load its actual manifest in an
isolated Chromium profile, and intercept the ChatGPT URL with a local fixture.
They do not access a real ChatGPT account. No API key is required.

## Load and manually verify the prototype

1. Run `npm run build`, open Chrome's `chrome://extensions`, enable Developer
   mode, and choose **Load unpacked**. Select `apps/extension/dist/`.
2. Open or reload `https://chatgpt.com/` and navigate to an existing response.
   Select a short portion of assistant text or code and choose **Ask about
   this**. Check that the selected text appears in the panel and that opening
   and closing the panel does not change the page's reading position.
3. Ask a question. The output is a fixed fixture, not an explanation. Use
   **Mock scenario** to exercise failure before output and failure after the
   first chunk; use **Stop** to test cancellation. Check that partial output and
   failure/cancellation remain visible and that the original ChatGPT composer
   and conversation are unchanged.
4. Check keyboard activation, Escape, scrolling, selecting outside an assistant
   message, and selecting across messages. On pages without role markers, the
   action and panel must label the source as unverified. After rebuilding, reload the
   extension in `chrome://extensions` and then reload the ChatGPT page. Record
   the Chrome and ChatGPT versions and any incompatible page
   structures, without recording private content.

The extension only injects on `https://chatgpt.com/*`, requests no additional
permissions, and communicates with no model or external server. It relies on
ChatGPT's `data-message-author-role` or `data-turn` DOM attributes, which may
change. When any recognized role marker is present, selection must belong to a
single verified assistant response. When no such markers are present,
compatibility mode accepts manually selected ordinary page text and labels its
source **unverified**. This mode cannot tell whether text is from an assistant
or a user, or whether the selection crosses messages. Forms and
interactive/editable controls remain excluded in both modes. Other real-website
and account-specific variants have not been verified by automated fixture
tests. The extension does not submit to the ChatGPT page or access its
credentials. Selection is limited to 8,000 UTF-16 code units. There is no
persistence: closing the panel or refreshing loses the mock conversation.

For future Tauri development, install Rust and Cargo and follow the [Tauri
prerequisites](https://v2.tauri.app/start/prerequisites/). On macOS, Xcode
Command Line Tools are sufficient for desktop development according to that
guide; a successful desktop build and packaging still need to be verified.

## Contract boundaries

Both entry points will use `Anchor`, `ContextBuilder`, and `ModelClient`.
The domain package has a separate type check without DOM types. A desktop
source is marked unknown unless reliably identified; accessibility capture is
reserved for a later opt-in experiment. `beforeText` and `afterText` represent
the same web answer, never desktop manual context. Manual context is separately
user-supplied and may accompany any context mode.

These are implementation requirements, not implemented behavior:

- The builder must reject empty or oversized core text and invalid budgets,
  never truncate the core, and only use supported context for the selected mode.
- Budgets and omission ranges use UTF-16 code units, with zero-based,
  half-open ranges relative to the original input field or history message.
  Every omitted range is reported; a removed history message is represented by
  its index and full range. The result's request is the exact content to
  preview and pass to the model client, not a separately rebuilt version.
- Any changes after preview require rebuilding and renewed user confirmation.
  The model client must surface failures and cancellation rather than return a
  successful empty answer; a future UI must preserve partial streamed output
  and distinguish failure from cancellation.

## Intended data and privacy boundaries

The MVP is intended to keep browser and desktop history in separate local
stores, without automatic sync. It will send only user-confirmed content to a
user-configured model provider using a user-supplied API key (BYOK); API billing
may be separate from a ChatGPT subscription. There is no backend in this
foundation. Future work must explain the actual storage and permission
limitations; local storage is not automatically encrypted, and a Chrome
extension's storage is not equivalent to the macOS Keychain. No keys, cookies,
session tokens, or complete user text should be put in logs or committed.

Desktop MVP capture is planned as explicit copy and paste; no background clipboard
monitoring or accessibility permission is required. Neither automatic
selection capture nor Codex App Server is an MVP dependency.

## Small-scope technical validation plans

These are plans, not completed experiments. Use only disposable, nonsensitive
test content and record the date, macOS version, target app versions, test
method, result, and limitations; do not record selected text or credentials.

### Optional macOS selection capture

1. In a separate throwaway native prototype, after an explicit user action,
   request accessibility permission and attempt to read the focused element's
   [`kAXSelectedTextAttribute`](https://developer.apple.com/documentation/applicationservices/kaxselectedtextattribute).
   Test selected text and code in both real ChatGPT and Codex desktop clients.
2. Record success, unsupported or empty attributes, denied permission, and
   target-app/version-specific failures. Test with permission denied and with
   no valid selection. Do not monitor the clipboard or simulate copying.
3. Only consider an opt-in enhancement if the observed target versions expose
   a reliable selection and failures are clearly reported. Otherwise mark it
   unsupported and retain the explicit copy/paste path. This prototype does not
   establish access to the original conversation or a reliable screen position.

### Optional Codex App Server

1. Review the current [official App Server
   documentation](https://learn.chatgpt.com/docs/app-server) and record the
   server/client versions and account/environment used. Authenticate only via
   the supported official flow; never read or copy credential files.
2. With a disposable session and user-selected test content, verify whether a
   user-selected session is accessible; do not assume the current session can be
   discovered. Compare a new independent session with a fork, including which
   history, code, and tool results are included. Never resume or append to the
   original conversation.
3. In an isolated test environment, check whether tools, file access, command
   execution, and other side effects can all be disabled. Stop if that boundary
   cannot be verified. Confirm whether the exact outgoing context, privacy
   scope, and follow-up history can be previewed and explicitly approved.
4. Record evidence and limitations without secrets or original content.
   If any boundary remains unverified, mark the integration unsupported and
   continue with BYOK; do not make a fork the default.

## Next steps

Manually verify the prototype on the real ChatGPT website. Next implement the
context selection and preview, followed by a real BYOK model client. Later phases
add local history and recovery, followed by the macOS manual-paste MVP.