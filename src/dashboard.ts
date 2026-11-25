import { summarize } from "./ai";
import { deletePage, getImage, getPage, listPages, putPage, type PageRecord, type Picked } from "./db";
import { parseHtml, stripHash, type LinkInfo, type ParsedPage } from "./extract";
import { extensionFor, imageBlob, storeFiles, storeImages, toDataUrl } from "./images";
import { captureTab } from "./render";
import { loadPage as loadSharedPage, scrollOpts as loaderScrollOpts } from "./loader";
import { downloadBlob, downloadPage, downloadText, slug, toMarkdown } from "./markdown";
import { checkTarget, exportDatabase, exportPage, type NotionTarget } from "./notion";
import {
  fieldLabel,
  fileExt,
  toCsv,
  toSheet,
  toSheets,
  uniqueNames,
  type ColumnPref,
  type DataTable,
  type Sheet,
  type SheetSource,
} from "./resources";
import { loadSettings, MAX_DEPTH, saveSettings, type Settings } from "./settings";
import { mountSettings } from "./settingsForm";
import { xlsxBlob } from "./xlsx";

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
  /** For the next pages of a paginated list: the list's first page, and this page's number (2, 3, …). */
  listRoot?: string;
  pageNo?: number;
  /** Set after "Send to Notion". */
  notionUrl?: string;
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
/** Tables, lists, images and files ticked for export (ids from resId). */
const selectedRes = new Set<string>();
/** Column choices per table/list layout (signature), remembered across sessions. */
let colPrefs: Record<string, ColumnPref> = {};
/** Page-table field choices per site. */
let pageFieldPrefs: Record<string, PageFieldPref> = {};
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
  settings = await loadSettings();
  try {
    let page: ParsedPage | undefined;
    if (tabId !== undefined) {
      // Read the live tab so links added by JavaScript are included.
      try {
        // Let content still loading by JavaScript arrive (up to 5s), then read it, shadow DOM included.
        const captured = await captureTab(tabId, 5_000, scrollOpts());
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
    selectedRes.clear();
    sameAs.clear();
    note = "";
    quick = "all";
    const root: TreeNode = { url: rootUrl, linkText: page.title, depth: 0, children: [], unexpanded: [], status: "done", page };
    nodes.set(rootUrl, root);
    selected.add(rootUrl); // already read: ticked so its tables and the bulk actions include it
    register(root, await fingerprint(page));
    remember(stripHash(url), rootUrl, "address"); // the address typed in, if it redirected
    if (stripHash(url) !== rootUrl) root.aliases = [stripHash(url)];
    addNextPage(root);
    addChildren(root, page.links, true);
    root.saved = !!(await getPage(rootUrl));
    focusUrl = rootUrl;
    focusTab = "data";
    focusData = null;
    lastFocusHtml = "";

    $("scopebar").hidden = false;
    $("workbench").hidden = false;
    render();
  } catch (err) {
    $("source-info").innerHTML = `<p class="error intro">Couldn't read the page: ${esc(errText(err))}</p>`;
  } finally {
    if (!crawling) setTask(null);
  }
}

const scrollOpts = () => loaderScrollOpts(settings);
const loadPage = (url: string) => loadSharedPage(url, settings);

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
function findOriginal(
  url: string,
  p: ParsedPage,
  fp: string | undefined,
  paginated = false,
): { url: string; reason: string } | undefined {
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
  // Next pages of a list often share page 1's title and canonical, so don't use it for them.
  const byCanonical = !paginated && p.canonical && p.canonical !== url && hit(p.canonical, (o) => o.page?.title === p.title);
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
    // Links to files (PDF, ZIP, …) aren't pages to crawl: they're listed under Files instead.
    if (autoSelect && passesDomain(l.url) && matchesFilter(l) && !looksRisky(l) && !fileExt(l.url)) selected.add(l.url);
    added.push(child);
  }
  // Keep deeper groups folded so a big crawl stays readable; the root's links stay open.
  if (added.length && parent.depth >= 1) collapsed.add(parent.url);
  return added;
}

const followNext = () => $<HTMLInputElement>("follow-next").checked;

/**
 * Add a page's "Next page" link as the next page of its paginated list: listed under the list's
 * first page, at the same depth (so following it doesn't use up crawl depth), and ticked.
 * A next page already in the tree as an uncrawled link is moved into the list.
 */
function addNextPage(n: TreeNode): TreeNode | undefined {
  const next = n.page?.nextUrl;
  if (!next || !followNext()) return undefined;
  const root = nodes.get(n.listRoot ?? n.url)!;
  const pageNo = (n.pageNo ?? 1) + 1;
  if (pageNo > 1 + settings.maxNextPages) return undefined;
  let child = nodes.get(next);
  if (child) {
    if (!["link", "queued", "error"].includes(child.status) || child.children.length || child.listRoot || child === root) return undefined;
    const old = child.parent ? nodes.get(child.parent) : undefined;
    if (old) old.children = old.children.filter((c) => c !== next);
  } else {
    child = { url: next, linkText: "", depth: 0, children: [], unexpanded: [], status: "link" };
    nodes.set(next, child);
  }
  Object.assign(child, { parent: root.url, depth: root.depth, listRoot: root.url, pageNo, linkText: child.linkText || `Page ${pageNo}` });
  const firstOther = root.children.findIndex((c) => !nodes.get(c)?.listRoot);
  root.children.splice(firstOther === -1 ? root.children.length : firstOther, 0, next);
  selected.add(next);
  return child;
}

/** The quick filter above the tree: every page, pages with tables or lists, or failed pages. */
type Quick = "all" | "data" | "failed";
let quick: Quick = "all";
const hasData = (n: TreeNode) => !!n.page && n.page.tables.length + n.page.lists.length > 0;
const passesQuick = (n: TreeNode) => quick === "all" || (quick === "data" ? hasData(n) : n.status === "error");

/** URLs shown with the current filters: a page passes if it or anything under it matches. */
function visibleSet(): Set<string> {
  const out = new Set<string>();
  const q = filterText();
  const walk = (url: string): boolean => {
    const n = nodes.get(url)!;
    if (n.depth > 0 && !passesDomain(url)) return false;
    let show = matchesFilter(n, q) && passesQuick(n);
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
      const orig = findOriginal(n.url, page, fp, !!n.pageNo);
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
      const next = addNextPage(n);
      if (next && (next.status === "link" || next.status === "error")) {
        next.status = "queued";
        queue.push(next);
        crawlRun.total++;
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
    tables: p.tables,
    lists: p.lists,
    files: p.files,
    meta: p.meta,
    picked: pickedOf(n),
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
  // Picked images and files are stored with the page; other images only with "Keep image files" on.
  const picked = pickedOf(n);
  const imgs = settings.saveImageFiles ? n.page.images : n.page.images.filter((i) => picked?.images.includes(i.src));
  const notes: string[] = [];
  if (imgs.length) {
    const failed = await storeImages(imgs, settings.maxImageKB * 1024);
    notes.push(
      failed
        ? `${imgs.length - failed} of ${imgs.length} image files stored (${failed} failed, blocked or over ${settings.maxImageKB} KB).`
        : `${imgs.length} image file${imgs.length === 1 ? "" : "s"} stored.`,
    );
  }
  if (picked?.files.length) {
    const failed = await storeFiles(picked.files);
    notes.push(
      failed
        ? `${picked.files.length - failed} of ${picked.files.length} picked files stored (${failed} failed or over 50 MB).`
        : `${picked.files.length} picked file${picked.files.length === 1 ? "" : "s"} stored.`,
    );
  }
  n.imageNote = notes.join(" ") || undefined;
}

/** The items picked on this page (resource tags, or single items on the Data / Media tabs). */
function pickedOf(n: TreeNode): Picked | undefined {
  const p = n.page;
  if (!p) return undefined;
  const idx = (kind: ResKind) => resIds(n, kind).flatMap((id, i) => (selectedRes.has(id) ? [i] : []));
  const picked: Picked = {
    images: idx("image").map((i) => p.images[i].src),
    files: idx("file").map((i) => p.files[i].url),
    tables: idx("table"),
    lists: idx("list"),
  };
  return Object.values(picked).some((v) => v.length) ? picked : undefined;
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

// ---------- resources: tables, lists, images, files ----------
//
// Each crawled page lists what was found on it, by type, under its row in the tree. Each item can be
// ticked; the Resources bar exports the ticked tables and lists (CSV, Excel, Notion) and downloads
// the ticked images and files.

type ResKind = "table" | "list" | "image" | "file";
const RES_KINDS: { kind: ResKind; one: string; many: string }[] = [
  { kind: "table", one: "table", many: "tables" },
  { kind: "list", one: "list", many: "lists" },
  { kind: "image", one: "image", many: "images" },
  { kind: "file", one: "file", many: "files" },
];

const resId = (url: string, kind: ResKind, i: number) => `${kind}:${i}@${url}`;
function parseRes(id: string): { kind: ResKind; i: number; url: string } | undefined {
  const m = id.match(/^(table|list|image|file):(\d+)@([\s\S]+)$/);
  return m ? { kind: m[1] as ResKind, i: Number(m[2]), url: m[3] } : undefined;
}
function resItems(p: ParsedPage, kind: ResKind): unknown[] {
  return kind === "table" ? p.tables : kind === "list" ? p.lists : kind === "image" ? p.images : p.files;
}
const resIds = (n: TreeNode, kind: ResKind) => (n.page ? resItems(n.page, kind).map((_, i) => resId(n.url, kind, i)) : []);
const dataOf = (n: TreeNode, kind: "table" | "list") => (kind === "table" ? n.page!.tables : n.page!.lists);
const hostOf = (u: string) => new URL(u).hostname.replace(/^www\./, "");
const shorten = (s: string, max = 80) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** The crawled later pages of the paginated list this page belongs to, in order. */
function laterPages(n: TreeNode): TreeNode[] {
  const root = n.listRoot ?? n.url;
  const no = n.pageNo ?? 1;
  return [...nodes.values()]
    .filter((m) => m.listRoot === root && (m.pageNo ?? 1) > no && m.status === "done" && m.page)
    .sort((a, b) => a.pageNo! - b.pageNo!);
}

/** A table or list plus its same-layout continuations on the list's next pages. */
function withContinuations(n: TreeNode, kind: "table" | "list", i: number): SheetSource[] {
  const t = n.page && dataOf(n, kind)[i];
  if (!t) return [];
  const out: SheetSource[] = [{ table: t, pageUrl: recordUrl(n) }];
  for (const m of laterPages(n))
    for (const u of dataOf(m, kind)) if (u.signature === t.signature) out.push({ table: u, pageUrl: recordUrl(m) });
  return out;
}

/** The ticked tables and lists, with their continuations on next pages, each once. */
function selectedSources(): SheetSource[] {
  const out: SheetSource[] = [];
  const seen = new Set<DataTable>();
  for (const id of selectedRes) {
    const r = parseRes(id);
    const n = r && nodes.get(r.url);
    if (!r || !n?.page || (r.kind !== "table" && r.kind !== "list")) continue;
    for (const s of withContinuations(n, r.kind, r.i)) {
      if (seen.has(s.table)) continue;
      seen.add(s.table);
      out.push(s);
    }
  }
  return out;
}

// ---------- exports: CSV, Excel, Notion ----------

const mergeOn = () => $<HTMLInputElement>("merge-similar").checked;
const tablesDir = (url = rootUrl) => `page-crawler/${hostOf(url)}/tables`;
const notionTarget = (): NotionTarget => ({ token: settings.notionToken, parent: settings.notionParent });

async function sheetsToCsv(sheets: Sheet[], dir = tablesDir()) {
  for (const s of sheets) await downloadText(`${dir}/${slug(s.name)}.csv`, toCsv(s), "text/csv");
}

async function sheetsToXlsx(sheets: Sheet[], name: string, dir = tablesDir()) {
  await downloadBlob(`${dir}/${slug(name)}.xlsx`, xlsxBlob(sheets));
}

/** Each sheet becomes a Notion database under the parent page. */
async function sheetsToNotion(sheets: Sheet[]) {
  settings = await loadSettings();
  const target = notionTarget();
  checkTarget(target);
  const total = sheets.reduce((a, s) => a + s.rows.length, 0);
  if (total > 300 && !confirm(`Send ${total} rows to Notion? Notion takes one request per row, so this takes about ${Math.ceil((total * 0.4) / 60)} minutes.`))
    return;
  const links: string[] = [];
  let done = 0;
  try {
    for (const s of sheets) {
      setTask({ label: `Sending “${s.name}” to Notion…`, done, total });
      links.push(await exportDatabase(target, s, (d) => setTask({ label: `Sending “${s.name}” to Notion…`, done: done + d, total })));
      done += s.rows.length;
    }
  } finally {
    if (!crawling) setTask(null);
  }
  note = `Sent ${sheets.length} table${sheets.length === 1 ? "" : "s"} (${total} rows) to Notion.`;
  render();
  if (links[0] && confirm(`Done. Open ${links.length > 1 ? "the first table" : "it"} in Notion?`)) window.open(links[0], "_blank");
}

/** A page's own tables as sheets (for Notion pages and per-page Excel files). */
const pageSheets = (tables: DataTable[], pageUrl: string) => tables.map((t) => toSheet([{ table: t, pageUrl }], colPrefs));

async function notionNode(n: TreeNode) {
  if (!n.page) return;
  n.notionUrl = await exportPage(notionTarget(), {
    title: n.page.title,
    url: recordUrl(n),
    summary: n.summary,
    markdown: n.page.markdown,
    tables: pageSheets(n.page.tables, recordUrl(n)),
  });
}

/** Download the ticked images and files into a folder per page. */
async function downloadResources() {
  settings = await loadSettings();
  const list = [...selectedRes].flatMap((id) => {
    const r = parseRes(id);
    return r && (r.kind === "image" || r.kind === "file") && nodes.get(r.url)?.page ? [r] : [];
  });
  let done = 0;
  let failed = 0;
  try {
    for (const r of list) {
      setTask({ label: "Downloading images and files…", done: done++, total: list.length });
      const n = nodes.get(r.url)!;
      const dir = `page-crawler/${hostOf(recordUrl(n))}/${slug(n.page!.title)}_resources`;
      if (r.kind === "image") {
        const img = n.page!.images[r.i];
        const file = img && (await imageBlob(img.src, settings.maxImageKB * 1024));
        if (file) await downloadBlob(`${dir}/image-${String(r.i + 1).padStart(2, "0")}.${extensionFor(file.type, img.src)}`, file.blob);
        else failed++;
      } else {
        const f = n.page!.files[r.i];
        if (!f) continue;
        // chrome.downloads fetches it with this browser's cookies, like clicking the link.
        await chrome.downloads
          .download({ url: f.url, filename: `${dir}/${fileNameFrom(f.url, f.ext)}`, conflictAction: "uniquify" })
          .catch(() => failed++);
      }
    }
  } finally {
    if (!crawling) setTask(null);
  }
  note = `Downloaded ${list.length - failed} of ${list.length} images and files${failed ? ` (${failed} failed, blocked or over ${settings.maxImageKB} KB)` : ""}.`;
  render();
}

function fileNameFrom(url: string, ext: string): string {
  let base = new URL(url).pathname.split("/").pop() || "";
  try {
    base = decodeURIComponent(base);
  } catch {
    /* keep it encoded */
  }
  return base.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/^\.+/, "").slice(0, 120) || `file.${ext}`;
}

// ---------- choose fields ----------
//
// Two dialogs share one <dialog>: the columns of one table or list (choices remembered per layout,
// so they apply to the same table on every page), and the page table: one row per ticked page,
// with fields picked from page basics, structured data found in the pages, and CSS selectors.

interface CustomField {
  name: string;
  selector: string;
  /** Attribute to read; empty = the element's text. */
  attr: string;
}
interface PageFieldPref {
  chosen: string[];
  custom: CustomField[];
}

const BASIC_FIELDS: { id: string; name: string; get: (n: TreeNode) => string }[] = [
  { id: "basic:title", name: "Title", get: (n) => n.page!.title },
  { id: "basic:url", name: "URL", get: (n) => recordUrl(n) },
  { id: "basic:description", name: "Description", get: (n) => n.page!.description },
  { id: "basic:excerpt", name: "Excerpt", get: (n) => n.page!.excerpt },
  { id: "basic:heading", name: "First heading (h1)", get: (n) => n.page!.heading },
  { id: "basic:topics", name: "Topics (h1–h3)", get: (n) => n.page!.headings.join("; ") },
  { id: "basic:words", name: "Words", get: (n) => String(n.page!.wordCount) },
  { id: "basic:images", name: "Images", get: (n) => String(n.page!.images.length) },
  { id: "basic:tables", name: "Tables", get: (n) => String(n.page!.tables.length) },
  { id: "basic:files", name: "Files", get: (n) => String(n.page!.files.length) },
  { id: "basic:depth", name: "Depth", get: (n) => String(n.depth) },
  { id: "basic:parent", name: "Found on (parent URL)", get: (n) => n.parent ?? "" },
  { id: "basic:summary", name: "AI summary", get: (n) => n.summary ?? "" },
];
const DEFAULT_PAGE_FIELDS = ["basic:title", "basic:url", "basic:description", "basic:words"];

const saveColPrefs = () => chrome.storage.local.set({ columnPrefs: colPrefs });
const savePageFields = () => chrome.storage.local.set({ pageFields: pageFieldPrefs });
const pfPref = (): PageFieldPref => (pageFieldPrefs[hostOf(rootUrl)] ??= { chosen: [...DEFAULT_PAGE_FIELDS], custom: [] });

function fieldName(id: string): string {
  if (id.startsWith("basic:")) return BASIC_FIELDS.find((b) => b.id === id)?.name ?? id;
  if (id.startsWith("custom:")) return id.slice("custom:".length);
  return fieldLabel(id);
}

const docCache = new WeakMap<ParsedPage, Document>();

/** A CSS-selector field's value on a page: the matches' text (or attribute), joined with " | ". */
function customValue(p: ParsedPage, f: CustomField): string {
  let doc = docCache.get(p);
  if (!doc) {
    doc = new DOMParser().parseFromString(p.html, "text/html");
    docCache.set(p, doc);
  }
  let els: Element[];
  try {
    els = [...doc.querySelectorAll(f.selector)].slice(0, 50);
  } catch {
    return "⚠ invalid selector";
  }
  const values = els.map((el) => {
    if (!f.attr) return (el.textContent ?? "").replace(/\s+/g, " ").trim();
    const v = (el.getAttribute(f.attr) ?? "").trim();
    if (v && /^(href|src|data-src|poster|action)$/i.test(f.attr)) {
      try {
        return new URL(v, p.url).href;
      } catch {
        return v;
      }
    }
    return v;
  });
  return [...new Set(values.filter(Boolean))].join(" | ");
}

function fieldValue(n: TreeNode, id: string): string {
  const basic = BASIC_FIELDS.find((b) => b.id === id);
  if (basic) return basic.get(n);
  if (id.startsWith("custom:")) {
    const f = pfPref().custom.find((c) => `custom:${c.name}` === id);
    return f ? customValue(n.page!, f) : "";
  }
  return n.page!.meta[id] ?? "";
}

/** The chosen fields that exist for these pages, in the order they were chosen. */
function activeFields(pages: TreeNode[]): string[] {
  const pref = pfPref();
  return pref.chosen.filter((id) =>
    id.startsWith("basic:")
      ? BASIC_FIELDS.some((b) => b.id === id)
      : id.startsWith("custom:")
        ? pref.custom.some((c) => `custom:${c.name}` === id)
        : pages.some((n) => id in n.page!.meta),
  );
}

function pageSheet(): Sheet {
  const pages = selectedDone();
  const ids = activeFields(pages);
  return {
    name: `Pages from ${hostOf(rootUrl)}`,
    header: uniqueNames(ids.map(fieldName)),
    rows: pages.map((n) => ids.map((id) => fieldValue(n, id))),
  };
}

function previewTable(header: string[], rows: string[][], off: boolean[] = []): string {
  return `<div class="preview-wrap"><table class="preview">
    <thead><tr>${header.map((h, i) => `<th class="${off[i] ? "off" : ""}">${h}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${header.map((_, i) => `<td class="${off[i] ? "off" : ""}">${esc(shorten(r[i] ?? "", 120))}</td>`).join("")}</tr>`).join("")}</tbody>
  </table></div>`;
}

const exportThis = (extra = "") => `<div class="actions">
  <span class="muted small-text">Export just this:</span>
  <button class="small" data-action="fx-csv">CSV</button>
  <button class="small" data-action="fx-xlsx">Excel</button>
  <button class="small" data-action="fx-notion">Notion</button>
  ${extra}
</div>`;

/** The grid for one table or list: tick columns to keep, type over names to rename. */
function resourceFieldsHtml(id: string): string {
  const r = parseRes(id)!;
  const n = nodes.get(r.url)!;
  const kind = r.kind as "table" | "list";
  const sources = withContinuations(n, kind, r.i);
  const t = sources[0].table;
  const pref = colPrefs[t.signature] ?? { hidden: [], names: {} };
  const total = sources.reduce((a, s) => a + s.table.rows.length, 0);
  const similar = [...nodes.values()].filter((m) => m.page && dataOf(m, kind).some((x) => x.signature === t.signature)).length;
  const kept = t.columns.filter((c) => !pref.hidden.includes(c.key)).length;
  const header = t.columns.map(
    (c) => `<label class="col-head"><input type="checkbox" class="col-inc" data-key="${esc(c.key)}" ${pref.hidden.includes(c.key) ? "" : "checked"}
      title="Include this column"><input type="text" class="col-name" data-key="${esc(c.key)}" value="${esc(pref.names[c.key] || c.name)}" placeholder="${esc(c.name)}" title="Column name: type to rename"></label>`,
  );
  return `<div class="grid-card">
    <div class="grid-head">
      <strong>${esc(t.title)}</strong>
      <span class="muted small-text">${t.rows.length > 15 ? `First 15 of ${total}` : `${total}`} rows · ${kept} of ${t.columns.length} columns kept${
        sources.length > 1 ? ` · includes ${sources.length - 1} next page${sources.length > 2 ? "s" : ""}` : ""
      }</span>
    </div>
    ${previewTable(header, t.rows.slice(0, 15), t.columns.map((c) => pref.hidden.includes(c.key)))}
    <p class="muted small-text pad">Untick a column to leave it out; type over a name to rename it. Remembered for every ${kind} with this layout${similar > 1 ? ` (found on ${similar} pages)` : ""}.</p>
    ${exportThis(`<span class="spacer"></span><button class="small" data-action="fx-reset">Reset columns</button>`)}
  </div>`;
}

function pageFieldsHtml(): string {
  const pages = selectedDone();
  const pref = pfPref();
  const counts = new Map<string, number>();
  for (const n of pages) for (const k of Object.keys(n.page!.meta)) counts.set(k, (counts.get(k) ?? 0) + 1);
  const metaIds = [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)! || a.localeCompare(b));
  const sample = (id: string) => pages.find((n) => n.page!.meta[id])?.page!.meta[id] ?? "";
  const box = (id: string, label: string, extra = "") =>
    `<label class="check pf"><input type="checkbox" class="pf-inc" data-id="${esc(id)}" ${pref.chosen.includes(id) ? "checked" : ""}> ${esc(label)}${extra}</label>`;
  const sheet = pageSheet();
  return `<div class="pf-groups">
      <fieldset><legend>Page basics</legend>${BASIC_FIELDS.map((b) => box(b.id, b.name)).join("")}</fieldset>
      <fieldset><legend>Found in the pages <span class="muted">meta tags, schema.org, microdata</span></legend>
        ${
          metaIds.length
            ? metaIds.map((id) => box(id, fieldLabel(id), ` <span class="muted">${counts.get(id)}/${pages.length} · ${esc(shorten(sample(id), 60))}</span>`)).join("")
            : `<p class="muted">These pages declare no structured data. Add your own fields instead.</p>`
        }</fieldset>
      <fieldset><legend>Your fields <span class="muted">CSS selector</span></legend>
        ${pref.custom
          .map(
            (c) => `<div class="pf-custom">${box(`custom:${c.name}`, c.name)} <code>${esc(c.selector)}${c.attr ? ` @${esc(c.attr)}` : ""}</code>
              <button class="small" data-action="pf-remove" data-name="${esc(c.name)}">Remove</button></div>`,
          )
          .join("")}
        <form id="pf-add" class="pf-add">
          <input name="name" placeholder="Name, e.g. Price" required aria-label="Field name">
          <input name="selector" placeholder="CSS selector, e.g. .price" required aria-label="CSS selector">
          <input name="attr" placeholder="Attribute (optional)" aria-label="Attribute">
          <button type="submit">Add field</button>
        </form>
        <small class="muted">Reads the text of the matching elements, or the attribute you name (href, src, content, datetime…). Several matches are joined with “ | ”. Examples: <code>h1</code>, <code>.price</code>, <code>[itemprop=author]</code>, <code>a.download</code> + <code>href</code>.</small>
      </fieldset>
    </div>
    <div class="grid-card">
      <div class="grid-head"><strong>Preview</strong><span class="muted small-text">${pages.length} ticked, crawled page${pages.length === 1 ? "" : "s"}</span></div>
      ${sheet.header.length ? previewTable(sheet.header.map(esc), sheet.rows.slice(0, 10)) : `<p class="muted pad">Pick at least one field.</p>`}
      ${sheet.rows.length > 10 ? `<p class="muted small-text pad">First 10 of ${sheet.rows.length} pages.</p>` : ""}
      ${exportThis()}
    </div>`;
}

/** What the "Export just this" buttons in the middle pane export. */
function focusSheets(): Sheet[] {
  if (focusTab === "data" && focusData) {
    const r = parseRes(focusData);
    if (r && nodes.get(r.url)?.page) return [toSheet(withContinuations(nodes.get(r.url)!, r.kind as "table" | "list", r.i), colPrefs)];
  }
  return [pageSheet()];
}

$("focus").addEventListener("change", async (e) => {
  const el = e.target as HTMLInputElement;
  if (el.classList.contains("res-sel")) {
    if (el.checked) selectedRes.add(el.dataset.res!);
    else selectedRes.delete(el.dataset.res!);
    render();
  } else if (el.classList.contains("res-all")) {
    const n = nodes.get(el.dataset.url!);
    for (const id of n ? resIds(n, el.dataset.kind as ResKind) : []) {
      if (el.checked) selectedRes.add(id);
      else selectedRes.delete(id);
    }
    render();
  } else if (focusData && (el.classList.contains("col-inc") || el.classList.contains("col-name"))) {
    const r = parseRes(focusData)!;
    const t = dataOf(nodes.get(r.url)!, r.kind as "table" | "list")[r.i];
    const pref = (colPrefs[t.signature] ??= { hidden: [], names: {} });
    const key = el.dataset.key!;
    if (el.classList.contains("col-inc")) {
      pref.hidden = el.checked ? pref.hidden.filter((k) => k !== key) : [...new Set([...pref.hidden, key])];
    } else {
      const v = el.value.trim();
      if (v && v !== t.columns.find((c) => c.key === key)?.name) pref.names[key] = v;
      else delete pref.names[key];
    }
    await saveColPrefs();
    (document.activeElement as HTMLElement | null)?.blur();
    render();
  } else if (focusTab === "pagetable" && el.classList.contains("pf-inc")) {
    const pref = pfPref();
    const id = el.dataset.id!;
    pref.chosen = el.checked ? [...pref.chosen.filter((x) => x !== id), id] : pref.chosen.filter((x) => x !== id);
    await savePageFields();
    render();
  }
});

$("focus").addEventListener("submit", async (e) => {
  const form = e.target as HTMLFormElement;
  if (form.id !== "pf-add") return;
  e.preventDefault();
  const data = new FormData(form);
  const f: CustomField = {
    name: String(data.get("name") ?? "").trim(),
    selector: String(data.get("selector") ?? "").trim(),
    attr: String(data.get("attr") ?? "").trim(),
  };
  try {
    document.createDocumentFragment().querySelector(f.selector);
  } catch {
    alert(`“${f.selector}” isn't a valid CSS selector.`);
    return;
  }
  const pref = pfPref();
  pref.custom = [...pref.custom.filter((c) => c.name !== f.name), f];
  pref.chosen = [...pref.chosen.filter((x) => x !== `custom:${f.name}`), `custom:${f.name}`];
  await savePageFields();
  (document.activeElement as HTMLElement | null)?.blur();
  render();
});

// ---------- render ----------
//
// Three panes: the page tree (left); the focused page in the middle, with its tables and lists,
// text and media (or the page table across all ticked pages); and the export basket (right).

type FocusTab = "data" | "text" | "media" | "pagetable";
let focusUrl = "";
let focusTab: FocusTab = "data";
/** The table or list shown in the middle pane's grid (a resId). */
let focusData: string | null = null;
let lastFocusHtml = "";

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
    ? ""
    : `${done} crawled${failed ? ` · ${failed} failed` : ""}${count("alias") ? ` · ${count("alias")} duplicates` : ""} · ${all.length} pages`;
  $("selected-count").textContent = `${sel.length} ticked${selToCrawl ? ` · ${selToCrawl} to crawl` : ""}`;
  $("ticked-count").textContent = `· ${selDone} crawled`;
  $("results-note").textContent = note;
  if (crawling) {
    const loading = count("loading");
    setTask({
      label: stopRequested ? "Stopping…" : `Crawling — ${loading} loading`,
      done: crawlRun.done,
      total: crawlRun.total,
    });
  }
  const crawlBtn = $<HTMLButtonElement>("crawl-btn");
  crawlBtn.disabled = crawling || (selToCrawl === 0 && expandableNodes(depthLimit()).length === 0);
  crawlBtn.textContent = selToCrawl ? `Crawl ${selToCrawl} selected` : "Crawl selected";
  $("stop-btn").hidden = !crawling;
  for (const id of ["save-sel", "download-sel", "summarize-sel", "notion-sel", "fields-btn"])
    $<HTMLButtonElement>(id).disabled = selDone === 0;
  $("scroll-pill").textContent = `Infinite scroll · ${settings.scrollTimes ? `${settings.scrollTimes}×` : "off"}`;

  renderQuick();
  renderBasket();

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

  const pane = $("tree").parentElement!;
  const scrollY = pane.scrollTop;
  $("tree").innerHTML = nodeHtml(nodes.get(rootUrl)!, vis, stats);
  pane.scrollTop = scrollY;
  renderFocus();
}

function renderQuick() {
  const domain = [...nodes.values()].filter((n) => n.depth === 0 || passesDomain(n.url));
  const chips: { id: Quick; label: string; n: number }[] = [
    { id: "all", label: "All", n: domain.length },
    { id: "data", label: "Has tables or lists", n: domain.filter(hasData).length },
    { id: "failed", label: "Failed", n: domain.filter((n) => n.status === "error").length },
  ];
  $("quick-filters").innerHTML = chips
    .filter((c) => c.id === "all" || c.n || quick === c.id)
    .map((c) => `<button class="chip ${quick === c.id ? "on" : ""}" data-action="quick" data-quick="${c.id}" aria-pressed="${quick === c.id}">${c.label} ${c.n}</button>`)
    .join("");
}

const STATUS_LABEL: Record<Status, string> = {
  link: "Not crawled",
  queued: "Queued",
  loading: "Loading",
  done: "Crawled",
  error: "Failed",
  alias: "Same page as another",
};

function nodeHtml(n: TreeNode, vis: Set<string>, stats: Map<string, { total: number; sel: number }>): string {
  const u = esc(n.url);
  const kids = n.children.filter((c) => vis.has(c));
  const open = !collapsed.has(n.url);
  const s = stats.get(n.url)!;
  const more = n.unexpanded.filter((l) => !nodes.has(l.url) && passesDomain(l.url)).length;
  const active = focusTab !== "pagetable" && focusUrl === n.url ? " active" : "";

  if (n.status === "alias") {
    const orig = nodes.get(n.aliasOf!)!;
    return `<li class="node s-alias" data-node="${u}">
      <div class="line">
        <span class="twisty" aria-hidden="true">↪</span>
        <input type="checkbox" class="sel" disabled title="Same page as one already in the tree: select the original instead" aria-label="Duplicate page">
        <div class="node-main">
          <div class="node-title plain">${esc(nodeTitle(orig))}</div>
          <div class="node-url">${u}</div>
          <div class="tags"><span class="tag" title="${esc(n.aliasReason ?? "")}">same page</span>
            <button class="link-btn small-text" data-action="goto" data-url="${esc(orig.url)}">Go to original</button></div>
        </div>
      </div>
    </li>`;
  }

  const tags: string[] = [];
  if (n.pageNo) tags.push(`<span class="tag page" title="Next page of a paginated list, followed at the same depth">page ${n.pageNo}</span>`);
  else if (n.depth === 0) tags.push(`<span class="tag">start page</span>`);
  if (n.status === "error") tags.push(`<span class="error small-text">${esc(shorten(n.error ?? "Failed", 60))}</span>`);
  if (n.page) {
    for (const k of RES_KINDS) tags.push(pickTag(n, k.kind, k.one, k.many));

  }
  if (n.saved) tags.push(`<span class="tag ok">saved</span>`);
  if (n.summary) tags.push(`<span class="tag ok">summarized</span>`);
  if (n.notionUrl) tags.push(`<a class="tag ok" href="${esc(n.notionUrl)}" target="_blank">in Notion</a>`);
  if (kids.length)
    tags.push(`<span class="group" title="Tick or untick every page below this one">${s.sel}/${s.total} below
      <button class="link-btn" data-action="sub-all" data-url="${u}">all</button><button class="link-btn" data-action="sub-none" data-url="${u}">none</button></span>`);
  if (more)
    tags.push(`<button class="link-btn small-text" data-action="expand-links" data-url="${u}" title="Depth limit reached here: list these links as sub-pages so you can pick some">+${more} links</button>`);

  return `<li class="node s-${n.status}" data-node="${u}">
    <div class="line${active}">
      ${
        kids.length
          ? `<button class="twisty" data-action="toggle" data-url="${u}" aria-expanded="${open}" aria-label="${open ? "Collapse" : "Expand"}">${open ? "▾" : "▸"}</button>`
          : `<span class="twisty"></span>`
      }
      <input type="checkbox" class="sel" data-url="${u}" ${selected.has(n.url) ? "checked" : ""} aria-label="Tick ${esc(nodeTitle(n))}">
      <div class="node-main">
        <button class="node-title" data-action="focus" data-url="${u}" title="Show this page">${esc(nodeTitle(n))}</button>
        <div class="node-url" title="${u}">${esc(shortUrl(n.url))}</div>
        ${tags.length ? `<div class="tags">${tags.join("")}</div>` : ""}
      </div>
      <span class="dot s-${n.status}" title="${STATUS_LABEL[n.status]}" aria-label="${STATUS_LABEL[n.status]}"></span>
    </div>
    ${kids.length && open ? `<ul>${kids.map((c) => nodeHtml(nodes.get(c)!, vis, stats)).join("")}</ul>` : ""}
  </li>`;
}

/**
 * A resource tag in the tree ("4 images", "1 list"…): click to pick them all on that page (and tick
 * the page); click again to drop them. Partly picked shows as "2 of 4 images".
 */
function pickTag(n: TreeNode, kind: ResKind, one: string, many: string): string {
  const ids = resIds(n, kind);
  if (!ids.length) return "";
  const nSel = ids.filter((id) => selectedRes.has(id)).length;
  const state = nSel === 0 ? "" : nSel === ids.length ? " on" : " some";
  const word = ids.length === 1 ? one : many;
  const label = nSel && nSel < ids.length ? `${nSel} of ${ids.length} ${word}` : `${ids.length} ${word}`;
  return `<button class="tag pick${kind === "table" || kind === "list" ? " data" : ""}${state}" data-action="tag-pick" data-url="${esc(n.url)}" data-kind="${kind}"
    aria-pressed="${nSel === ids.length ? "true" : nSel ? "mixed" : "false"}"
    title="${nSel === ids.length ? `Picked: click to drop these ${many}` : `Pick ${ids.length === 1 ? `this ${one}` : `all ${ids.length} ${many}`} on this page: saved and exported with the page`}">${nSel ? "✓ " : ""}${label}</button>`;
}

/** The URL without its scheme and, on the start page's site, without the host. */
function shortUrl(url: string): string {
  const u = new URL(url);
  const rest = u.pathname + u.search;
  return u.hostname === rootHost() ? rest || "/" : `${u.hostname.replace(/^www\./, "")}${rest === "/" ? "" : rest}`;
}

/** Unfold the tree down to a node, show it, scroll to it and flash it. */
function goTo(url: string) {
  for (let u = nodes.get(url)?.parent; u; u = nodes.get(u)?.parent) collapsed.delete(u);
  if (!visibleSet().has(url)) {
    $<HTMLInputElement>("link-filter").value = ""; // a filter hides it
    quick = "all";
  }
  setFocus(url);
  renderNow();
  const li = document.querySelector<HTMLElement>(`[data-node="${CSS.escape(url)}"]`);
  if (!li) return;
  li.scrollIntoView({ block: "center", behavior: "smooth" });
  li.classList.add("flash");
  setTimeout(() => li.classList.remove("flash"), 1600);
}

function setFocus(url: string) {
  if (focusUrl !== url || focusTab === "pagetable") $("focus").scrollTop = 0;
  focusUrl = url;
  if (focusTab === "pagetable") focusTab = "data";
  focusData = null;
}

// ---------- middle pane ----------

function renderFocus() {
  const el = $("focus");
  const active = document.activeElement as HTMLElement | null;
  // Don't replace a field the user is typing in; the next change paints it.
  if (active && el.contains(active) && active.matches("input:not([type=checkbox]):not([type=radio]), textarea")) return;
  const html = focusHtml();
  if (html === lastFocusHtml) return;
  lastFocusHtml = html;
  const scroll = el.scrollTop;
  el.innerHTML = html;
  el.scrollTop = scroll;
  el.querySelectorAll<HTMLInputElement>("[data-partial]").forEach((b) => (b.indeterminate = true));
}

function focusHtml(): string {
  if (focusTab === "pagetable")
    return `<div class="focus-head">
        <div class="focus-title"><h1>Page table</h1><span class="muted">One row per ticked, crawled page. Choices are remembered for ${esc(hostOf(rootUrl))}.</span></div>
        <button data-action="close-pagetable">Back to page</button>
      </div>${pageFieldsHtml()}`;

  const n = nodes.get(focusUrl) ?? nodes.get(rootUrl)!;
  const u = esc(n.url);
  const p = n.page;
  const meta: string[] = [];
  if (p) {
    meta.push(`${p.wordCount.toLocaleString()} words`);
    if (p.loadedVia === "tab") meta.push(`<span title="Loaded in a background browser tab, after its JavaScript ran">rendered</span>`);
    if (n.aliases?.length)
      meta.push(`<span title="${esc(n.aliases.join("\n"))}">also at ${n.aliases.length} other address${n.aliases.length === 1 ? "" : "es"}</span>`);
    if (n.saved) meta.push("saved");
    if (n.notionUrl) meta.push(`<a href="${esc(n.notionUrl)}" target="_blank">open in Notion</a>`);
  }
  const nData = p ? p.tables.length + p.lists.length : 0;
  const nMedia = p ? p.images.length + p.files.length : 0;
  const tab = (id: FocusTab, label: string) =>
    `<button role="tab" data-ftab="${id}" aria-selected="${focusTab === id}" class="${focusTab === id ? "on" : ""}">${label}</button>`;
  const head = `<div class="focus-head">
      <div class="focus-title">
        <h1>${esc(nodeTitle(n))}</h1>
        <div class="focus-meta"><a class="url" href="${u}" target="_blank">${u}</a>${meta.length ? ` · ${meta.join(" · ")}` : ""}</div>
      </div>
      ${p ? `<div class="seg" role="tablist" aria-label="Page view">${tab("data", `Data${nData ? ` (${nData})` : ""}`)}${tab("text", "Text & summary")}${tab("media", `Media & files${nMedia ? ` (${nMedia})` : ""}`)}</div>` : ""}
    </div>`;

  if (!p) {
    const why =
      n.status === "loading"
        ? `<span class="spinner"></span>Loading this page…`
        : n.status === "queued"
          ? "Queued: it will be crawled shortly."
          : n.status === "error"
            ? `<span class="error">${esc(n.error ?? "Failed")}</span><br>Tick it and press <strong>Crawl selected</strong> to try again.`
            : "Not crawled yet. Tick it in the list and press <strong>Crawl selected</strong> to read its tables, lists, text and images.";
    return `${head}<div class="empty-card">${why}</div>`;
  }
  return head + (focusTab === "text" ? textHtml(n) : focusTab === "media" ? mediaHtml(n) : dataHtml(n));
}

/** The page's tables and lists as cards (tick = add to the basket), and the chosen one's grid. */
function dataHtml(n: TreeNode): string {
  const p = n.page!;
  const items = [
    ...p.lists.map((t, i) => ({ t, id: resId(n.url, "list", i), kind: "list" as const, i })),
    ...p.tables.map((t, i) => ({ t, id: resId(n.url, "table", i), kind: "table" as const, i })),
  ].sort((a, b) => b.t.rows.length * b.t.columns.length - a.t.rows.length * a.t.columns.length);
  if (!items.length)
    return `<div class="empty-card">No tables or lists found on this page.${
      Object.keys(p.meta).length ? ` It does declare ${Object.keys(p.meta).length} structured fields: add them as columns in the <button class="link-btn" data-action="open-pagetable">page table</button>.` : ""
    }</div>`;
  if (!focusData || !items.some((x) => x.id === focusData)) focusData = items[0].id;
  const cards = items
    .map(({ t, id, kind, i }) => {
      const pref = colPrefs[t.signature];
      const cols = t.columns.filter((c) => !pref?.hidden.includes(c.key)).length;
      const more = withContinuations(n, kind, i).slice(1);
      const extra = more.length
        ? `<span class="cont">+${more.reduce((a, s) => a + s.table.rows.length, 0)} rows on ${more.length} next page${more.length === 1 ? "" : "s"}</span>`
        : "";
      return `<div class="ds-card${id === focusData ? " active" : ""}">
        <input type="checkbox" class="res-sel" data-res="${esc(id)}" ${selectedRes.has(id) ? "checked" : ""} aria-label="Add ${esc(t.title)} to the export basket" title="Add to the export basket">
        <button class="ds-open" data-action="res-fields" data-res="${esc(id)}">
          <strong>${esc(t.title)}</strong>
          <span class="muted small-text">${kind === "list" ? "List" : "Table"} · ${t.rows.length} rows × ${cols} columns</span>
          ${extra}
        </button>
      </div>`;
    })
    .join("");
  return `<div class="ds-cards">${cards}</div>${resourceFieldsHtml(focusData)}`;
}

function textHtml(n: TreeNode): string {
  const p = n.page!;
  const u = esc(n.url);
  const topics = p.headings.length
    ? `<ul class="topics">${p.headings.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>`
    : `<p class="muted">No headings found.</p>`;
  const summary = n.summaryError
    ? `<p class="error">${esc(n.summaryError)}</p>`
    : n.summary
      ? `<div class="card"><strong>AI summary</strong><div class="md">${esc(n.summary)}</div></div>`
      : "";
  return `<div class="text-tab">
    <div class="actions">
      <button data-action="save" data-url="${u}">${n.saved ? "Save again" : "Save to library"}</button>
      <button data-action="download" data-url="${u}">Download .md</button>
      <button data-action="summarize" data-url="${u}" ${n.summarizing ? "disabled" : ""}>${n.summarizing ? `<span class="spinner"></span>Summarizing…` : n.summary ? "Re-summarize" : "Summarize & save"}</button>
      <button data-action="view" data-url="${u}">View full Markdown</button>
    </div>
    ${summary}
    <p class="muted small-text">Document title: ${esc(p.docTitle || "—")} · Heading: ${esc(p.heading || "—")}${p.ogTitle ? ` · og:title: ${esc(p.ogTitle)}` : ""}</p>
    ${p.excerpt ? `<p class="excerpt">${esc(p.excerpt)}</p>` : ""}
    <div class="card"><strong>Topics</strong>${topics}</div>
    ${n.imageNote ? `<p class="muted">${esc(n.imageNote)}</p>` : ""}
    <pre class="md-preview">${esc(p.markdown.slice(0, 5000))}${p.markdown.length > 5000 ? "\n\n…" : ""}</pre>
  </div>`;
}

function mediaHtml(n: TreeNode): string {
  const p = n.page!;
  const u = esc(n.url);
  if (!p.images.length && !p.files.length) return `<div class="empty-card">No images or file links found on this page.</div>`;
  const box = (id: string, label: string) =>
    `<input type="checkbox" class="res-sel" data-res="${esc(id)}" ${selectedRes.has(id) ? "checked" : ""} aria-label="${esc(label)}">`;
  const images = p.images
    .map(
      (img, i) =>
        `<label class="res-thumb" title="${esc(img.caption || img.alt || img.src)}">${box(resId(n.url, "image", i), `Image ${i + 1}: ${img.alt || img.src}`)}<img src="${esc(img.src)}" alt="${esc(img.alt)}" loading="lazy" referrerpolicy="no-referrer"></label>`,
    )
    .join("");
  const files = p.files
    .map((f, i) => {
      const name = f.text || decodeURI(f.url.split("/").pop() || f.url);
      return `<li><label class="check">${box(resId(n.url, "file", i), name)} ${esc(name)}</label>
        <span class="tag">${esc(f.ext)}</span> <a class="url" href="${esc(f.url)}" target="_blank">${esc(f.url)}</a></li>`;
    })
    .join("");
  const group = (kind: ResKind, title: string, body: string) => {
    const ids = resIds(n, kind);
    if (!ids.length) return "";
    const nSel = ids.filter((id) => selectedRes.has(id)).length;
    return `<div class="res-group card">
      <label class="res-head check"><input type="checkbox" class="res-all" data-url="${u}" data-kind="${kind}" ${nSel === ids.length ? "checked" : ""} ${nSel && nSel < ids.length ? "data-partial" : ""}>
        <strong>${title} (${ids.length})</strong> <span class="muted">${nSel} in basket</span></label>
      ${body}
    </div>`;
  };
  return `<div class="media-tab">
    ${group("image", "Images", `<div class="res-thumbs">${images}</div>`)}
    ${group("file", "Files", `<ul class="file-list">${files}</ul>`)}
  </div>`;
}

// ---------- export basket (right pane) ----------

let dest: "xlsx" | "csv" | "notion" = "xlsx";

function renderBasket() {
  const items = [...selectedRes].flatMap((id) => {
    const r = parseRes(id);
    const n = r && nodes.get(r.url);
    return r && n?.page ? [{ id, r, n }] : [];
  });
  // A table picked on page 1 already carries its continuations on pages 2, 3…: list those once.
  const covered = new Set<DataTable>();
  const data = items
    .filter((x) => x.r.kind === "table" || x.r.kind === "list")
    .sort((a, b) => (a.n.pageNo ?? 1) - (b.n.pageNo ?? 1))
    .filter(({ r, n }) => {
      const src = withContinuations(n, r.kind as "table" | "list", r.i);
      if (!src.length || covered.has(src[0].table)) return false;
      for (const s of src) covered.add(s.table);
      return true;
    });
  const nImg = items.filter((x) => x.r.kind === "image").length;
  const nFile = items.filter((x) => x.r.kind === "file").length;
  const rows = data
    .map(({ id, r, n }) => {
      const kind = r.kind as "table" | "list";
      const src = withContinuations(n, kind, r.i);
      const total = src.reduce((a, s) => a + s.table.rows.length, 0);
      return `<div class="basket-item">
        <button class="link-btn grow ellipsis" data-action="res-show" data-res="${esc(id)}" title="${esc(src[0].table.title)} — ${esc(nodeTitle(n))}">${esc(src[0].table.title)} <span class="muted">· ${esc(shorten(nodeTitle(n), 30))}</span></button>
        <span class="muted small-text">${total} rows${src.length > 1 ? `, ${src.length} pages` : ""}</span>
        <button class="icon-btn small" data-action="res-remove" data-res="${esc(id)}" aria-label="Remove ${esc(src[0].table.title)} from the basket">×</button>
      </div>`;
    })
    .join("");
  const media = [
    nImg ? `<div class="basket-item"><span class="grow">Images</span><span class="muted small-text">${nImg}</span></div>` : "",
    nFile ? `<div class="basket-item"><span class="grow">Files</span><span class="muted small-text">${nFile}</span></div>` : "",
  ].join("");
  $("basket-list").innerHTML =
    rows || media ? rows + media : `<p class="muted small-text">Empty. Tick tables and lists in the middle pane, or add them from every ticked page below.</p>`;
  const exp = $<HTMLButtonElement>("res-export");
  exp.disabled = data.length === 0;
  const t = `${data.length || ""} table${data.length === 1 ? "" : "s"}`.trim();
  exp.textContent = dest === "notion" ? `Send ${t} to Notion` : `Export ${t} as ${dest === "xlsx" ? "Excel" : "CSV"}`;
  const dl = $<HTMLButtonElement>("res-download");
  dl.disabled = nImg + nFile === 0;
  dl.textContent = nImg + nFile ? `Download ${nImg + nFile} images & files` : "Download images & files";
  $<HTMLButtonElement>("res-clear").disabled = items.length === 0;
  $("notion-state").textContent = settings.notionToken && settings.notionParent ? "Connected · each table becomes a database" : "Not set up yet: see Settings";
}

// ---------- library ----------
//
// Saved pages as cards, filtered by site, by what they contain, and by search. Tick cards for the
// bulk actions in the toolbar.

let libSite = "";
const libSel = new Set<string>();
let libShown: PageRecord[] = [];

function libMatches(p: PageRecord, q: string): boolean {
  if (!q) return true;
  const cells = [...(p.tables ?? []), ...(p.lists ?? [])].flatMap((t) => [t.title, ...t.rows.slice(0, 200).flat()]);
  return [p.title, p.url, ...(p.aliases ?? []), p.description, p.summary ?? "", p.headings.join(" "), ...(p.images ?? []).map((i) => i.alt), ...cells].some(
    (s) => s?.toLowerCase().includes(q),
  );
}

async function renderLibrary() {
  const all = await listPages();
  const q = $<HTMLInputElement>("lib-search").value.trim().toLowerCase();
  const has = [...document.querySelectorAll<HTMLInputElement>(".lib-has:checked")].map((b) => b.value);
  const urls = new Set(all.map((p) => p.url));
  for (const u of [...libSel]) if (!urls.has(u)) libSel.delete(u);

  const sites = new Map<string, number>();
  for (const p of all) sites.set(hostOf(p.url), (sites.get(hostOf(p.url)) ?? 0) + 1);
  if (libSite && !sites.has(libSite)) libSite = "";
  const site = (id: string, label: string, n: number) =>
    `<button class="site${libSite === id ? " on" : ""}" data-action="lib-site" data-site="${esc(id)}" aria-pressed="${libSite === id}"><span class="ellipsis">${esc(label)}</span><span class="muted">${n}</span></button>`;
  $("lib-sites").innerHTML =
    site("", "All sites", all.length) + [...sites].sort((a, b) => b[1] - a[1]).map(([h, n]) => site(h, h, n)).join("");

  libShown = all
    .filter(
      (p) =>
        (!libSite || hostOf(p.url) === libSite) &&
        libMatches(p, q) &&
        has.every((h) =>
          h === "tables" ? p.tables?.length : h === "lists" ? p.lists?.length : h === "images" ? p.images?.length : !!p.summary,
        ),
    )
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));

  $("lib-count").textContent = `${libShown.length} page${libShown.length === 1 ? "" : "s"}`;
  $("lib-sel-count").textContent = libSel.size ? `· ${libSel.size} selected` : "";
  const picked = all.filter((p) => libSel.has(p.url));
  for (const id of ["lib-md-sel", "lib-notion-sel", "lib-delete-sel"]) $<HTMLButtonElement>(id).disabled = !picked.length;
  $<HTMLButtonElement>("lib-xlsx-sel").disabled = !picked.some((p) => p.tables?.length || p.lists?.length);

  const list = $("library-list");
  list.className = libView === "cards" ? "lib-grid" : "lib-listview";
  document.querySelectorAll<HTMLElement>("[data-libview]").forEach((b) => {
    b.classList.toggle("on", b.dataset.libview === libView);
    b.setAttribute("aria-pressed", String(b.dataset.libview === libView));
  });
  $("lib-group-wrap").hidden = libView !== "list";
  $<HTMLSelectElement>("lib-group").value = libGroup;
  list.innerHTML = !libShown.length
    ? `<p class="muted">${all.length ? "No saved pages match." : "Nothing saved yet. Crawl some pages and press Save, or use “Save page to library” in the side panel."}</p>`
    : libView === "cards"
      ? libShown.map(libCardHtml).join("")
      : libListHtml(libShown);
  list.querySelectorAll<HTMLInputElement>("[data-partial]").forEach((b) => (b.indeterminate = true));
}

// ---------- library: list view ----------
//
// Rows grouped either by site → crawl (the page it started from) → which page linked to which,
// or by category (what the page contains). Groups fold, and their checkbox selects every page in them.

type LibView = "cards" | "list";
type LibGroup = "site" | "category";
let libView: LibView = "cards";
let libGroup: LibGroup = "site";
/** Folded groups in the list view. */
const libClosed = new Set<string>();
const saveLibPrefs = () => chrome.storage.local.set({ libraryView: { view: libView, group: libGroup, closed: [...libClosed] } });

const LIB_CATEGORIES: { id: string; label: string; test: (p: PageRecord) => boolean }[] = [
  { id: "data", label: "Tables & lists", test: (p) => (p.tables?.length ?? 0) + (p.lists?.length ?? 0) > 0 },
  { id: "summary", label: "Summarized", test: (p) => !!p.summary },
  { id: "images", label: "With images", test: (p) => !!p.images?.length },
  { id: "files", label: "With file links", test: (p) => !!p.files?.length },
  {
    id: "text",
    label: "Text only",
    test: (p) => !(p.tables?.length || p.lists?.length || p.images?.length || p.files?.length),
  },
];

function libGroupHtml(key: string, title: string, recs: PageRecord[], body: string, level: number, note = ""): string {
  const closed = libClosed.has(key);
  const nSel = recs.filter((r) => libSel.has(r.url)).length;
  return `<section class="lib-group lvl-${level}">
    <div class="lib-group-head">
      <button class="twisty" data-action="lib-fold" data-key="${esc(key)}" aria-expanded="${!closed}" aria-label="${closed ? "Expand" : "Collapse"} ${esc(title)}">${closed ? "▸" : "▾"}</button>
      <input type="checkbox" class="lib-group-sel" data-urls="${esc(recs.map((r) => r.url).join("\n"))}" ${nSel && nSel === recs.length ? "checked" : ""} ${nSel && nSel < recs.length ? "data-partial" : ""} aria-label="Select every page in ${esc(title)}">
      <strong class="ellipsis">${esc(title)}</strong>
      <span class="muted small-text">${recs.length} page${recs.length === 1 ? "" : "s"}${note}</span>
    </div>
    ${closed ? "" : `<div class="lib-group-body">${body}</div>`}
  </section>`;
}

function libRowHtml(p: PageRecord, children = ""): string {
  const u = esc(p.url);
  const sel = libSel.has(p.url);
  const data = [...(p.tables ?? []), ...(p.lists ?? [])];
  const tags = [
    data.length ? `<span class="tag data">${data.length === 1 ? "1 table or list" : `${data.length} tables & lists`} · ${data.reduce((a, t) => a + t.rows.length, 0)} rows</span>` : "",
    p.images?.length ? `<span class="tag">${p.images.length} image${p.images.length === 1 ? "" : "s"}</span>` : "",
    p.files?.length ? `<span class="tag">${p.files.length} file${p.files.length === 1 ? "" : "s"}</span>` : "",
    p.summary ? `<span class="tag ok">summarized</span>` : "",
    pickedTag(p),
  ].join("");
  return `<li class="lib-row${sel ? " selected" : ""}">
    <div class="lib-row-line">
      <input type="checkbox" class="lib-sel" data-url="${u}" ${sel ? "checked" : ""} aria-label="Select ${esc(p.title)}">
      <div class="grow min0">
        <div class="lib-row-title ellipsis" title="${esc(p.title)}">${esc(p.title)}</div>
        <a class="url" href="${u}" target="_blank">${esc(p.url)}</a>
      </div>
      <div class="tags lib-row-tags">${tags}</div>
      <div class="lib-row-actions">
        <button class="link-btn" data-action="lib-view" data-url="${u}">View</button>
        <button class="link-btn" data-action="lib-download" data-url="${u}">.md</button>
        ${data.length ? `<button class="link-btn" data-action="lib-xlsx" data-url="${u}">Excel</button>` : ""}
        <button class="link-btn" data-action="lib-notion" data-url="${u}">Notion</button>
        <button class="icon-btn small danger" data-action="lib-delete" data-url="${u}" aria-label="Delete ${esc(p.title)}" title="Delete">×</button>
      </div>
    </div>
    ${children}
  </li>`;
}

/** Pages nested under the page that linked to them (within one crawl). */
function libTreeHtml(recs: PageRecord[]): string {
  const byUrl = new Map(recs.map((r) => [r.url, r]));
  const childrenOf = new Map<string, PageRecord[]>();
  const tops: PageRecord[] = [];
  for (const r of recs) {
    if (r.parentUrl && r.parentUrl !== r.url && byUrl.has(r.parentUrl)) childrenOf.set(r.parentUrl, [...(childrenOf.get(r.parentUrl) ?? []), r]);
    else tops.push(r);
  }
  const order = (a: PageRecord, b: PageRecord) => (a.depth ?? 0) - (b.depth ?? 0) || a.title.localeCompare(b.title);
  const rows = (list: PageRecord[]): string =>
    `<ul class="lib-rows">${[...list].sort(order).map((r) => libRowHtml(r, childrenOf.has(r.url) ? rows(childrenOf.get(r.url)!) : "")).join("")}</ul>`;
  return rows(tops);
}

function libListHtml(pages: PageRecord[]): string {
  if (libGroup === "category") {
    return LIB_CATEGORIES.map((c) => {
      const recs = pages.filter(c.test).sort((a, b) => a.title.localeCompare(b.title));
      return recs.length
        ? libGroupHtml(`cat:${c.id}`, c.label, recs, `<ul class="lib-rows">${recs.map((r) => libRowHtml(r)).join("")}</ul>`, 0)
        : "";
    }).join("");
  }
  const sites = new Map<string, PageRecord[]>();
  for (const p of pages) sites.set(hostOf(p.url), [...(sites.get(hostOf(p.url)) ?? []), p]);
  return [...sites]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([host, recs]) => {
      const crawls = new Map<string, PageRecord[]>();
      for (const r of recs) crawls.set(r.sourceUrl ?? r.url, [...(crawls.get(r.sourceUrl ?? r.url) ?? []), r]);
      const body = [...crawls]
        .map(([src, list]) => {
          const name = list.find((r) => r.url === src)?.title ?? list[0].sourceTitle ?? src;
          const latest = list.reduce((a, r) => (r.savedAt > a ? r.savedAt : a), "");
          return libGroupHtml(`crawl:${src}`, `Crawl from ${name}`, list, libTreeHtml(list), 1, ` · saved ${new Date(latest).toLocaleDateString()}`);
        })
        .join("");
      return libGroupHtml(`site:${host}`, host, recs, body, 0, ` · ${crawls.size} crawl${crawls.size === 1 ? "" : "s"}`);
    })
    .join("");
}

/** "✓ 3 images · 1 file picked": what was picked on the page when it was saved. */
function pickedTag(p: PageRecord): string {
  const k = p.picked;
  if (!k) return "";
  const parts = [
    k.images.length && `${k.images.length} image${k.images.length === 1 ? "" : "s"}`,
    k.files.length && `${k.files.length} file${k.files.length === 1 ? "" : "s"}`,
    k.tables.length + k.lists.length && `${k.tables.length + k.lists.length} table${k.tables.length + k.lists.length === 1 ? "" : "s"}`,
  ].filter(Boolean);
  return parts.length
    ? `<span class="tag picked" title="Picked when saved: included in this page's downloads and exports">✓ ${parts.join(" · ")} picked</span>`
    : "";
}

function blurb(p: PageRecord): string {
  const s = (p.summary ?? "").replace(/^[#>*\s-]*(TL;DR:?)?\s*/i, "").split("\n")[0];
  return shorten(s || p.description || p.excerpt || "", 180);
}

function libCardHtml(p: PageRecord): string {
  const u = esc(p.url);
  const sel = libSel.has(p.url);
  const data = [...(p.tables ?? []), ...(p.lists ?? [])];
  const tags = [
    ...data.slice(0, 3).map((t) => `<span class="tag data">${esc(shorten(t.title, 28))} · ${t.rows.length} rows</span>`),
    data.length > 3 ? `<span class="tag data">+${data.length - 3} more</span>` : "",
    p.images?.length ? `<span class="tag">${p.images.length} image${p.images.length === 1 ? "" : "s"}</span>` : "",
    p.summary ? `<span class="tag ok">summarized</span>` : "",
    pickedTag(p),
  ].join("");
  const saved = new Date(p.savedAt);
  const days = Math.floor((Date.now() - saved.getTime()) / 86_400_000);
  const when = days <= 0 ? "Saved today" : days === 1 ? "Saved yesterday" : `Saved ${saved.toLocaleDateString()}`;
  return `<article class="lib-card${sel ? " selected" : ""}">
    <div class="lib-card-head">
      <input type="checkbox" class="lib-sel" data-url="${u}" ${sel ? "checked" : ""} aria-label="Select ${esc(p.title)}">
      <div class="grow min0"><h3 class="ellipsis" title="${esc(p.title)}">${esc(p.title)}</h3><a class="url" href="${u}" target="_blank">${esc(p.url)}</a></div>
    </div>
    ${blurb(p) ? `<p class="lib-blurb">${esc(blurb(p))}</p>` : ""}
    ${tags ? `<div class="tags">${tags}</div>` : ""}
    <div class="lib-card-foot">
      <button class="link-btn" data-action="lib-view" data-url="${u}">View</button>
      <button class="link-btn" data-action="lib-download" data-url="${u}">.md</button>
      <button class="link-btn" data-action="lib-summarize" data-url="${u}">${p.summary ? "Re-summarize" : "Summarize"}</button>
      ${data.length ? `<button class="link-btn" data-action="lib-xlsx" data-url="${u}" title="Every table and list on this page, one sheet each">Excel</button>` : ""}
      <button class="link-btn" data-action="lib-notion" data-url="${u}" title="Create a Notion page with this page's content, summary and tables">Notion</button>
      <span class="spacer"></span>
      <span class="muted small-text" title="${esc(saved.toLocaleString())}">${when}</span>
      <button class="icon-btn small danger" data-action="lib-delete" data-url="${u}" aria-label="Delete ${esc(p.title)}" title="Delete">×</button>
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
      // Picked files (PDF, Office…) stored with the page come along too.
      p.files = await Promise.all(
        (p.files ?? []).map(async (f) => {
          const file = p.picked?.files.includes(f.url) ? await getImage(f.url) : undefined;
          return file ? { ...f, type: file.type, bytes: file.size, dataUrl: await toDataUrl(file.blob) } : f;
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

async function libSelected(): Promise<PageRecord[]> {
  return (await listPages()).filter((p) => libSel.has(p.url));
}

async function libBulk(label: string, list: PageRecord[], fn: (p: PageRecord) => Promise<void>) {
  let done = 0;
  try {
    settings = await loadSettings();
    for (const p of list) {
      setTask({ label, done: done++, total: list.length });
      await fn(p);
    }
  } catch (err) {
    alert(errText(err));
  } finally {
    setTask(null);
    await renderLibrary();
  }
}

type MainTab = "crawl" | "library" | "settings";

function showTab(name: MainTab) {
  document.querySelectorAll<HTMLElement>(".tab[data-tab]").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === name);
    t.setAttribute("aria-current", t.dataset.tab === name ? "page" : "false");
  });
  $("crawl-view").hidden = name !== "crawl";
  $("library-view").hidden = name !== "library";
  $("settings-view").hidden = name !== "settings";
  $("source-form").hidden = name !== "crawl";
  if (name === "library") void renderLibrary();
  if (name === "settings")
    void mountSettings($("settings-root"), (s) => {
      settings = s;
      render();
    });
  history.replaceState(null, "", name === "crawl" ? location.pathname + location.search : `${location.pathname}${location.search}#${name}`);
}

// ---------- events ----------

document.addEventListener("click", async (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-action], [data-tab], [data-ftab], [data-libview]");
  if (!btn) return;

  if (btn.dataset.tab) {
    showTab(btn.dataset.tab as MainTab);
    return;
  }
  if (btn.dataset.libview) {
    libView = btn.dataset.libview as LibView;
    void saveLibPrefs();
    await renderLibrary();
    return;
  }
  if (btn.dataset.ftab) {
    focusTab = btn.dataset.ftab as FocusTab;
    render();
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
      case "focus":
        setFocus(url);
        render();
        break;
      case "quick":
        quick = btn.dataset.quick as Quick;
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
      case "res-fields":
        focusTab = "data";
        focusData = btn.dataset.res!;
        render();
        break;
      case "res-show": {
        const r = parseRes(btn.dataset.res!);
        if (r) {
          goTo(r.url);
          focusTab = "data";
          focusData = btn.dataset.res!;
          render();
        }
        break;
      }
      case "tag-pick": {
        if (!n?.page) break;
        const kind = btn.dataset.kind as ResKind;
        const ids = resIds(n, kind);
        const all = ids.every((id) => selectedRes.has(id));
        for (const id of ids) {
          if (all) selectedRes.delete(id);
          else selectedRes.add(id);
        }
        if (!all) selected.add(n.url); // picking from a page ticks it, so Save includes it
        setFocus(n.url);
        focusTab = kind === "image" || kind === "file" ? "media" : "data";
        if (kind === "table" || kind === "list") focusData = ids[0];
        render();
        break;
      }
      case "res-remove":
        selectedRes.delete(btn.dataset.res!);
        render();
        break;
      case "res-pick": {
        const kind = btn.dataset.kind as ResKind;
        const pages = selectedDone();
        if (!pages.length) {
          alert("Tick some crawled pages first: this adds their " + RES_KINDS.find((k) => k.kind === kind)!.many + ".");
          break;
        }
        const ids = pages.flatMap((p) => resIds(p, kind));
        const all = ids.length > 0 && ids.every((id) => selectedRes.has(id));
        for (const id of ids) {
          if (all) selectedRes.delete(id);
          else selectedRes.add(id);
        }
        if (!ids.length) alert(`No ${RES_KINDS.find((k) => k.kind === kind)!.many} found on the ticked pages.`);
        render();
        break;
      }
      case "open-pagetable":
        focusTab = "pagetable";
        render();
        break;
      case "close-pagetable":
        focusTab = "data";
        render();
        break;
      case "fx-csv":
        await sheetsToCsv(focusSheets());
        break;
      case "fx-xlsx": {
        const sheets = focusSheets();
        await sheetsToXlsx(sheets, sheets[0].name);
        break;
      }
      case "fx-notion":
        await sheetsToNotion(focusSheets());
        break;
      case "fx-reset":
        if (focusData) {
          const r = parseRes(focusData)!;
          delete colPrefs[dataOf(nodes.get(r.url)!, r.kind as "table" | "list")[r.i].signature];
          await saveColPrefs();
          render();
        }
        break;
      case "pf-remove": {
        const pref = pfPref();
        const name = btn.dataset.name!;
        pref.custom = pref.custom.filter((c) => c.name !== name);
        pref.chosen = pref.chosen.filter((x) => x !== `custom:${name}`);
        await savePageFields();
        render();
        break;
      }
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
      case "lib-fold": {
        const key = btn.dataset.key!;
        if (libClosed.has(key)) libClosed.delete(key);
        else libClosed.add(key);
        void saveLibPrefs();
        await renderLibrary();
        break;
      }
      case "lib-site":
        libSite = btn.dataset.site ?? "";
        await renderLibrary();
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
      case "lib-xlsx": {
        const rec = await getPage(url);
        if (!rec) break;
        const sheets = pageSheets([...(rec.tables ?? []), ...(rec.lists ?? [])], rec.url);
        await sheetsToXlsx(sheets, rec.title, tablesDir(rec.url));
        break;
      }
      case "lib-notion": {
        const rec = await getPage(url);
        if (!rec) break;
        settings = await loadSettings();
        checkTarget(notionTarget());
        btn.textContent = "Sending…";
        (btn as HTMLButtonElement).disabled = true;
        setTask({ label: `Sending ${rec.title} to Notion…` });
        try {
          const link = await exportPage(notionTarget(), {
            title: rec.title,
            url: rec.url,
            summary: rec.summary,
            markdown: rec.markdown,
            tables: pageSheets(rec.tables ?? [], rec.url),
          });
          btn.textContent = "Sent";
          if (confirm("Sent. Open it in Notion?")) window.open(link, "_blank");
        } finally {
          setTask(null);
          (btn as HTMLButtonElement).disabled = false;
        }
        break;
      }
      case "lib-delete":
        if (confirm("Delete this saved page?")) {
          await deletePage(url);
          libSel.delete(url);
          await renderLibrary();
        }
        break;
    }
  } catch (err) {
    alert(errText(err));
    if (btn.dataset.action === "lib-summarize" || btn.dataset.action === "lib-notion") await renderLibrary();
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
$("parallel").addEventListener("change", async () => {
  const input = $<HTMLInputElement>("parallel");
  const n = Math.min(10, Math.max(1, Math.round(Number(input.value)) || 4));
  input.value = String(n);
  settings = { ...(await loadSettings()), concurrency: n };
  await saveSettings(settings);
});
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
$("scroll-pill").addEventListener("click", () => showTab("settings"));

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

$("notion-sel").addEventListener("click", async (e) => {
  settings = await loadSettings();
  try {
    checkTarget(notionTarget());
  } catch (err) {
    alert(errText(err));
    return;
  }
  const list = selectedDone();
  await bulk(e.currentTarget as HTMLButtonElement, "Sending to Notion…", list, notionNode);
  note = `${list.filter((n) => n.notionUrl).length} of ${list.length} pages are in Notion.`;
  render();
});
$("fields-btn").addEventListener("click", () => {
  focusTab = "pagetable";
  $("focus").scrollTop = 0;
  render();
});
$("res-clear").addEventListener("click", () => {
  selectedRes.clear();
  render();
});
document.querySelectorAll<HTMLInputElement>("input[name=dest]").forEach((r) =>
  r.addEventListener("change", () => {
    dest = r.value as typeof dest;
    render();
  }),
);
$("res-export").addEventListener("click", () => {
  const sheets = toSheets(selectedSources(), colPrefs, mergeOn());
  const job =
    dest === "csv"
      ? sheetsToCsv(sheets)
      : dest === "notion"
        ? sheetsToNotion(sheets)
        : sheetsToXlsx(sheets, sheets.length === 1 ? sheets[0].name : `tables-${new Date().toISOString().slice(0, 10)}`);
  void job.then(
    () => {
      if (dest !== "notion") {
        note = `Saved ${sheets.length} ${dest === "csv" ? "CSV file" : "sheet"}${sheets.length === 1 ? "" : "s"} to Downloads/${tablesDir()}.`;
        render();
      }
    },
    (err) => alert(errText(err)),
  );
});
$("res-download").addEventListener("click", () => void downloadResources().catch((err) => alert(errText(err))));
$("merge-similar").addEventListener("change", async () => {
  settings = { ...(await loadSettings()), mergeSimilar: mergeOn() };
  await saveSettings(settings);
});
$("follow-next").addEventListener("change", async () => {
  settings = { ...(await loadSettings()), followPagination: followNext() };
  await saveSettings(settings);
});

$("lib-search").addEventListener("input", () => void renderLibrary());
$("library-view").addEventListener("change", (e) => {
  const box = e.target as HTMLInputElement;
  if (box.classList.contains("lib-sel")) {
    if (box.checked) libSel.add(box.dataset.url!);
    else libSel.delete(box.dataset.url!);
  }
  if (box.classList.contains("lib-group-sel")) {
    for (const u of box.dataset.urls!.split("\n")) {
      if (box.checked) libSel.add(u);
      else libSel.delete(u);
    }
  }
  if (box.id === "lib-group") {
    libGroup = (box as unknown as HTMLSelectElement).value as LibGroup;
    void saveLibPrefs();
  }
  if (["lib-sel", "lib-has", "lib-group-sel"].some((c) => box.classList.contains(c)) || box.id === "lib-group") void renderLibrary();
});
$("lib-select-all").addEventListener("click", () => {
  for (const p of libShown) libSel.add(p.url);
  void renderLibrary();
});
$("lib-select-none").addEventListener("click", () => {
  libSel.clear();
  void renderLibrary();
});
$("lib-md-sel").addEventListener("click", async () => {
  const list = await libSelected();
  await libBulk("Downloading Markdown…", list, (p) => downloadPage(p, settings.saveImageFiles, settings.maxImageKB * 1024));
});
$("lib-xlsx-sel").addEventListener("click", async () => {
  const list = await libSelected();
  const sources = list.flatMap((p) => [...(p.tables ?? []), ...(p.lists ?? [])].map((table) => ({ table, pageUrl: p.url })));
  const sheets = toSheets(sources, colPrefs, settings.mergeSimilar);
  try {
    await sheetsToXlsx(sheets, `library-tables-${new Date().toISOString().slice(0, 10)}`, "page-crawler");
  } catch (err) {
    alert(errText(err));
  }
});
$("lib-notion-sel").addEventListener("click", async () => {
  settings = await loadSettings();
  try {
    checkTarget(notionTarget());
  } catch (err) {
    alert(errText(err));
    return;
  }
  const list = await libSelected();
  await libBulk("Sending to Notion…", list, async (rec) => {
    await exportPage(notionTarget(), {
      title: rec.title,
      url: rec.url,
      summary: rec.summary,
      markdown: rec.markdown,
      tables: pageSheets(rec.tables ?? [], rec.url),
    });
  });
});
$("lib-delete-sel").addEventListener("click", async () => {
  const list = await libSelected();
  if (!confirm(`Delete ${list.length} saved page${list.length === 1 ? "" : "s"}?`)) return;
  for (const p of list) await deletePage(p.url);
  libSel.clear();
  await renderLibrary();
});
$("export-md").addEventListener("click", async () => {
  const pages = await listPages();
  const stamp = new Date().toISOString().slice(0, 10);
  await downloadText(`page-crawler/library-${stamp}.md`, pages.map((p) => toMarkdown(p)).join("\n\n---\n\n"));
});
$("export-json").addEventListener("click", () => void exportJson(false));
$("export-json-images").addEventListener("click", () => void exportJson(true));
chrome.storage.onChanged.addListener((changes) => {
  if (changes.settings) {
    void loadSettings().then((s) => {
      settings = s;
      const par = $<HTMLInputElement>("parallel");
      if (document.activeElement !== par) par.value = String(s.concurrency);
      render();
    });
  }
});

// ---------- start ----------

function showIntro() {
  $("source-info").innerHTML = `<div class="intro">
    <h1>Crawl a site</h1>
    <p class="muted">Enter a start page above and press <strong>Load links</strong>. Its links appear on the left: tick the ones to crawl, then pick tables, lists, images and files to export.</p>
    <p class="muted">Tip: click the Page Crawler icon on any web page to open the side panel and grab that page's table in one click.</p>
  </div>`;
}

(async () => {
  settings = await loadSettings();
  const stored = await chrome.storage.local.get(["columnPrefs", "pageFields"]);
  colPrefs = stored.columnPrefs ?? {};
  pageFieldPrefs = stored.pageFields ?? {};
  $<HTMLInputElement>("same-domain").checked = settings.sameDomainOnly;
  $<HTMLInputElement>("follow-next").checked = settings.followPagination;
  $<HTMLInputElement>("merge-similar").checked = settings.mergeSimilar;
  $<HTMLInputElement>("depth").value = String(settings.maxDepth);
  $<HTMLInputElement>("parallel").value = String(settings.concurrency);
  $<HTMLInputElement>("depth").max = String(MAX_DEPTH);
  const params = new URLSearchParams(location.search);
  const url = params.get("url");
  const tabId = params.get("tabId");
  const lib = (await chrome.storage.local.get("libraryView")).libraryView;
  if (lib) {
    libView = lib.view === "list" ? "list" : "cards";
    libGroup = lib.group === "category" ? "category" : "site";
    for (const k of lib.closed ?? []) libClosed.add(k);
  }
  if (location.hash === "#library" || location.hash === "#settings") showTab(location.hash.slice(1) as MainTab);
  if (url && /^https?:/.test(url)) {
    $<HTMLInputElement>("source-url").value = url;
    await loadSource(url, tabId ? Number(tabId) : undefined);
  } else showIntro();
})();
