// The side panel: the default view when the toolbar icon is clicked. It reads the page in the
// active tab and offers its main table or list with the essentials: try another, choose columns,
// more rows from next pages or scrolling, and export. "Open full view" opens the dashboard for
// crawling a whole site, with every control.

import { getPage, listPages, putPage, type PageRecord } from "./db";
import { parseHtml, stripHash, type ParsedPage } from "./extract";
import { extensionFor, imageBlob } from "./images";
import { loadPage } from "./loader";
import { downloadBlob, downloadPage, downloadText, slug } from "./markdown";
import { checkTarget, exportDatabase } from "./notion";
import { captureTab } from "./render";
import { toCsv, toSheet, type ColumnPref, type DataTable, type Sheet, type SheetSource } from "./resources";
import { loadSettings, type Settings } from "./settings";
import { mountSettings } from "./settingsForm";
import { xlsxBlob } from "./xlsx";

let settings: Settings;
let colPrefs: Record<string, ColumnPref> = {};

let tabId: number | undefined;
let tabUrl = "";
let page: ParsedPage | null = null;
let state: "loading" | "ready" | "restricted" | "error" = "loading";
let error = "";
/** Tables and lists on the page, biggest first. */
let datasets: DataTable[] = [];
let pick = 0;
/** Next pages loaded for "Follow Next link", in order. */
let extra: ParsedPage[] = [];
let loadingNext = false;
let nextError = "";
let followNext = false;
let scrollMore = false;
let renaming: string | null = null;
let busy = "";
/** Set by the Stop button: the running job stops before its next step. */
let stopAsked = false;
/** Downloads the running job started, so Stop can cancel those still in progress. */
let jobDownloads: number[] = [];

class Stopped extends Error {
  constructor() {
    super("Stopped");
  }
}
const checkStop = () => {
  if (stopAsked) throw new Stopped();
};

/** Start a download and remember its id for Stop. */
async function startDownload(url: string, filename: string): Promise<void> {
  const id = await chrome.downloads.download({ url, filename, conflictAction: "uniquify" });
  if (id !== undefined) jobDownloads.push(id);
}

/** Progress for the running job: the bar at the top of the panel. */
function progress(label: string) {
  busy = label;
  paintBusy();
}

function paintBusy() {
  const label = busy || (loadingNext ? `Loading next page ${extra.length + 2}…` : "");
  $("sp-busy").hidden = !label;
  $("sp-busy-label").textContent = stopAsked && label ? "Stopping…" : label;
  $<HTMLButtonElement>("sp-stop").disabled = stopAsked;
}

function stopJob() {
  stopAsked = true;
  for (const id of jobDownloads) void chrome.downloads.cancel(id).catch(() => {});
  paintBusy();
}
let status = "";
/** Bumped on every scan, so work for a page that is no longer shown is dropped. */
let generation = 0;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const errText = (err: unknown) => String((err as Error)?.message ?? err);
const hostOf = (u: string) => new URL(u).hostname.replace(/^www\./, "");
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const score = (t: DataTable) => t.rows.length * Math.max(1, t.columns.length);

// ---------- reading the page ----------

async function scan() {
  const gen = ++generation;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url ?? "";
  if (gen !== generation) return;
  const samePage = !!url && url.split("#")[0] === tabUrl.split("#")[0];
  tabId = tab?.id;
  tabUrl = url;
  if (!tab?.id || !/^https?:/.test(url)) {
    page = null;
    state = "restricted";
    paint();
    return;
  }
  state = "loading";
  if (!samePage) {
    extra = [];
    nextError = "";
    renaming = null;
  }
  paint();
  try {
    settings = await loadSettings();
    const scroll = scrollMore
      ? { scrolls: Math.max(3, settings.scrollTimes), clickMore: true }
      : { scrolls: 0, clickMore: false };
    const captured = await captureTab(tab.id, scrollMore ? 8_000 : 3_000, scroll);
    if (gen !== generation) return;
    const prevSig = datasets[pick]?.signature;
    page = { ...parseHtml(captured.html, stripHash(captured.url), settings.titleSource), loadedVia: "live" };
    datasets = [...page.lists, ...page.tables].sort((a, b) => score(b) - score(a));
    const keep = samePage && prevSig ? datasets.findIndex((d) => d.signature === prevSig) : -1;
    pick = keep >= 0 ? keep : 0;
    state = "ready";
    paint();
    if (followNext && !extra.length) void loadNext();
  } catch (err) {
    if (gen !== generation) return;
    state = "error";
    error = errText(err);
    paint();
  }
}

/** Follow the page's "Next" link, page after page, up to the limit in Settings. */
async function loadNext() {
  if (!page?.nextUrl || loadingNext) return;
  const gen = generation;
  loadingNext = true;
  stopAsked = false;
  nextError = "";
  paint();
  const seen = new Set([stripHash(page.url), ...extra.map((p) => stripHash(p.url))]);
  let next = (extra.at(-1) ?? page).nextUrl;
  try {
    while (next && extra.length < settings.maxNextPages && followNext && !stopAsked && gen === generation) {
      if (seen.has(stripHash(next))) break;
      seen.add(stripHash(next));
      const p = await loadPage(next, settings);
      if (gen !== generation || !followNext || stopAsked) return;
      extra.push(p);
      next = p.nextUrl;
      paint();
    }
  } catch (err) {
    if (gen === generation) nextError = errText(err);
  } finally {
    if (gen === generation) {
      loadingNext = false;
      if (stopAsked) nextError = `Stopped after ${plural(extra.length, "more page")}.`;
      stopAsked = false;
      paint();
    }
  }
}

// ---------- the chosen table or list ----------

const current = (): DataTable | undefined => datasets[pick];

/** The chosen table or list, plus the same-layout ones on the next pages loaded. */
function sources(): SheetSource[] {
  const t = current();
  if (!t || !page) return [];
  const out: SheetSource[] = [{ table: t, pageUrl: page.url }];
  for (const p of extra)
    for (const u of [...p.lists, ...p.tables]) if (u.signature === t.signature) out.push({ table: u, pageUrl: stripHash(p.url) });
  return out;
}

const sheet = (): Sheet => toSheet(sources(), colPrefs, current()?.title);
const pref = (t: DataTable): ColumnPref => colPrefs[t.signature] ?? { hidden: [], names: {} };
const saveColPrefs = () => chrome.storage.local.set({ columnPrefs: colPrefs });

// ---------- painting ----------

function paint() {
  const body = $("sp-body");
  const foot = $("sp-foot");
  foot.hidden = panelTab !== "crawl" || state !== "ready" || !current();
  if (state === "restricted") {
    body.innerHTML = `<div class="sp-empty"><strong>Open a web page to read its data.</strong>
      <p class="muted">Chrome doesn't let extensions read this kind of page (new tab, settings, the Web Store).</p>
      <button data-action="open-full">Crawl a site in the full view</button></div>`;
    return;
  }
  if (state === "error") {
    body.innerHTML = `<div class="sp-empty"><strong>Couldn't read this page.</strong><p class="error">${esc(error)}</p>
      <button data-action="rescan">Try again</button></div>`;
    return;
  }
  if (state === "loading" && !page) {
    body.innerHTML = `<div class="sp-empty"><span class="spinner"></span> Reading the page…</div>`;
    return;
  }
  const p = page!;
  const t = current();
  const scrollY = body.scrollTop;
  body.innerHTML = `
    <section class="sp-page">
      <div class="sp-title">${esc(p.title || "Untitled page")}</div>
      <div class="url">${esc(p.url)}</div>
      <div class="sp-page-actions">
        <button class="small" data-action="rescan" ${state === "loading" ? "disabled" : ""}>${state === "loading" ? `<span class="spinner"></span>Reading…` : "Rescan"}</button>
        <button class="small" data-action="open-full" title="Crawl the links on this page, in the full view">Crawl this site…</button>
      </div>
    </section>
    ${t ? datasetHtml(t) : `<div class="card sp-none"><strong>No table or list found.</strong>
      <p class="muted">Pages that load their items as you scroll may need “Scroll to load more”. You can still save the page or download it as Markdown from the full view.</p></div>`}
    ${moreRowsHtml()}
    ${alsoHtml()}`;
  body.scrollTop = scrollY;
  const input = body.querySelector<HTMLInputElement>(".chip-input");
  input?.focus();
  input?.select();
  const s = t ? sheet() : undefined;
  paintBusy();
  $("sp-status").textContent =
    status ||
    (s ? `${plural(s.rows.length, "row")} × ${plural(s.header.length, "column")}${extra.length ? ` from ${extra.length + 1} pages` : ""}` : "");
  foot.querySelectorAll<HTMLButtonElement>(".sp-export > button").forEach((b) => (b.disabled = !!busy || !s?.header.length));
}

function datasetHtml(t: DataTable): string {
  const pr = pref(t);
  const s = sheet();
  const chips = t.columns
    .map((c) => {
      const name = pr.names[c.key] || c.name;
      if (renaming === c.key)
        return `<input class="chip-input" data-key="${esc(c.key)}" value="${esc(name)}" aria-label="New name for ${esc(name)}">`;
      const off = pr.hidden.includes(c.key);
      return `<button class="chip ${off ? "off" : "on"}" data-action="chip" data-key="${esc(c.key)}" aria-pressed="${!off}"
        title="${off ? "Hidden: click to include" : "Click to hide"} · double-click to rename">${esc(name)}</button>`;
    })
    .join("");
  const rows = s.rows.slice(0, 6);
  return `
    <section class="card sp-dataset">
      <div class="sp-ds-head">
        <span class="kind">${t.kind === "list" ? "LIST" : "TABLE"} ${pick + 1} OF ${datasets.length}</span>
        <strong class="grow ellipsis" title="${esc(t.title)}">${esc(t.title)}</strong>
        <span class="muted">${plural(t.rows.length, "row")}</span>
      </div>
      <button data-action="another" ${datasets.length < 2 ? "disabled" : ""}>Try another</button>
    </section>
    <section class="sp-cols">
      <div class="row-between"><strong>Columns</strong><button class="link-btn" data-action="reset-cols" ${pr.hidden.length || Object.keys(pr.names).length ? "" : "hidden"}>Reset</button></div>
      <div class="chips">${chips}</div>
      <p class="muted small-text">Click a column to hide it, double-click to rename. Remembered for this layout on every page.</p>
    </section>
    <div class="preview-wrap sp-preview">
      ${
        s.header.length
          ? `<table class="preview"><thead><tr>${s.header.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((r) => `<tr>${s.header.map((_, i) => `<td>${esc((r[i] ?? "").slice(0, 80))}</td>`).join("")}</tr>`).join("")}</tbody></table>`
          : `<p class="muted pad">Every column is hidden. Click a column above to bring it back.</p>`
      }
    </div>
    ${s.rows.length > rows.length ? `<p class="muted small-text">First ${rows.length} of ${plural(s.rows.length, "row")}.</p>` : ""}`;
}

function moreRowsHtml(): string {
  const p = page!;
  const found = !!p.nextUrl;
  const nextLine = loadingNext
    ? `<span class="spinner"></span>Loading page ${extra.length + 2}…`
    : nextError
      ? `<span class="error">${esc(nextError)}</span>`
      : extra.length
        ? `${plural(extra.length, "more page")} added`
        : "";
  return `<section class="card sp-more">
    <strong>More rows</strong>
    <label class="check"><input type="checkbox" id="sp-follow" ${followNext ? "checked" : ""} ${found ? "" : "disabled"}>
      <span class="grow">Follow “Next” link</span><span class="${found ? "ok" : "muted"} small-text">${found ? "found" : "none on this page"}</span></label>
    ${followNext && found ? `<div class="sp-indent small-text muted">Up to ${settings.maxNextPages} pages (change in Settings) ${nextLine ? `· ${nextLine}` : ""}</div>` : ""}
    <label class="check"><input type="checkbox" id="sp-scroll" ${scrollMore ? "checked" : ""}>
      <span class="grow">Scroll to load more</span></label>
    ${scrollMore ? `<div class="sp-indent small-text muted">Scrolls this tab to the bottom and presses “Load more” buttons, then reads it again.</div>` : ""}
  </section>`;
}

function alsoHtml(): string {
  const p = page!;
  const others = datasets
    .map((d, i) => ({ d, i }))
    .filter(({ i }) => i !== pick)
    .slice(0, 6)
    .map(
      ({ d, i }) =>
        `<button class="sp-also-row" data-action="pick" data-i="${i}"><span class="ellipsis">${esc(d.title)} · ${d.kind}</span><span class="muted">${plural(d.rows.length, "row")}</span></button>`,
    )
    .join("");
  const metaCount = Object.keys(p.meta).length;
  const row = (label: string, count: number, action: string, btn: string) =>
    count
      ? `<div class="sp-also-row static"><span>${label}</span><span class="muted">${count}</span>${action ? `<button class="small" data-action="${action}" ${busy ? "disabled" : ""}>${btn}</button>` : ""}</div>`
      : "";
  const body =
    others +
    row("Images", p.images.length, "images", "Download") +
    row(`Files${p.files.length ? ` · ${[...new Set(p.files.map((f) => f.ext.toUpperCase()))].slice(0, 3).join(", ")}` : ""}`, p.files.length, "files", "Download") +
    row("Page data (meta tags, schema.org)", metaCount, "open-full", "Fields…");
  return body ? `<section class="sp-also"><strong>Also on this page</strong>${body}</section>` : "";
}

// ---------- actions ----------

const tablesDir = () => `page-crawler/${hostOf(page!.url)}/tables`;

/** Run a job with the busy bar and its Stop button. `done` counts finished steps for the stop message. */
async function run(label: string, fn: (done: { n: number }) => Promise<string | void>) {
  busy = label;
  status = "";
  stopAsked = false;
  jobDownloads = [];
  const done = { n: 0 };
  paint();
  try {
    status = (await fn(done)) || "";
  } catch (err) {
    if (err instanceof Stopped) status = `Stopped after ${done.n} item${done.n === 1 ? "" : "s"}.`;
    else {
      status = "";
      alert(errText(err));
    }
  } finally {
    busy = "";
    stopAsked = false;
    jobDownloads = [];
    paint();
  }
}

function record(p: ParsedPage): PageRecord {
  const now = new Date().toISOString();
  return {
    url: stripHash(p.url),
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
    sourceUrl: stripHash(p.url),
    sourceTitle: p.title,
    depth: 0,
    crawledAt: now,
    savedAt: now,
  };
}

function openFull(hash = "") {
  const params = new URLSearchParams();
  if (page || /^https?:/.test(tabUrl)) {
    params.set("url", page?.url ?? tabUrl);
    if (tabId !== undefined) params.set("tabId", String(tabId));
  }
  void chrome.tabs.create({ url: chrome.runtime.getURL(`dashboard.html${params.size ? `?${params}` : ""}${hash}`) });
}

// ---------- tabs: Crawl (this page), Library, Settings ----------

type PanelTab = "crawl" | "library" | "settings";
let panelTab: PanelTab = "crawl";

function showPanelTab(name: PanelTab) {
  panelTab = name;
  document.querySelectorAll<HTMLElement>(".sp-tabs .tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === name);
    t.setAttribute("aria-current", t.dataset.tab === name ? "page" : "false");
  });
  $("sp-body").hidden = name !== "crawl";
  $("sp-lib").hidden = name !== "library";
  $("sp-settings").hidden = name !== "settings";
  if (name === "library") void paintLibrary();
  if (name === "settings") void mountSettings($("sp-settings"), (s) => (settings = s));
  paint();
}

/** Saved pages, grouped by site, newest first. The full view has cards, hierarchy and categories. */
async function paintLibrary() {
  const q = $<HTMLInputElement>("sp-lib-q").value.trim().toLowerCase();
  const all = (await listPages()).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  const pages = all.filter((p) => !q || [p.title, p.url, p.summary ?? "", p.description].some((s) => s.toLowerCase().includes(q)));
  const sites = new Map<string, PageRecord[]>();
  for (const p of pages) sites.set(hostOf(p.url), [...(sites.get(hostOf(p.url)) ?? []), p]);
  const row = (p: PageRecord) => {
    const n = (p.tables?.length ?? 0) + (p.lists?.length ?? 0);
    return `<li class="sp-lib-row">
      <a class="sp-lib-title ellipsis" href="${esc(p.url)}" target="_blank" title="${esc(p.title)}">${esc(p.title)}</a>
      <div class="tags">${n ? `<span class="tag data">${n === 1 ? "1 table or list" : `${n} tables & lists`}</span>` : ""}${p.summary ? `<span class="tag ok">summarized</span>` : ""}
        <span class="spacer"></span>
        <button class="link-btn small-text" data-action="lib-md" data-url="${esc(p.url)}">.md</button>
        ${n ? `<button class="link-btn small-text" data-action="lib-xlsx" data-url="${esc(p.url)}">Excel</button>` : ""}</div>
    </li>`;
  };
  $("sp-lib-list").innerHTML = pages.length
    ? [...sites]
        .map(
          ([host, recs]) => `<details class="sp-lib-site" open><summary><strong>${esc(host)}</strong> <span class="muted">${recs.length}</span></summary>
            <ul>${recs.map(row).join("")}</ul></details>`,
        )
        .join("")
    : `<p class="muted">${all.length ? "No saved pages match." : "Nothing saved yet. On the Crawl tab, use ⋯ → Save page to library."}</p>`;
}

document.addEventListener("input", (e) => {
  if ((e.target as HTMLElement).id === "sp-lib-q") void paintLibrary();
});

document.addEventListener("click", async (e) => {
  const tabBtn = (e.target as HTMLElement).closest<HTMLElement>(".sp-tabs [data-tab]");
  if (tabBtn) {
    showPanelTab(tabBtn.dataset.tab as PanelTab);
    return;
  }
  const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-action]");
  if (!btn || (btn as HTMLButtonElement).disabled) return;
  const menu = btn.closest("details.menu") as HTMLDetailsElement | null;
  if (menu && btn.tagName !== "SUMMARY") menu.open = false;
  const t = current();
  switch (btn.dataset.action) {
    case "open-full":
      openFull();
      break;
    case "open-library":
      openFull("#library");
      break;
    case "lib-md": {
      const rec = await getPage(btn.dataset.url!);
      if (rec) await downloadPage(rec, settings.saveImageFiles, settings.maxImageKB * 1024);
      break;
    }
    case "lib-xlsx": {
      const rec = await getPage(btn.dataset.url!);
      if (!rec) break;
      const sheets = [...(rec.tables ?? []), ...(rec.lists ?? [])].map((t) => toSheet([{ table: t, pageUrl: rec.url }], colPrefs));
      await downloadBlob(`page-crawler/${hostOf(rec.url)}/tables/${slug(rec.title)}.xlsx`, xlsxBlob(sheets));
      break;
    }
    case "rescan":
      void scan();
      break;
    case "another":
      pick = (pick + 1) % datasets.length;
      renaming = null;
      paint();
      break;
    case "pick":
      pick = Number(btn.dataset.i);
      renaming = null;
      paint();
      $("sp-body").scrollTop = 0;
      break;
    case "chip": {
      if (!t) break;
      const key = btn.dataset.key!;
      const pr = (colPrefs[t.signature] ??= { hidden: [], names: {} });
      pr.hidden = pr.hidden.includes(key) ? pr.hidden.filter((k) => k !== key) : [...pr.hidden, key];
      await saveColPrefs();
      paint();
      break;
    }
    case "reset-cols":
      if (t) {
        delete colPrefs[t.signature];
        await saveColPrefs();
        paint();
      }
      break;
    case "xlsx":
      await run("Making the Excel file…", async () => {
        const s = sheet();
        await downloadBlob(`${tablesDir()}/${slug(s.name)}.xlsx`, xlsxBlob([s]));
        return `Saved ${slug(s.name)}.xlsx to Downloads/${tablesDir()}`;
      });
      break;
    case "csv":
      await run("Making the CSV file…", async () => {
        const s = sheet();
        await downloadText(`${tablesDir()}/${slug(s.name)}.csv`, toCsv(s), "text/csv");
        return `Saved ${slug(s.name)}.csv to Downloads/${tablesDir()}`;
      });
      break;
    case "copy": {
      const s = sheet();
      const tsv = [s.header, ...s.rows].map((r) => r.map((v) => (v ?? "").replace(/[\t\r\n]+/g, " ")).join("\t")).join("\n");
      await navigator.clipboard.writeText(tsv);
      status = `Copied ${plural(s.rows.length, "row")}. Paste into Excel or Google Sheets.`;
      paint();
      break;
    }
    case "notion":
      await run("Sending to Notion…", async (done) => {
        settings = await loadSettings();
        const target = { token: settings.notionToken, parent: settings.notionParent };
        checkTarget(target);
        const s = sheet();
        const link = await exportDatabase(target, s, (d) => {
          done.n = d;
          checkStop(); // stops before the next row; the rows sent so far stay in Notion
          progress(`Sending to Notion… ${d} of ${s.rows.length} rows`);
        });
        if (confirm("Sent to Notion. Open it?")) window.open(link, "_blank");
        return `Sent ${plural(s.rows.length, "row")} to Notion.`;
      });
      break;
    case "save":
      await run("Saving…", async () => {
        const rec = record(page!);
        const old = await getPage(rec.url);
        await putPage({ ...rec, summary: old?.summary, summaryModel: old?.summaryModel, summarizedAt: old?.summarizedAt });
        return "Saved to the library.";
      });
      break;
    case "md":
      await run("Downloading…", async (done) => {
        await downloadPage(record(page!), settings.saveImageFiles, settings.maxImageKB * 1024, (i, total) => {
          done.n = i;
          checkStop();
          progress(`Downloading page images… ${i + 1} of ${total}`);
        });
        return "Downloaded the page as Markdown.";
      });
      break;
    case "images":
    case "files": {
      const p = page!;
      const dir = `page-crawler/${hostOf(p.url)}/${slug(p.title)}_resources`;
      const isImg = btn.dataset.action === "images";
      await run(isImg ? "Downloading images…" : "Downloading files…", async (done) => {
        let failed = 0;
        const list = isImg ? p.images : p.files;
        for (let i = 0; i < list.length; i++) {
          checkStop();
          progress(`Downloading ${isImg ? "images" : "files"}… ${i + 1} of ${list.length}`);
          if (isImg) {
            const img = p.images[i];
            const file = await imageBlob(img.src, settings.maxImageKB * 1024);
            checkStop();
            if (file) {
              const url = URL.createObjectURL(file.blob);
              setTimeout(() => URL.revokeObjectURL(url), 60_000);
              await startDownload(url, `${dir}/image-${String(i + 1).padStart(2, "0")}.${extensionFor(file.type, img.src)}`);
            } else failed++;
          } else {
            const f = p.files[i];
            const base = (new URL(f.url).pathname.split("/").pop() || `file.${f.ext}`).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
            await startDownload(f.url, `${dir}/${base}`).catch(() => failed++);
          }
          done.n = i + 1;
        }
        return `Downloaded ${list.length - failed} of ${list.length}${failed ? ` (${failed} failed or too big)` : ""}.`;
      });
      break;
    }
  }
});

$("sp-stop").addEventListener("click", stopJob);

document.addEventListener("dblclick", (e) => {
  const chip = (e.target as HTMLElement).closest<HTMLElement>(".chip");
  if (!chip) return;
  renaming = chip.dataset.key!;
  paint();
});

async function finishRename(input: HTMLInputElement, keep: boolean) {
  const t = current();
  if (!t || renaming !== input.dataset.key) return;
  const key = renaming;
  renaming = null;
  if (keep) {
    const pr = (colPrefs[t.signature] ??= { hidden: [], names: {} });
    const v = input.value.trim();
    if (v && v !== t.columns.find((c) => c.key === key)?.name) pr.names[key] = v;
    else delete pr.names[key];
    await saveColPrefs();
  }
  paint();
}

document.addEventListener("keydown", (e) => {
  const input = e.target as HTMLInputElement;
  if (!input.classList?.contains("chip-input")) return;
  if (e.key === "Enter") void finishRename(input, true);
  if (e.key === "Escape") void finishRename(input, false);
});
document.addEventListener("focusout", (e) => {
  const input = e.target as HTMLInputElement;
  if (input.classList?.contains("chip-input")) void finishRename(input, true);
});

document.addEventListener("change", async (e) => {
  const box = e.target as HTMLInputElement;
  if (box.id === "sp-follow") {
    followNext = box.checked;
    if (followNext) void loadNext();
    else extra = [];
    paint();
  } else if (box.id === "sp-scroll") {
    scrollMore = box.checked;
    void scan();
  }
});

// Follow the active tab: switching tabs or loading a new page in this one reads it again.
chrome.tabs.onActivated.addListener(() => void scan());
chrome.tabs.onUpdated.addListener((id, info) => {
  if (id === tabId && (info.status === "complete" || info.url)) void scan();
});
chrome.windows.onFocusChanged.addListener((w) => {
  if (w !== chrome.windows.WINDOW_ID_NONE) void scan();
});
chrome.storage.onChanged.addListener((changes) => {
  if (changes.columnPrefs) {
    colPrefs = changes.columnPrefs.newValue ?? {};
    if (!renaming) paint();
  }
});

(async () => {
  settings = await loadSettings();
  colPrefs = (await chrome.storage.local.get("columnPrefs")).columnPrefs ?? {};
  await scan();
})();
