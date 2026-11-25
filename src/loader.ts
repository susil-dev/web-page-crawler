// Loading a page for crawling: a plain fetch, or a background browser tab when the page needs
// JavaScript or a sign-in. Shared by the full view (dashboard) and the side panel.

import { parseHtml, stripHash, type ParsedPage } from "./extract";
import { renderInTab, type ScrollOptions } from "./render";
import type { Settings } from "./settings";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    statusText: string,
  ) {
    super(`HTTP ${status} ${statusText}`);
  }
}

export const scrollOpts = (s: Settings): ScrollOptions => ({ scrolls: s.scrollTimes, clickMore: s.clickLoadMore });

/** Plain fetch: sends this browser's cookies for the site, but runs none of the page's JavaScript. */
export async function fetchPage(url: string, s: Settings): Promise<ParsedPage> {
  const res = await fetch(url, { credentials: "include", redirect: "follow", signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new HttpError(res.status, res.statusText);
  const type = res.headers.get("content-type") ?? "";
  if (type && !/html|xml/.test(type)) throw new Error(`Not an HTML page (${type.split(";")[0]})`);
  return { ...parseHtml(await res.text(), res.url || url, s.titleSource), loadedVia: "fetch" };
}

/** Render in a background tab with the full browser session, after the page's JavaScript has run. */
export async function tabPage(url: string, s: Settings): Promise<ParsedPage> {
  const captured = await renderInTab(url, scrollOpts(s));
  const requested = new URL(url).hostname;
  const ended = new URL(captured.url).hostname;
  if (ended !== requested && /login|signin|sign-in|sso|auth|adfs|okta|microsoftonline|ping/i.test(ended)) {
    throw new Error(`Redirected to a sign-in page (${ended}). Sign in to ${requested} in this browser, then crawl again.`);
  }
  return { ...parseHtml(captured.html, stripHash(captured.url), s.titleSource), loadedVia: "tab" };
}

/** Under this many words, a fetched page is probably an app shell that fills itself in with JavaScript. */
const NEARLY_EMPTY_WORDS = 40;

export async function loadPage(url: string, s: Settings): Promise<ParsedPage> {
  if (s.loadMode === "tab") return tabPage(url, s);
  let fetched: ParsedPage | undefined;
  try {
    fetched = await fetchPage(url, s);
  } catch (err) {
    const signInNeeded = err instanceof HttpError && [401, 403].includes(err.status);
    if (s.loadMode === "fetch" || !(signInNeeded || err instanceof TypeError)) throw err; // TypeError: network/CORS
  }
  if (fetched && (s.loadMode === "fetch" || fetched.wordCount >= NEARLY_EMPTY_WORDS)) return fetched;
  try {
    return await tabPage(url, s);
  } catch (err) {
    if (fetched) return fetched; // the tab failed too: keep what the fetch got
    throw err;
  }
}
