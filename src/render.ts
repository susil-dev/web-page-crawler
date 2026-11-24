// Load a page in a real (background) browser tab and read it after its JavaScript has run.
// Needed for single-page apps and sites that sign in with tokens kept by the page's own
// JavaScript (common with company single sign-on), which a plain fetch can't see.

export interface Captured {
  html: string;
  /** Where the tab ended up, after redirects. */
  url: string;
}

const MAX_TABS = 2; // background tabs open at once
let open = 0;
const waiting: (() => void)[] = [];

async function slot<T>(fn: () => Promise<T>): Promise<T> {
  while (open >= MAX_TABS) await new Promise<void>((r) => waiting.push(r));
  open++;
  try {
    return await fn();
  } finally {
    open--;
    waiting.shift()?.();
  }
}

/** Open `url` in an inactive tab, wait for it to load and settle, capture it, close the tab. */
export function renderInTab(url: string, timeoutMs = 45_000): Promise<Captured> {
  return slot(async () => {
    const tab = await chrome.tabs.create({ url, active: false });
    const tabId = tab.id!;
    try {
      await waitForLoad(tabId, timeoutMs);
      return await captureTab(tabId, 15_000);
    } finally {
      chrome.tabs.remove(tabId).catch(() => {});
    }
  });
}

/** Capture an already-open tab, letting it settle for up to `settleMs` first. */
export async function captureTab(tabId: number, settleMs: number): Promise<Captured> {
  const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: capturePage, args: [settleMs] });
  const result = res?.result as Captured | undefined;
  if (!result?.html) throw new Error("Couldn't read the rendered page.");
  return result;
}

function waitForLoad(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (err?: Error) => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      if (err) reject(err);
      else resolve();
    };
    const onUpdated = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && info.status === "complete") done();
    };
    const onRemoved = (id: number) => {
      if (id === tabId) done(new Error("The tab was closed."));
    };
    const timer = setTimeout(() => done(new Error(`Page didn't finish loading in ${timeoutMs / 1000}s`)), timeoutMs);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
    chrome.tabs.get(tabId).then((t) => t.status === "complete" && done(), () => {});
  });
}

/**
 * Runs inside the page (injected by executeScript), so it must be self-contained.
 * Waits until the visible text stops changing (content loaded by JavaScript), then returns the
 * HTML, with open shadow DOM and same-origin iframes flattened in so their text isn't lost.
 */
async function capturePage(settleMs: number): Promise<{ html: string; url: string }> {
  const textLength = () => document.body?.innerText.length ?? 0;
  const start = Date.now();
  let last = -1;
  let stableSince = Date.now();
  while (Date.now() - start < settleMs) {
    await new Promise((r) => setTimeout(r, 400));
    const n = textLength();
    if (n !== last) {
      last = n;
      stableSince = Date.now();
    } else if (n > 0 && Date.now() - stableSince >= 1500) {
      break;
    }
  }

  const hasShadowOrFrames = [...document.querySelectorAll("*")].some(
    (el) => el.shadowRoot || el.localName === "iframe",
  );
  if (!hasShadowOrFrames) return { html: document.documentElement.outerHTML, url: location.href };

  const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
  const SKIP = new Set(["script", "style", "noscript", "template"]);
  const escText = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  const escAttr = (s: string) => s.replace(/[&"]/g, (c) => ({ "&": "&amp;", '"': "&quot;" })[c]!);
  const ser = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return escText((node as Text).data);
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as Element;
    const tag = el.localName;
    if (SKIP.has(tag)) return "";
    if (tag === "iframe") {
      try {
        const body = (el as HTMLIFrameElement).contentDocument?.body;
        return body ? `<div>${ser(body)}</div>` : "";
      } catch {
        return ""; // cross-origin frame
      }
    }
    const attrs = [...el.attributes].map((a) => ` ${a.name}="${escAttr(a.value)}"`).join("");
    if (VOID.has(tag)) return `<${tag}${attrs}>`;
    let inner = el.shadowRoot ? [...el.shadowRoot.childNodes].map(ser).join("") : "";
    inner += [...el.childNodes].map(ser).join("");
    return `<${tag}${attrs}>${inner}</${tag}>`;
  };
  return { html: "<!doctype html>" + ser(document.documentElement), url: location.href };
}
