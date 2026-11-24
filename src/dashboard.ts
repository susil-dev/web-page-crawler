import { summarize } from "./ai";
import { deletePage, getImage, getPage, listPages, putPage, type PageRecord } from "./db";
import { parseHtml, stripHash, type LinkInfo, type ParsedPage } from "./extract";
import { storeImages, toDataUrl } from "./images";
import { captureTab, renderInTab } from "./render";
import { downloadPage, downloadText, toMarkdown } from "./markdown";
import { loadSettings, MAX_DEPTH, saveSettings, type Settings } from "./settings";

// ---------- state ----------
//
// The crawl is a tree: the starting page is the root, the links found on a page are its children.
// A URL appears once, under the first page that linked to it.

// "alias": fetched, but it is the same page as another node (a soft link to it; not crawled further or saved).
type Status = "link" | "queued" | "loading" | "done" | "error" | "alias";

interface TreeNode {
  url: string;
  linkText: string;
  /** Link hops from the starting page: 0 = the starting page. */
  depth: number;
  parent?: string;
  children: string[];
  /** Links found on this page that weren't added as sub-pages because the depth limit was reached. */
  unexpanded: LinkInfo[];
  status: Status;
  page?: ParsedPage;
  error?: string;
  saved?: boolean;
  summary?: string;
  summarizing?: boolean;
  summaryError?: string;
  imageNote?: string;
  /** For an alias: the URL of the node it duplicates, and how we know. */
  aliasOf?: string;
  aliasReason?: string;
  /** For an original: the other addresses that turned out to be this page. */
  aliases?: string[];
}

/**
 * Keys that identify an already-crawled page → that page's node URL.
 *   address    its URL, or the URL it ended up at after redirects
 *   canonical  the <link rel="canonical"> it declares
 *   content    a hash of its title and text
 */
type SameAsKind = "address" | "canonical" | "content";
const sameAs = new Map<string, { url: string; kind: SameAsKind }>();

const REASONS: Record<SameAsKind, string> = {
  address: "redirects to the same address",
  canonical: "declares the same canonical address",
  content: "identical content",
};

let settings: Settings;
let rootUrl = "";
const nodes = new Map<string, TreeNode>();
const selected = new Set<string>();
const collapsed = new Set<string>();
const detailsOpen = new Set<string>();
let crawling = false;
let stopRequested = false;
let note = "";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const errText = (err: unknown) => String((err as Error)?.message ?? err);

// ---------- source page ----------

async function loadSource(url: string, tabId?: number) {
  $("source-info").innerHTML = "";
  setTask({ label: `Reading ${url} — waiting for it to finish loading…` });
  $("tree-panel").hidden = true;
  settings = await loadSettings();
  try {
    let page: ParsedPage | undefined;
    if (tabId !== undefined) {
      // Read the live tab so links added by JavaScript are included.
      try {
        // Let content still loading by JavaScript arrive (up to 5s), then read it, shadow DOM included.
        const captured = await captureTab(tabId, 5_000);
        page = parseHtml(captured.html, stripHash(captured.url), settings.titleSource);
      } catch {
        /* restricted page (chrome://, Web Store) or tab closed: fall back to fetching */
      }
    }
    page ??= await loadPage(url);

    rootUrl = stripHash(page.url);
    nodes.clear();
    selected.clear();
    collapsed.clear();
    detailsOpen.clear();
    sameAs.clear();
    note = "";
    const root: TreeNode = { url: rootUrl, linkText: page.title, depth: 0, children: [], unexpanded: [], status: "done", page };
    nodes.set(rootUrl, root);
    register(root, await fingerprint(page));
    remember(stripHash(url), rootUrl, "address"); // the address typed in, if it redirected
    if (stripHash(url) !== rootUrl) root.aliases = [stripHash(url)];
    addChildren(root, page.links, true);
    root.saved = !!(await getPage(rootUrl));

    $("source-info").innerHTML = `
      <div class="source-card">
        <h2>${esc(page.title)}</h2>
        <a href="${esc(page.url)}" target="_blank">${esc(page.url)}</a>
        ${page.description ? `<p>${esc(page.description)}</p>` : ""}
        <p class="muted">${page.links.length} unique links · ${page.images.length} images · ${page.wordCount.toLocaleString()} words</p>
      </div>`;
    $("tree-panel").hidden = false;
    render();
  } catch (err) {
    $("source-info").innerHTML = `<p class="error">Couldn't read the page: ${esc(errText(err))}</p>`;
  } finally {
    if (!crawling) setTask(null);
  }
}

class HttpError extends Error {
  constructor(readonly status: number, statusText: string) {
    super(`HTTP ${status} ${statusText}`);
  }
}

/** Plain fetch: sends this browser's cookies for the site, but runs none of the page's JavaScript. */
async function fetchPage(url: string): Promise<ParsedPage> {
  const res = await fetch(url, { credentials: "include", redirect: "follow", signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new HttpError(res.status, res.statusText);
  const type = res.headers.get("content-type") ?? "";
  if (type && !/html|xml/.test(type)) throw new Error(`Not an HTML page (${type.split(";")[0]})`);
  return { ...parseHtml(await res.text(), res.url || url, settings.titleSource), loadedVia: "fetch" };
}

/** Render in a background tab with the full browser session, after the page's JavaScript has run. */
async function tabPage(url: string): Promise<ParsedPage> {
  const captured = await renderInTab(url);
  const requested = new URL(url).hostname;
  const ended = new URL(captured.url).hostname;
  if (ended !== requested && /login|signin|sign-in|sso|auth|adfs|okta|microsoftonline|ping/i.test(ended)) {
    throw new Error(`Redirected to a sign-in page (${ended}). Sign in to ${requested} in this browser, then crawl again.`);
  }
  return { ...parseHtml(captured.html, stripHash(captured.url), settings.titleSource), loadedVia: "tab" };
}

/** Under this many words, a fetched page is probably an app shell that fills itself in with JavaScript. */
const NEARLY_EMPTY_WORDS = 40;

async function loadPage(url: string): Promise<ParsedPage> {
  if (settings.loadMode === "tab") return tabPage(url);
  let fetched: ParsedPage | undefined;
  try {
    fetched = await fetchPage(url);
  } catch (err) {
    const signInNeeded = err instanceof HttpError && [401, 403].includes(err.status);
    if (settings.loadMode === "fetch" || !(signInNeeded || err instanceof TypeError)) throw err; // TypeError: network/CORS
  }
  if (fetched && (settings.loadMode === "fetch" || fetched.wordCount >= NEARLY_EMPTY_WORDS)) return fetched;
  try {
    return await tabPage(url);
  } catch (err) {
    if (fetched) return fetched; // the tab failed too: keep what the fetch got
    throw err;
  }
}

// ---------- duplicate detection ----------

async function fingerprint(p: ParsedPage): Promise<string | undefined> {
  if (!p.markdown.trim()) return undefined; // empty pages (JS-only apps) would all look alike
  const bytes = new TextEncoder().encode(`${p.title}\n${p.markdown}`);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return "content:" + [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function remember(key: string, url: string, kind: SameAsKind) {
  if (key && !sameAs.has(key)) sameAs.set(key, { url, kind });
}

/** Record a crawled page's identifying keys so later duplicates can link to it. */
function register(n: TreeNode, fp: string | undefined) {
  const p = n.page!;
  remember(n.url, n.url, "address");
  remember(stripHash(p.url), n.url, "address");
  if (p.canonical) remember(p.canonical, n.url, "canonical");
  if (fp) remember(fp, n.url, "content");
}

/** The node this freshly fetched page duplicates, if any. Call and act on it without awaiting in between. */
function findOriginal(url: string, p: ParsedPage, fp: string | undefined): { url: string; reason: string } | undefined {
  const hit = (key: string, check?: (orig: TreeNode) => boolean) => {
    const found = sameAs.get(key);
    if (!found || found.url === url) return undefined;
    const orig = nodes.get(found.url);
    return orig && (!check || check(orig)) ? found.url : undefined;
  };
  const byAddress = hit(stripHash(p.url));
  if (byAddress) return { url: byAddress, reason: REASONS.address };
  const byContent = fp && hit(fp);
  if (byContent) return { url: byContent, reason: REASONS.content };
  // Some sites point every page's canonical at the home page, so also require the same title.
  const byCanonical = p.canonical && p.canonical !== url && hit(p.canonical, (o) => o.page?.title === p.title);
  if (byCanonical) return { url: byCanonical, reason: REASONS.canonical };
  return undefined;
}

function markAlias(n: TreeNode, origUrl: string, reason: string) {
  n.status = "alias";
  n.aliasOf = origUrl;
  n.aliasReason = reason;
  n.page = undefined;
  n.unexpanded = [];
  selected.delete(n.url);
  detailsOpen.delete(n.url);
  const orig = nodes.get(origUrl)!;
  orig.aliases = [...new Set([...(orig.aliases ?? []), n.url])];
}

/** Nodes that can be ticked: everything except soft links. */
const selectable = (url: string) => nodes.get(url)?.status !== "alias";

// ---------- tree helpers ----------

const rootHost = () => (rootUrl ? new URL(rootUrl).hostname : "");
const filterText = () => $<HTMLInputElement>("link-filter").value.trim().toLowerCase();
const passesDomain = (url: string) => !$<HTMLInputElement>("same-domain").checked || new URL(url).hostname === rootHost();
const nodeTitle = (n: TreeNode) => n.page?.title || n.linkText || n.url;

function matchesFilter(n: { url: string; linkText?: string; text?: string; page?: ParsedPage }, q = filterText()) {
  if (!q) return true;
  return [n.url, n.linkText ?? n.text ?? "", n.page?.title ?? ""].some((s) => s.toLowerCase().includes(q));
}

/**
 * Crawling uses your signed-in session, so visiting a link can do what clicking it would.
 * Links that look like they sign out or change something are listed but never ticked automatically.
 */
const RISKY = /log-?out|log-?off|sign-?out|delete|remove|unsubscribe|revoke|cancel|approve|reject/i;
const looksRisky = (l: LinkInfo) => RISKY.test(new URL(l.url).pathname + new URL(l.url).search) || RISKY.test(l.text);

/** Add the not-yet-seen links as sub-pages of `parent`. Returns the new nodes. */
function addChildren(parent: TreeNode, links: LinkInfo[], autoSelect: boolean): TreeNode[] {
  const added: TreeNode[] = [];
  for (const l of links) {
    if (nodes.has(l.url)) continue;
    const child: TreeNode = {
      url: l.url,
      linkText: l.text,
      depth: parent.depth + 1,
      parent: parent.url,
      children: [],
      unexpanded: [],
      status: "link",
    };
    nodes.set(l.url, child);
    parent.children.push(l.url);
    // A link to an address we already know redirects to a crawled page: soft-link it without fetching.
    const known = sameAs.get(l.url);
    if (known?.kind === "address" && known.url !== l.url) {
      markAlias(child, known.url, REASONS.address);
      added.push(child);
      continue;
    }
    if (autoSelect && passesDomain(l.url) && matchesFilter(l) && !looksRisky(l)) selected.add(l.url);
    added.push(child);
  }
  // Keep deeper groups folded so a big crawl stays readable; the root's links stay open.
  if (added.length && parent.depth >= 1) collapsed.add(parent.url);
  return added;
}

/** URLs shown with the current filters: a page passes if it or anything under it matches. */
function visibleSet(): Set<string> {
  const out = new Set<string>();
  const q = filterText();
  const walk = (url: string): boolean => {
    const n = nodes.get(url)!;
    if (n.depth > 0 && !passesDomain(url)) return false;
    let show = matchesFilter(n, q);
    for (const c of n.children) if (walk(c)) show = true;
    if (show) out.add(url);
    return show;
  };
  if (rootUrl) walk(rootUrl);
  out.add(rootUrl);
  return out;
}

function descendants(url: string): string[] {
  const out: string[] = [];
  const stack = [...nodes.get(url)!.children];
  while (stack.length) {
    const u = stack.pop()!;
    out.push(u);
    stack.push(...nodes.get(u)!.children);
  }
  return out;
}

const depthLimit = () => Math.min(MAX_DEPTH, Math.max(1, Number($<HTMLInputElement>("depth").value) || 1));

/** Selected, crawled pages whose links weren't followed because of a lower depth limit. */
function expandableNodes(maxDepth: number): TreeNode[] {
  const vis = visibleSet();
  return [...nodes.values()].filter(
    (n) => n.status === "done" && n.depth < maxDepth && n.unexpanded.length && selected.has(n.url) && vis.has(n.url),
  );
}

// ---------- crawl ----------

async function crawl() {
  settings = await loadSettings();
  const maxDepth = depthLimit();
  // If the depth was raised since an earlier crawl, follow the links of selected pages that hit the old limit.
  for (const n of expandableNodes(maxDepth)) {
    addChildren(n, n.unexpanded, true);
    n.unexpanded = [];
  }
  const vis = visibleSet();
  const queue = [...nodes.values()].filter(
    (n) => vis.has(n.url) && selected.has(n.url) && (n.status === "link" || n.status === "error"),
  );
  for (const n of queue) n.status = "queued";
  crawling = true;
  stopRequested = false;
  note = "";
  let fetched = 0;
  crawlRun.done = 0;
  crawlRun.total = queue.length;
  render();

  await runQueue(queue, settings.concurrency, async (n) => {
    try {
      await crawlOne(n);
    } finally {
      crawlRun.done++;
      render();
    }
  });

  async function crawlOne(n: TreeNode) {
    if (stopRequested || fetched >= settings.maxPages) {
      n.status = "link";
      return;
    }
    fetched++;
    n.status = "loading";
    n.error = undefined;
    render();
    try {
      const page = await loadPage(n.url);
      const fp = await fingerprint(page);
      // No awaits between finding and registering, so two duplicates finishing together can't both win.
      const orig = findOriginal(n.url, page, fp);
      if (orig) {
        markAlias(n, orig.url, orig.reason);
        render();
        return;
      }
      n.page = page;
      n.status = "done";
      register(n, fp);
      const existing = await getPage(recordUrl(n));
      if (existing) {
        n.saved = true;
        n.summary = existing.summary;
      }
      if (n.depth < maxDepth) {
        // Follow this page's links too: the new sub-pages that pass the filters join the crawl.
        for (const child of addChildren(n, n.page.links, true)) {
          if (!selected.has(child.url)) continue;
          child.status = "queued";
          queue.push(child);
          crawlRun.total++; // the bar's total grows as deeper pages are found
        }
      } else {
        n.unexpanded = n.page.links;
      }
    } catch (err) {
      n.status = "error";
      n.error = (err as Error).name === "TimeoutError" ? "Timed out after 20s" : errText(err);
    }
  }

  const leftover = [...nodes.values()].filter((n) => n.status === "queued");
  for (const n of leftover) n.status = "link";
  crawling = false;
  setTask(null);
  if (stopRequested) note = "Stopped. Press Crawl selected to continue.";
  else if (fetched >= settings.maxPages && leftover.length)
    note = `Stopped at ${settings.maxPages} pages (Max pages in Settings). Press Crawl selected to continue.`;
  render();
}

/** Run `fn` over a queue that may grow while it runs, `limit` at a time. */
async function runQueue<T>(queue: T[], limit: number, fn: (item: T) => Promise<void>) {
  let active = 0;
  const worker = async () => {
    for (;;) {
      const item = queue.shift();
      if (item !== undefined) {
        active++;
        try {
          await fn(item);
        } finally {
          active--;
        }
      } else if (active === 0) {
        return;
      } else {
        await new Promise((r) => setTimeout(r, 50)); // others may still add work
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, limit) }, worker));
}

// ---------- progress ----------
//
// One activity at a time is shown: a bar with a label under the address bar, a thin bar along the
// bottom of the header (visible when scrolled), and the percentage in the browser tab's title.
// Without a total the bar runs an indeterminate "loading" animation.

interface Task {
  label: string;
  done?: number;
  total?: number;
}
let task: Task | null = null;
const crawlRun = { done: 0, total: 0 };

function setTask(t: Task | null) {
  task = t;
  paintProgress();
}

function paintProgress() {
  const determinate = !!task && task.total !== undefined && task.total > 0;
  const pct = determinate ? Math.min(100, Math.round((task!.done! / task!.total!) * 100)) : 0;
  for (const el of [$("activity"), $("top-progress")]) {
    el.hidden = !task;
    el.classList.toggle("indeterminate", !determinate);
    el.style.setProperty("--pct", `${pct}%`);
  }
  const bar = $("activity");
  if (determinate) bar.setAttribute("aria-valuenow", String(pct));
  else bar.removeAttribute("aria-valuenow");
  $("activity-label").textContent = task?.label ?? "";
  $("activity-count").textContent = determinate ? `${task!.done} of ${task!.total} · ${pct}%` : "";
  document.title = task ? `${determinate ? `${pct}%` : "…"} · Page Crawler` : "Page Crawler";
}

// ---------- render ----------

let renderQueued = false;
function render() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderNow();
  });
}

function renderNow() {
  if (!rootUrl) return;
  const vis = visibleSet();
  const all = [...nodes.values()].filter((n) => vis.has(n.url));
  const count = (s: Status) => all.filter((n) => n.status === s).length;
  const sel = all.filter((n) => selected.has(n.url));
  const selDone = sel.filter((n) => n.status === "done").length;
  const selToCrawl = sel.filter((n) => n.status === "link" || n.status === "error").length;

  const done = count("done");
  const failed = count("error");
  $("progress").textContent = crawling
    ? `Crawling… ${done} done, ${count("loading")} loading, ${count("queued")} queued`
    : `${done} crawled${failed ? `, ${failed} failed` : ""}${count("alias") ? `, ${count("alias")} duplicates linked` : ""} · ${all.length} pages in tree`;
  $("selected-count").textContent = `${sel.length} selected (${selDone} crawled, ${selToCrawl} to crawl)`;
  $("results-note").textContent = note;
  if (crawling) {
    const loading = count("loading");
    setTask({
      label: stopRequested
        ? "Stopping…"
        : `Crawling — ${loading} loading${loading && settings.loadMode !== "fetch" ? " (pages that need JavaScript open in background tabs)" : ""}`,
      done: crawlRun.done,
      total: crawlRun.total,
    });
  }
  $<HTMLButtonElement>("crawl-btn").disabled =
    crawling || (selToCrawl === 0 && expandableNodes(depthLimit()).length === 0);
  $("stop-btn").hidden = !crawling;
  for (const id of ["save-sel", "download-sel", "summarize-sel"]) $<HTMLButtonElement>(id).disabled = selDone === 0;

  // Sub-page counts per node in one pass, so big trees stay fast.
  const stats = new Map<string, { total: number; sel: number }>();
  const tally = (url: string): { total: number; sel: number } => {
    const s = { total: 0, sel: 0 };
    for (const c of nodes.get(url)!.children) {
      if (!vis.has(c)) continue;
      const cs = tally(c);
      if (!selectable(c)) continue;
      s.total += 1 + cs.total;
      s.sel += (selected.has(c) ? 1 : 0) + cs.sel;
    }
    stats.set(url, s);
    return s;
  };
  tally(rootUrl);

  const scrollY = window.scrollY;
  $("tree").innerHTML = nodeHtml(nodes.get(rootUrl)!, vis, stats);
  window.scrollTo(0, scrollY);
}

function nodeHtml(n: TreeNode, vis: Set<string>, stats: Map<string, { total: number; sel: number }>): string {
  const u = esc(n.url);
  const kids = n.children.filter((c) => vis.has(c));
  const open = !collapsed.has(n.url);
  const s = stats.get(n.url)!;
  const more = n.unexpanded.filter((l) => !nodes.has(l.url) && passesDomain(l.url)).length;

  if (n.status === "alias") {
    const orig = nodes.get(n.aliasOf!)!;
    return `<li class="node s-alias" data-node="${u}">
      <div class="line">
        <span class="twisty">↪</span>
        <input type="checkbox" class="sel" disabled title="Same page as one already in the tree: select the original instead">
        <div class="node-main">
          <div class="node-title">${esc(nodeTitle(orig))}</div>
          <div class="node-meta"><a class="url" href="${u}" target="_blank">${u}</a>
            <span class="badge neutral" title="${esc(n.aliasReason ?? "")}">same page</span>
            <span class="muted">${esc(n.aliasReason ?? "")}</span></div>
        </div>
        <div class="node-side"><button data-action="goto" data-url="${esc(orig.url)}">Go to original</button></div>
      </div>
    </li>`;
  }

  const badges: string[] = [];
  if (n.depth === 0) badges.push(`<span class="badge neutral">start page</span>`);
  if (n.status === "queued") badges.push(`<span class="status">queued</span>`);
  if (n.status === "loading") badges.push(`<span class="status"><span class="spinner"></span>loading…</span>`);
  if (n.status === "error") badges.push(`<span class="error">${esc(n.error ?? "Failed")}</span>`);
  if (n.page) {
    badges.push(`<span class="muted">${n.page.wordCount.toLocaleString()} words</span>`);
    if (n.page.images.length) badges.push(`<span class="muted">${n.page.images.length} images</span>`);
    if (n.page.loadedVia === "tab")
      badges.push(`<span class="badge neutral" title="Loaded in a background browser tab, after its JavaScript ran">rendered</span>`);
  }
  if (n.aliases?.length)
    badges.push(
      `<span class="muted" title="${esc(n.aliases.join("\n"))}">also at ${n.aliases.length} other address${n.aliases.length === 1 ? "" : "es"}</span>`,
    );
  if (n.saved) badges.push(`<span class="badge">saved</span>`);
  if (n.summary) badges.push(`<span class="badge">summarized</span>`);
  if (n.summarizing) badges.push(`<span class="status"><span class="spinner"></span>summarizing…</span>`);

  const group = kids.length
    ? `<span class="group" title="Select or clear every page below this one (not this page itself)">
        ${s.sel}/${s.total} sub-pages
        <button data-action="sub-all" data-url="${u}">all</button><button data-action="sub-none" data-url="${u}">none</button>
      </span>`
    : "";

  // Shown at the top of an expanded sub-section (the start page's list is covered by the toolbar).
  const subBar =
    n.depth >= 1 && s.total
      ? `<li class="sub-bar" title="Applies to every page in this section, including deeper levels">
          <button data-action="sub-all" data-url="${u}" ${s.sel === s.total ? "disabled" : ""}>Select all</button>
          <button data-action="sub-none" data-url="${u}" ${s.sel === 0 ? "disabled" : ""}>Unselect all</button>
          <span class="muted">${s.sel} of ${s.total} selected</span>
        </li>`
      : "";

  return `<li class="node s-${n.status}" data-node="${u}">
    <div class="line">
      ${
        kids.length
          ? `<button class="twisty" data-action="toggle" data-url="${u}" aria-expanded="${open}" title="${open ? "Collapse" : "Expand"}">${open ? "▾" : "▸"}</button>`
          : `<span class="twisty"></span>`
      }
      <input type="checkbox" class="sel" data-url="${u}" ${selected.has(n.url) ? "checked" : ""} title="Select this page">
      <div class="node-main">
        <div class="node-title">${esc(nodeTitle(n))}</div>
        <div class="node-meta"><a class="url" href="${u}" target="_blank">${u}</a> ${badges.join(" ")}</div>
      </div>
      <div class="node-side">
        ${group}
        ${more ? `<button class="link-btn" data-action="expand-links" data-url="${u}" title="Depth limit reached here: list these links as sub-pages so you can pick some">+${more} links</button>` : ""}
        ${n.page ? `<button data-action="details" data-url="${u}">${detailsOpen.has(n.url) ? "Hide" : "Details"}</button>` : ""}
      </div>
    </div>
    ${n.page && detailsOpen.has(n.url) ? detailsHtml(n) : ""}
    ${kids.length && open ? `<ul>${subBar}${kids.map((c) => nodeHtml(nodes.get(c)!, vis, stats)).join("")}</ul>` : ""}
  </li>`;
}

/** Unfold the tree down to a node, scroll to it and flash it. */
function goTo(url: string) {
  for (let u = nodes.get(url)?.parent; u; u = nodes.get(u)?.parent) collapsed.delete(u);
  collapsed.delete(url);
  if (!visibleSet().has(url)) $<HTMLInputElement>("link-filter").value = ""; // the filter hides it
  renderNow();
  const li = document.querySelector<HTMLElement>(`[data-node="${CSS.escape(url)}"]`);
  if (!li) return;
  li.scrollIntoView({ block: "center", behavior: "smooth" });
  li.classList.add("flash");
  setTimeout(() => li.classList.remove("flash"), 1600);
}

function detailsHtml(n: TreeNode): string {
  const p = n.page!;
  const u = esc(n.url);
  const topics = p.headings.length
    ? `<ul class="topics">${p.headings.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>`
    : `<p class="muted">No headings found.</p>`;
  const images = p.images.length
    ? `<div class="thumbs">${p.images
        .slice(0, 12)
        .map(
          (i) =>
            `<figure><img src="${esc(i.src)}" alt="${esc(i.alt)}" loading="lazy" referrerpolicy="no-referrer"><figcaption>${esc(i.caption || i.alt || "(no alt text)")}</figcaption></figure>`,
        )
        .join("")}${p.images.length > 12 ? `<p class="muted">+${p.images.length - 12} more</p>` : ""}</div>`
    : "";
  const summary = n.summaryError
    ? `<p class="error">${esc(n.summaryError)}</p>`
    : n.summary
      ? `<details open><summary>AI summary</summary><div class="md">${esc(n.summary)}</div></details>`
      : "";
  return `<div class="details">
    <p class="muted titles">Document title: ${esc(p.docTitle || "—")} · Heading: ${esc(p.heading || "—")}${p.ogTitle ? ` · og:title: ${esc(p.ogTitle)}` : ""}</p>
    ${p.excerpt ? `<p class="excerpt">${esc(p.excerpt)}</p>` : ""}
    ${topics}
    ${images}
    ${n.imageNote ? `<p class="muted">${esc(n.imageNote)}</p>` : ""}
    ${summary}
    <div class="actions">
      <button data-action="save" data-url="${u}">${n.saved ? "Save again" : "Save"}</button>
      <button data-action="download" data-url="${u}">Download .md</button>
      <button data-action="summarize" data-url="${u}" ${n.summarizing ? "disabled" : ""}>${n.summary ? "Re-summarize" : "Summarize & save"}</button>
      <button data-action="view" data-url="${u}">View Markdown</button>
    </div>
  </div>`;
}

// ---------- actions on crawled pages ----------

/** Saved pages are keyed by the address they ended up at, after redirects. */
const recordUrl = (n: TreeNode) => stripHash(n.page!.url);

/** Every other address of the page: the one linked (if it redirected) plus its soft links. */
function recordAliases(n: TreeNode): string[] | undefined {
  const all = [...new Set([n.url, ...(n.aliases ?? [])])].filter((u) => u !== recordUrl(n));
  return all.length ? all : undefined;
}

function toRecord(n: TreeNode, extra: Partial<PageRecord> = {}): PageRecord {
  const p = n.page!;
  const now = new Date().toISOString();
  return {
    url: recordUrl(n),
    title: p.title,
    description: p.description,
    headings: p.headings,
    excerpt: p.excerpt,
    markdown: p.markdown,
    wordCount: p.wordCount,
    images: p.images,
    sourceUrl: rootUrl,
    sourceTitle: nodes.get(rootUrl)?.page?.title,
    aliases: recordAliases(n),
    parentUrl: n.parent && nodes.get(n.parent)?.page ? recordUrl(nodes.get(n.parent)!) : n.parent,
    parentTitle: n.parent ? nodes.get(n.parent)?.page?.title : undefined,
    depth: n.depth,
    crawledAt: now,
    savedAt: now,
    summary: n.summary,
    ...extra,
  };
}

/** Write the page to the DB, keeping any earlier summary, and its image files if that setting is on. */
async function saveNode(n: TreeNode, extra: Partial<PageRecord> = {}) {
  if (!n.page) return;
  const existing = await getPage(recordUrl(n));
  await putPage(
    toRecord(n, {
      summary: n.summary ?? existing?.summary,
      summaryModel: existing?.summaryModel,
      summarizedAt: existing?.summarizedAt,
      ...extra,
    }),
  );
  n.saved = true;
  if (settings.saveImageFiles && n.page.images.length) {
    const failed = await storeImages(n.page.images, settings.maxImageKB * 1024);
    n.imageNote = failed
      ? `${n.page.images.length - failed} of ${n.page.images.length} image files stored (${failed} failed, blocked or over ${settings.maxImageKB} KB).`
      : `All ${n.page.images.length} image files stored.`;
  }
}

async function summarizeNode(n: TreeNode) {
  if (!n.page) return;
  n.summarizing = true;
  n.summaryError = undefined;
  render();
  try {
    settings = await loadSettings(); // pick up a key added in another tab
    n.summary = await summarize(n.page, settings);
    await saveNode(n, { summary: n.summary, summaryModel: settings.model, summarizedAt: new Date().toISOString() });
  } catch (err) {
    n.summaryError = errText(err);
  } finally {
    n.summarizing = false;
    render();
  }
}

const downloadNode = (n: TreeNode) =>
  downloadPage(toRecord(n), settings.saveImageFiles, settings.maxImageKB * 1024);

function selectedDone(): TreeNode[] {
  const vis = visibleSet();
  return [...nodes.values()].filter((n) => vis.has(n.url) && selected.has(n.url) && n.status === "done");
}

// ---------- library ----------
//
// Grouped by the page each crawl started from, and nested by which page linked to which.

async function renderLibrary() {
  const q = $<HTMLInputElement>("lib-search").value.trim().toLowerCase();
  const pages = (await listPages()).filter(
    (p) =>
      !q ||
      [p.title, p.url, ...(p.aliases ?? []), p.description, p.summary ?? "", p.headings.join(" "), ...(p.images ?? []).map((i) => i.alt)].some(
        (s) => s.toLowerCase().includes(q),
      ),
  );
  if (!pages.length) {
    $("library-list").innerHTML = `<p class="muted">${q ? "No saved pages match." : "Nothing saved yet. Crawl some links and press Save or Summarize."}</p>`;
    return;
  }

  const groups = new Map<string, PageRecord[]>();
  for (const p of pages) {
    const key = p.sourceUrl ?? p.url;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }

  $("library-list").innerHTML = [...groups]
    .map(([source, recs]) => {
      const byUrl = new Map(recs.map((r) => [r.url, r]));
      const childrenOf = new Map<string, PageRecord[]>();
      const tops: PageRecord[] = [];
      for (const r of recs) {
        if (r.parentUrl && byUrl.has(r.parentUrl) && r.parentUrl !== r.url) {
          childrenOf.set(r.parentUrl, [...(childrenOf.get(r.parentUrl) ?? []), r]);
        } else tops.push(r);
      }
      const order = (a: PageRecord, b: PageRecord) => (a.depth ?? 0) - (b.depth ?? 0) || a.title.localeCompare(b.title);
      const rows = (list: PageRecord[]): string =>
        `<ul class="lib-tree">${[...list]
          .sort(order)
          .map((r) => `<li>${libRowHtml(r)}${childrenOf.has(r.url) ? rows(childrenOf.get(r.url)!) : ""}</li>`)
          .join("")}</ul>`;
      const name = byUrl.get(source)?.title ?? source;
      return `<details class="lib-group" open>
        <summary><span>${esc(name)}</span> <span class="muted">${recs.length} page${recs.length === 1 ? "" : "s"}</span>
          <button data-action="lib-delete-group" data-url="${esc(source)}" class="danger small">Delete group</button></summary>
        ${rows(tops)}
      </details>`;
    })
    .join("");
}

function libRowHtml(p: PageRecord): string {
  const u = esc(p.url);
  const imgs = p.images?.length ? ` · ${p.images.length} images` : "";
  return `<article class="row">
    <div class="row-main">
      <h3>${esc(p.title)} ${p.summary ? "<span class=badge>summarized</span>" : ""}</h3>
      <a class="url" href="${u}" target="_blank">${u}</a>
      <p class="muted">Saved ${new Date(p.savedAt).toLocaleString()} · ${p.wordCount.toLocaleString()} words${imgs}</p>
    </div>
    <div class="actions">
      <button data-action="lib-view" data-url="${u}">View</button>
      <button data-action="lib-download" data-url="${u}">Download .md</button>
      <button data-action="lib-summarize" data-url="${u}">${p.summary ? "Re-summarize" : "Summarize"}</button>
      <button data-action="lib-delete" data-url="${u}" class="danger">Delete</button>
    </div>
  </article>`;
}

function showViewer(rec: PageRecord) {
  $("viewer-title").textContent = rec.title;
  const a = $<HTMLAnchorElement>("viewer-url");
  a.href = rec.url;
  a.textContent = rec.url;
  $("viewer-body").textContent = toMarkdown(rec);
  $<HTMLDialogElement>("viewer").showModal();
}

/** Every saved page as JSON. With images, each image entry also carries its file as a base64 data: URL. */
async function exportJson(withImages: boolean) {
  const pages = await listPages();
  if (withImages) {
    let done = 0;
    for (const p of pages) {
      setTask({ label: "Packing image files into the export…", done: done++, total: pages.length });
      p.images = await Promise.all(
        (p.images ?? []).map(async (i) => {
          const file = await getImage(i.src);
          return file ? { ...i, type: file.type, bytes: file.size, dataUrl: await toDataUrl(file.blob) } : i;
        }),
      );
    }
  }
  setTask(null);
  const stamp = new Date().toISOString().slice(0, 10);
  await downloadText(
    `page-crawler/library-${stamp}${withImages ? "-with-images" : ""}.json`,
    JSON.stringify(pages, null, 2),
    "application/json",
  );
}

// ---------- events ----------

document.addEventListener("click", async (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-action], [data-tab]");
  if (!btn) return;

  if (btn.dataset.tab) {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === btn));
    $("crawl-view").hidden = btn.dataset.tab !== "crawl";
    $("library-view").hidden = btn.dataset.tab !== "library";
    if (btn.dataset.tab === "library") await renderLibrary();
    return;
  }

  const url = btn.dataset.url ?? "";
  const n = nodes.get(url);
  try {
    switch (btn.dataset.action) {
      case "toggle":
        if (collapsed.has(url)) collapsed.delete(url);
        else collapsed.add(url);
        render();
        break;
      case "sub-all":
      case "sub-none": {
        const vis = visibleSet();
        for (const d of descendants(url)) {
          if (!vis.has(d) || !selectable(d)) continue;
          if (btn.dataset.action === "sub-all") selected.add(d);
          else selected.delete(d);
        }
        render();
        break;
      }
      case "expand-links":
        if (n) {
          addChildren(n, n.unexpanded, false);
          n.unexpanded = [];
          collapsed.delete(url);
          render();
        }
        break;
      case "goto":
        goTo(url);
        break;
      case "details":
        if (detailsOpen.has(url)) detailsOpen.delete(url);
        else detailsOpen.add(url);
        render();
        break;
      case "save":
        if (n) await saveNode(n);
        render();
        break;
      case "download":
        if (n?.page) await downloadNode(n);
        break;
      case "summarize":
        if (n) await summarizeNode(n);
        break;
      case "view":
        if (n?.page) showViewer(toRecord(n));
        break;
      case "lib-view": {
        const rec = await getPage(url);
        if (rec) showViewer(rec);
        break;
      }
      case "lib-download": {
        const rec = await getPage(url);
        if (rec) await downloadPage(rec, settings.saveImageFiles, settings.maxImageKB * 1024);
        break;
      }
      case "lib-summarize": {
        const rec = await getPage(url);
        if (!rec) break;
        btn.textContent = "Summarizing…";
        (btn as HTMLButtonElement).disabled = true;
        settings = await loadSettings();
        setTask({ label: `Summarizing ${rec.title}…` });
        rec.summary = await summarize(rec, settings).finally(() => setTask(null));
        rec.summaryModel = settings.model;
        rec.summarizedAt = new Date().toISOString();
        await putPage(rec);
        await renderLibrary();
        break;
      }
      case "lib-delete":
        if (confirm("Delete this saved page?")) {
          await deletePage(url);
          await renderLibrary();
        }
        break;
      case "lib-delete-group": {
        e.preventDefault(); // the button sits in a <summary>; don't fold the group
        const recs = (await listPages()).filter((p) => (p.sourceUrl ?? p.url) === url);
        if (confirm(`Delete all ${recs.length} saved pages crawled from ${url}?`)) {
          for (const r of recs) await deletePage(r.url);
          await renderLibrary();
        }
        break;
      }
    }
  } catch (err) {
    alert(errText(err));
    if (btn.dataset.action === "lib-summarize") await renderLibrary();
  }
});

$("source-form").addEventListener("submit", (e) => {
  e.preventDefault();
  void loadSource($<HTMLInputElement>("source-url").value.trim());
});

$("tree").addEventListener("change", (e) => {
  const box = e.target as HTMLInputElement;
  if (!box.classList.contains("sel") || !box.dataset.url) return;
  if (box.checked) selected.add(box.dataset.url);
  else selected.delete(box.dataset.url);
  render();
});
$("link-filter").addEventListener("input", render);
$("same-domain").addEventListener("change", render);
$("depth").addEventListener("change", async () => {
  const input = $<HTMLInputElement>("depth");
  input.value = String(depthLimit());
  settings = { ...(await loadSettings()), maxDepth: depthLimit() };
  await saveSettings(settings);
  render();
});
$("select-all").addEventListener("click", () => {
  visibleSet().forEach((u) => selectable(u) && selected.add(u));
  render();
});
$("select-none").addEventListener("click", () => {
  visibleSet().forEach((u) => selected.delete(u));
  render();
});
$("expand-all").addEventListener("click", () => {
  collapsed.clear();
  render();
});
$("collapse-all").addEventListener("click", () => {
  for (const n of nodes.values()) if (n.depth >= 1 && n.children.length) collapsed.add(n.url);
  render();
});
$("crawl-btn").addEventListener("click", () => void crawl());
$("stop-btn").addEventListener("click", () => {
  stopRequested = true;
  note = "Stopping after the pages already loading…";
  render();
});

/** Run a bulk action over the selected crawled pages, with progress. */
async function bulk(btn: HTMLButtonElement, label: string, list: TreeNode[], fn: (n: TreeNode) => Promise<void>, parallel = 1) {
  btn.disabled = true;
  const text = btn.textContent;
  btn.textContent = label;
  let done = 0;
  const step = () => setTask({ label, done, total: list.length });
  try {
    settings = await loadSettings();
    step();
    await runQueue([...list], parallel, async (n) => {
      try {
        await fn(n);
      } finally {
        done++;
        step();
        render();
      }
    });
  } catch (err) {
    alert(errText(err));
  } finally {
    btn.textContent = text;
    if (!crawling) setTask(null);
    render();
  }
}
$("save-sel").addEventListener("click", (e) =>
  bulk(e.currentTarget as HTMLButtonElement, "Saving…", selectedDone(), (n) => saveNode(n)),
);
$("download-sel").addEventListener("click", (e) =>
  bulk(e.currentTarget as HTMLButtonElement, "Downloading…", selectedDone(), downloadNode),
);
$("summarize-sel").addEventListener("click", (e) =>
  bulk(
    e.currentTarget as HTMLButtonElement,
    "Summarizing…",
    selectedDone().filter((n) => !n.summary),
    summarizeNode,
    2,
  ),
);

$("lib-search").addEventListener("input", () => void renderLibrary());
$("export-md").addEventListener("click", async () => {
  const pages = await listPages();
  const stamp = new Date().toISOString().slice(0, 10);
  await downloadText(`page-crawler/library-${stamp}.md`, pages.map((p) => toMarkdown(p)).join("\n\n---\n\n"));
});
$("export-json").addEventListener("click", () => void exportJson(false));
$("export-json-images").addEventListener("click", () => void exportJson(true));
$("open-settings").addEventListener("click", () => chrome.runtime.openOptionsPage());

// ---------- start ----------

(async () => {
  settings = await loadSettings();
  $<HTMLInputElement>("same-domain").checked = settings.sameDomainOnly;
  $<HTMLInputElement>("depth").value = String(settings.maxDepth);
  $<HTMLInputElement>("depth").max = String(MAX_DEPTH);
  const params = new URLSearchParams(location.search);
  const url = params.get("url");
  const tabId = params.get("tabId");
  if (url && /^https?:/.test(url)) {
    $<HTMLInputElement>("source-url").value = url;
    await loadSource(url, tabId ? Number(tabId) : undefined);
  }
})();
