import { test as base, expect, chromium } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
import { resolve } from "node:path";

const extensionPath = resolve("apps/extension/dist");
const html = `<!doctype html>
<html><head><title>ChatGPT fixture</title></head><body style="margin:0">
<main style="padding:80px 30px;height:3000px">
  <div data-message-author-role="user" id="user">User question</div>
  <div data-message-author-role="assistant" id="answer">
    <p id="first">The selected answer explains a concept.</p><span id="spaces">   </span>
    <pre id="code"><code>const value = 42;</code></pre>
    <button id="inside-button">A page control</button>
  </div>
  <div data-message-author-role="assistant" id="second">A different answer.</div>
  <div data-message-author-role="assistant" id="standard-boundary"><p>Standard response</p></div>
  <div id="turn-fixtures"><article data-turn="assistant" id="alternate-answer"><div class="markdown"><p id="alternate-text">你好！你想让我帮你做什么？</p></div></article><article data-turn="user" id="alternate-user">User message</article><article data-turn="assistant" id="other-answer">Another response</article></div>
  <input id="sensitive" value="sensitive fixture" />
  <div data-message-author-role="assistant"><p id="long">${"x".repeat(8001)}</p></div>
  <form id="chat-form"><textarea id="chat-input"></textarea><button type="submit">Send message</button></form>
</main>
<script>
window.fixtureSends = 0;
document.querySelector('#chat-form').addEventListener('submit', event => {
  event.preventDefault();
  window.fixtureSends++;
});
</script>
</body></html>`;

const unsupportedHtml = `<!doctype html>
<html><head><meta charset="utf-8"></head><body>
<main><div><p id="unverified">助手回答中的一段文字。</p></div>
<div><p id="unverified-user">一段用户消息。</p></div>
<div role="button" id="unverified-button">A page control</div>
<form><p id="form-text">Form text</p><input type="password" value="sensitive fixture"></form>
<div contenteditable="true" id="editable">Editable fixture</div>
<p id="unverified-long" style="word-break:break-all">${"x".repeat(8001)}</p>
</main>
</body></html>`;

const partialMarkersHtml = `<!doctype html>
<html><body><main>
<p id="unmarked">Unmarked page text</p>
<div data-message-author-role="user" id="marked-user">User message</div>
</main></body></html>`;

const test = base.extend<{ extensionContext: BrowserContext; fixturePage: Page }>({
  extensionContext: async ({}, use, testInfo) => {
    const context = await chromium.launchPersistentContext(testInfo.outputPath("profile"), {
      channel: "chromium",
      headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    await context.route("**/*", async (route) => {
      if (
        route.request().url() === "https://chatgpt.com/c/fixture" ||
        route.request().url() === "https://example.com/fixture"
      ) {
        await route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
      } else if (route.request().url() === "https://chatgpt.com/c/unsupported") {
        await route.fulfill({ contentType: "text/html; charset=utf-8", body: unsupportedHtml });
      } else if (route.request().url() === "https://chatgpt.com/c/partial-markers") {
        await route.fulfill({ contentType: "text/html; charset=utf-8", body: partialMarkersHtml });
      } else {
        await route.abort();
      }
    });
    await use(context);
    await context.close();
  },
  fixturePage: async ({ extensionContext }, use) => {
    const page = await extensionContext.newPage();
    await page.goto("https://chatgpt.com/c/fixture");
    await expect(page.locator("#anchorread-extension-root")).toHaveCount(1);
    await use(page);
  },
});

async function selectText(page: Page, start: string, end = start) {
  await page.evaluate(({ start, end }) => {
    document.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    const first = document.querySelector(start)?.firstChild;
    const last = document.querySelector(end)?.firstChild;
    if (!first || !last) throw new Error("Missing selection fixture");
    const range = document.createRange();
    range.setStart(first, 0);
    range.setEnd(last, last.textContent?.length ?? 0);
    const selected = window.getSelection();
    if (!selected) throw new Error("Selection API unavailable");
    selected.removeAllRanges();
    selected.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  }, { start, end });
}

async function openPanel(page: Page, selector = "#first") {
  await selectText(page, selector);
  await page.getByRole("button", { name: "Ask about this" }).click();
  await expect(page.getByRole("complementary", { name: "AnchorRead follow-up" })).toBeVisible();
}

test("captures a selection, streams an answer, and does not send or scroll the page", async ({ fixturePage: page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => externalRequests.push(request.url()));
  const before = await page.evaluate(() => window.scrollY);
  const beforeTop = await page.locator("#first").evaluate((element) => element.getBoundingClientRect().top);
  await openPanel(page);
  expect(await page.locator("#first").evaluate((element) => element.getBoundingClientRect().top)).toBe(beforeTop);
  await expect(page.getByRole("region", { name: "Core anchor" })).toContainText("The selected answer explains a concept.");
  await page.getByLabel("Your question").fill("Why?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByText("This is a simulated answer.", { exact: false })).toBeVisible();
  await expect(page.getByText("No model was contacted and no content was sent.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Close AnchorRead" }).click();
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
  expect(await page.evaluate(() => Reflect.get(window, "fixtureSends"))).toBe(0);
  expect(externalRequests).toEqual([]);
});

test("supports a real mouse selection and click", async ({ fixturePage: page }) => {
  const points = await page.evaluate(() => {
    const node = document.querySelector("#first")?.firstChild;
    if (!node) throw new Error("Missing selection fixture");
    const range = document.createRange();
    range.setStart(node, 4);
    range.setEnd(node, 19);
    const rect = range.getBoundingClientRect();
    return { left: rect.left + 1, right: rect.right - 1, y: rect.top + rect.height / 2 };
  });
  await page.mouse.move(points.left, points.y);
  await page.mouse.down();
  await page.mouse.move(points.right, points.y, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Ask about this" }).click();
  await expect(page.getByRole("region", { name: "Core anchor" })).toContainText("selected");
});

test("recognizes assistant turn markup and element-boundary selections", async ({ fixturePage: page }) => {
  await selectText(page, "#alternate-text");
  await page.getByRole("button", { name: "Ask about this" }).click();
  await expect(page.getByRole("region", { name: "Core anchor" })).toContainText("你好！");
  await page.getByRole("button", { name: "Close AnchorRead" }).click();

  await page.evaluate(() => {
    const element = document.querySelector("#alternate-answer");
    if (!element) throw new Error("Missing assistant turn fixture");
    document.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    const range = document.createRange();
    range.selectNode(element);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await page.getByRole("button", { name: "Ask about this" }).click();
  await expect(page.getByRole("region", { name: "Core anchor" })).toContainText("你想让我帮你做什么");
});

test("does not mistake user or multiple turn markup for an assistant response", async ({ fixturePage: page }) => {
  await selectText(page, "#alternate-user");
  await expect(page.getByRole("status")).toContainText("single ChatGPT assistant response");
  await selectText(page, "#alternate-text", "#other-answer");
  await expect(page.getByRole("status")).toContainText("single ChatGPT assistant response");
  await expect(page.getByRole("button", { name: "Ask about this" })).toHaveCount(0);
});

test("allows a real selection on an unmarked page and labels the source unverified", async ({ extensionContext }) => {
  const page = await extensionContext.newPage();
  await page.goto("https://chatgpt.com/c/unsupported");
  await expect(page.locator("#anchorread-extension-root")).toHaveCount(1);
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  const points = await page.evaluate(() => {
    const node = document.querySelector("#unverified")?.firstChild;
    if (!node) throw new Error("Missing unverified fixture");
    const range = document.createRange();
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    return { left: rect.left + 1, right: rect.right - 1, y: rect.top + rect.height / 2 };
  });
  await page.mouse.move(points.left, points.y);
  await page.mouse.down();
  await page.mouse.move(points.right, points.y, { steps: 8 });
  await page.mouse.up();
  const button = page.getByRole("button", { name: "Ask about this" });
  await expect(button).toContainText("Unverified source");
  await button.click();
  await expect(page.getByRole("region", { name: "Core anchor" })).toContainText("助手回答");
  await expect(page.getByRole("status")).toContainText("Source not verified");
  await page.getByLabel("Your question").fill("Explain");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByText("No model was contacted and no content was sent.", { exact: false })).toBeVisible();
  expect(requests).toEqual([]);
});

test("allows unverified user and cross-message text but rejects controls and forms", async ({ extensionContext }) => {
  const page = await extensionContext.newPage();
  await page.goto("https://chatgpt.com/c/unsupported");
  await expect(page.locator("#anchorread-extension-root")).toHaveCount(1);
  await selectText(page, "#unverified-user");
  await expect(page.getByRole("button", { name: "Ask about this" })).toContainText("Unverified source");
  await selectText(page, "#unverified", "#unverified-user");
  await page.getByRole("button", { name: "Ask about this" }).click();
  await expect(page.getByRole("region", { name: "Core anchor" })).toContainText("一段用户消息");
  await expect(page.getByRole("status")).toContainText("span multiple messages");
  await page.getByRole("button", { name: "Close AnchorRead" }).click();

  await selectText(page, "#unverified-button");
  await expect(page.getByRole("button", { name: "Ask about this" })).toHaveCount(0);
  await selectText(page, "#form-text");
  await expect(page.getByRole("button", { name: "Ask about this" })).toHaveCount(0);
  await selectText(page, "#editable");
  await expect(page.getByRole("button", { name: "Ask about this" })).toHaveCount(0);
  await selectText(page, "#unverified-long");
  await expect(page.getByRole("status")).toContainText("at most 8,000 characters");
  await expect(page.getByRole("button", { name: "Ask about this" })).toHaveCount(0);
});

test("keeps an unverified selection snapshot when keyboard focus changes", async ({ extensionContext }) => {
  const page = await extensionContext.newPage();
  await page.goto("https://chatgpt.com/c/unsupported");
  await expect(page.locator("#anchorread-extension-root")).toHaveCount(1);
  await selectText(page, "#unverified");
  const button = page.getByRole("button", { name: "Ask about this" });
  await button.focus();
  await page.evaluate(() => {
    window.getSelection()?.removeAllRanges();
    document.dispatchEvent(new Event("selectionchange"));
  });
  await button.press("Enter");
  await expect(page.getByRole("region", { name: "Core anchor" })).toContainText("助手回答");
  await expect(page.getByRole("status")).toContainText("Source not verified");
});

test("does not enable the fallback when the page has only a user role marker", async ({ extensionContext }) => {
  const page = await extensionContext.newPage();
  await page.goto("https://chatgpt.com/c/partial-markers");
  await expect(page.locator("#anchorread-extension-root")).toHaveCount(1);
  for (const selector of ["#unmarked", "#marked-user"]) {
    await selectText(page, selector);
    await expect(page.getByRole("status")).toContainText("single ChatGPT assistant response");
    await expect(page.getByRole("button", { name: "Ask about this" })).toHaveCount(0);
  }
});

test("accepts a whole standard assistant message selected at its parent boundary", async ({ fixturePage: page }) => {
  await page.evaluate(() => {
    const element = document.querySelector("#standard-boundary");
    if (!element) throw new Error("Missing assistant message fixture");
    const range = document.createRange();
    range.selectNode(element);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await page.getByRole("button", { name: "Ask about this" }).click();
  await expect(page.getByRole("region", { name: "Core anchor" })).toContainText("Standard response");
});

test("does not inject on unrelated sites", async ({ extensionContext }) => {
  const page = await extensionContext.newPage();
  await page.goto("https://example.com/fixture");
  await expect(page.locator("#anchorread-extension-root")).toHaveCount(0);
});

test("preserves the snapshot when selection is lost after keyboard focus", async ({ fixturePage: page }) => {
  await selectText(page, "#code code");
  const button = page.getByRole("button", { name: "Ask about this" });
  await button.focus();
  await page.evaluate(() => {
    window.getSelection()?.removeAllRanges();
    document.dispatchEvent(new Event("selectionchange"));
  });
  await button.press("Enter");
  await expect(page.getByRole("region", { name: "Core anchor" })).toContainText("const value = 42;");
});

test("rejects cross-message, user, interactive and overly long selections", async ({ fixturePage: page }) => {
  await selectText(page, "#spaces");
  await expect(page.getByRole("status")).toContainText("Select non-empty text");
  await selectText(page, "#first", "#second");
  await expect(page.getByRole("status")).toContainText("single ChatGPT assistant response");
  await selectText(page, "#user");
  await expect(page.getByRole("status")).toContainText("single ChatGPT assistant response");
  await selectText(page, "#first", "#inside-button");
  await expect(page.getByRole("status")).toContainText("interactive controls");
  await selectText(page, "#long");
  await expect(page.getByRole("status")).toContainText("at most 8,000 characters");
  await expect(page.getByRole("button", { name: "Ask about this" })).toHaveCount(0);
  await page.evaluate(() => {
    const node = document.querySelector("#long")?.firstChild;
    if (!node) throw new Error("Missing long fixture");
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, 8000);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await expect(page.getByRole("button", { name: "Ask about this" })).toHaveCount(1);
});

test("hides the action on Escape, scroll and outside pointer interaction", async ({ fixturePage: page }) => {
  const button = page.getByRole("button", { name: "Ask about this" });
  await selectText(page, "#first");
  await expect(button).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(button).toHaveCount(0);
  await selectText(page, "#first");
  await expect(button).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 100));
  await expect(button).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await selectText(page, "#first");
  await expect(button).toBeVisible();
  await page.locator("#user").click();
  await expect(button).toHaveCount(0);
});

test("shows validation, failure and partial stream interruption", async ({ fixturePage: page }) => {
  await openPanel(page);
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Enter a question before sending.");
  await page.getByLabel("Mock scenario").selectOption("error");
  await page.getByLabel("Your question").fill("Fail now");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Simulated model error");
  await page.getByLabel("Mock scenario").selectOption("partial-error");
  await page.getByLabel("Your question").fill("Interrupt");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Simulated stream interruption");
  await expect(page.getByText("This is a simulated answer.", { exact: false })).toBeVisible();
  await expect(page.getByText("Incomplete: failed")).toHaveCount(2);
});

test("allows cancellation without losing a streamed partial answer", async ({ fixturePage: page }) => {
  await openPanel(page);
  await page.getByLabel("Your question").fill("Stop this");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByText("This is a simulated answer.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByRole("alert")).toHaveText("Generation cancelled.");
  await expect(page.getByText("Incomplete: cancelled")).toBeVisible();
});

test("replacing an anchor cancels the old stream without mixing conversations", async ({ fixturePage: page }) => {
  await openPanel(page);
  await page.getByLabel("Your question").fill("First question");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByText("This is a simulated answer.", { exact: false })).toBeVisible();
  const points = await page.evaluate(() => {
    const node = document.querySelector("#second")?.firstChild;
    if (!node) throw new Error("Missing second response");
    const range = document.createRange();
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    return { left: rect.left + 1, right: rect.right - 1, y: rect.top + rect.height / 2 };
  });
  await page.mouse.move(points.left, points.y);
  await page.mouse.down();
  await page.mouse.move(points.right, points.y, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Ask about this" }).click();
  await expect(page.getByRole("region", { name: "Core anchor" })).toContainText("different answer");
  await expect(page.getByText("First question")).toHaveCount(0);
  await expect(page.getByText("This is a simulated answer.", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ask", exact: true })).toBeEnabled();
});
