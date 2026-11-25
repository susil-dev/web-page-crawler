// The data in a page beyond its text: tables, repeating lists (product cards, search results,
// directory entries…), downloadable files, structured metadata (meta tags, schema.org JSON-LD,
// microdata) and the link to the next page of a paginated list. Also turns tables and lists into
// sheets for CSV, Excel and Notion export.

export interface DataColumn {
  /** Stable across pages built from the same template, so column choices carry over. */
  key: string;
  name: string;
}

export interface DataTable {
  kind: "table" | "list";
  title: string;
  /** Same value for same-layout tables or lists on other pages: column choices and merges use it. */
  signature: string;
  columns: DataColumn[];
  rows: string[][];
}

export interface FileLink {
  url: string;
  text: string;
  ext: string;
}

/** Column choices for every table or list with one signature. */
export interface ColumnPref {
  hidden: string[];
  names: Record<string, string>;
}

export interface Sheet {
  name: string;
  header: string[];
  rows: string[][];
}

const MAX_ROWS = 5000;
const MAX_TABLES = 20;
const MAX_LISTS = 10;
const MAX_COLS = 40;

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const noHash = (url: string) => url.split("#")[0];

function resolve(href: string | null | undefined, pageUrl: string): string | undefined {
  if (!href) return undefined;
  try {
    const u = new URL(href, pageUrl);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : undefined;
  } catch {
    return undefined;
  }
}

/** The closest heading before an element, for naming a table or list. */
function nearbyHeading(el: Element): string {
  let cur: Element | null = el;
  for (let hops = 0; cur && hops < 6; hops++) {
    let sib = cur.previousElementSibling;
    for (let k = 0; sib && k < 4; k++, sib = sib.previousElementSibling) {
      if (/^h[1-6]$/.test(sib.localName)) return clean(sib.textContent).slice(0, 120);
      const inner = sib.querySelectorAll("h1, h2, h3, h4, h5, h6");
      if (inner.length) return clean(inner[inner.length - 1].textContent).slice(0, 120);
    }
    cur = cur.parentElement;
  }
  return "";
}

/** Make names unique and non-empty: "Price", "Price 2", … */
export function uniqueNames(names: string[], fallback = "Column"): string[] {
  const seen = new Map<string, number>();
  return names.map((raw, i) => {
    const base = clean(raw) || `${fallback} ${i + 1}`;
    const n = (seen.get(base.toLowerCase()) ?? 0) + 1;
    seen.set(base.toLowerCase(), n);
    return n === 1 ? base : `${base} ${n}`;
  });
}

// ---------- tables ----------

export function findTables(doc: Document): DataTable[] {
  const out: DataTable[] = [];
  for (const table of doc.querySelectorAll("table")) {
    if (out.length >= MAX_TABLES) break;
    // Skip site chrome and layout tables (they nest other tables).
    if (table.closest("nav, header, footer") || table.querySelector("table")) continue;
    const rows: { cells: string[]; header: boolean }[] = [];
    for (const tr of table.querySelectorAll("tr")) {
      if (tr.closest("table") !== table) continue;
      const cells = [...tr.children].filter((c) => c.localName === "td" || c.localName === "th");
      if (!cells.length) continue;
      const values: string[] = [];
      for (const c of cells) {
        const span = Math.min(20, Math.max(1, Number(c.getAttribute("colspan")) || 1));
        values.push(clean(c.textContent), ...Array<string>(span - 1).fill(""));
      }
      const header = tr.parentElement?.localName === "thead" || cells.every((c) => c.localName === "th");
      rows.push({ cells: values, header });
      if (rows.length > MAX_ROWS) break;
    }
    // Header: the last of the header rows at the top.
    let top = 0;
    while (top < rows.length && rows[top].header) top++;
    const headerCells = top ? rows[top - 1].cells : undefined;
    const data = rows.slice(top).map((r) => r.cells);
    const width = Math.min(MAX_COLS, Math.max(headerCells?.length ?? 0, ...data.map((r) => r.length)));
    if (width < 2 || data.length < (headerCells ? 1 : 2)) continue;
    if (!data.some((r) => r.some(Boolean))) continue;

    const names = uniqueNames(Array.from({ length: width }, (_, i) => headerCells?.[i] ?? ""));
    const title =
      clean(table.querySelector("caption")?.textContent) ||
      clean(table.getAttribute("aria-label")) ||
      nearbyHeading(table) ||
      `Table ${out.length + 1}`;
    const signature = headerCells
      ? `table:${names.map((n) => n.toLowerCase()).join("|")}`
      : `table.${stableClasses(table).sort().join(".")}:${width}`;
    out.push({
      kind: "table",
      title,
      signature,
      columns: names.map((name, i) => ({ key: `c${i}`, name })),
      rows: data.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? "")),
    });
  }
  return out;
}

// ---------- repeating lists ----------
//
// A list is a parent with 3+ children that share a tag and classes (cards, results, rows of divs).
// Each child becomes a row; each distinct place inside the child (by tag/class path) becomes a
// column: its text, its link address, its image address.

const STATE_CLASS =
  /^(active|selected|current|first|last|odd|even|hover|focus|open|closed|hidden|visible|show|fade|in|is-|has-|js-|ng-|v-|css-|sc-|jsx-)/i;
const UTILITY_CLASS =
  /^(flex|grid|block|inline|relative|absolute|sticky|fixed|overflow|truncate|container|clearfix|row|col|text-|font-|bg-|border|rounded|shadow|items-|justify-|self-|gap-|space-|leading-|tracking-|min-|max-|[a-z]{1,3}:)/i;

function stableClasses(el: Element): string[] {
  return [...el.classList].filter((c) => c.length <= 40 && !/\d/.test(c) && !STATE_CLASS.test(c) && !UTILITY_CLASS.test(c));
}

const itemSig = (el: Element) => [el.localName, ...stableClasses(el).sort().slice(0, 3)].join(".");

function step(el: Element): string {
  const c = stableClasses(el)[0];
  return c ? `${el.localName}.${c}` : el.localName;
}

const TAG_NAMES: Record<string, string> = {
  a: "Link",
  img: "Image",
  h1: "Heading",
  h2: "Heading",
  h3: "Heading",
  h4: "Heading",
  h5: "Heading",
  h6: "Heading",
  p: "Text",
  span: "Text",
  div: "Text",
  li: "Item",
  time: "Date",
  strong: "Bold text",
  b: "Bold text",
  em: "Text",
  i: "Text",
  small: "Small text",
  label: "Label",
  button: "Button",
  dt: "Term",
  dd: "Value",
  td: "Cell",
};

function label(el: Element): string {
  const c = stableClasses(el)[0];
  if (c) {
    const h = c.replace(/^[a-z]-/, "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]+/g, " ").trim();
    if (h) return h[0].toUpperCase() + h.slice(1);
  }
  return TAG_NAMES[el.localName] ?? el.localName;
}

const SKIP_IN_ITEM = new Set(["script", "style", "noscript", "template", "svg", "button", "select", "input", "textarea"]);

function imgSrc(img: Element, pageUrl: string): string | undefined {
  const raw =
    img.getAttribute("data-src") ||
    img.getAttribute("data-lazy-src") ||
    (img.getAttribute("srcset") || img.getAttribute("data-srcset") || "").split(",")[0]?.trim().split(/\s+/)[0] ||
    img.getAttribute("src");
  return resolve(raw, pageUrl);
}

function extractItems(items: Element[], pageUrl: string): { columns: DataColumn[]; rows: string[][]; regular: number } {
  const names = new Map<string, string>();
  const order: string[] = [];
  const rowMaps: Map<string, string>[] = [];
  for (const item of items.slice(0, MAX_ROWS)) {
    const values = new Map<string, string>();
    const add = (key: string, name: string, value: string | undefined) => {
      if (!value) return;
      if (!names.has(key)) {
        if (names.size >= MAX_COLS * 2) return;
        names.set(key, name);
        order.push(key);
      }
      const prev = values.get(key);
      values.set(key, prev ? `${prev} ${value}` : value);
    };
    const walk = (el: Element, path: string) => {
      const tag = el.localName;
      if (SKIP_IN_ITEM.has(tag)) return;
      if (tag === "img") {
        add(`${path}@src`, label(el), imgSrc(el, pageUrl));
        return;
      }
      if (tag === "a") add(`${path}@href`, `${label(el)} URL`, resolve(el.getAttribute("href"), pageUrl));
      let own = "";
      for (const node of el.childNodes) if (node.nodeType === 3) own += node.textContent;
      add(path, label(el), clean(own) || undefined);
      for (const child of el.children) walk(child, `${path}/${step(child)}`);
    };
    walk(item, step(item));
    rowMaps.push(values);
  }
  // Drop columns that only a few items have (stray badges, one-off notes).
  const minFill = Math.max(1, Math.ceil(rowMaps.length * 0.1));
  const counts = order.map((k) => rowMaps.filter((m) => m.has(k)).length);
  const keep = order.filter((_, i) => counts[i] >= minFill).slice(0, MAX_COLS);
  const regular = order.filter((_, i) => counts[i] >= rowMaps.length * 0.5).length;
  const colNames = uniqueNames(keep.map((k) => names.get(k)!));
  return {
    columns: keep.map((key, i) => ({ key, name: colNames[i] })),
    rows: rowMaps.map((m) => keep.map((k) => m.get(k) ?? "")),
    regular,
  };
}

/** How many data points an item has (text spots, links, images), capped: a cheap first ranking. */
function cheapFields(item: Element): number {
  let n = 0;
  let seen = 0;
  for (const el of [item, ...item.querySelectorAll("*")]) {
    if (++seen > 300 || n >= 30) break;
    if (el.localName === "img" || el.localName === "a") n++;
    else for (const node of el.childNodes) if (node.nodeType === 3 && node.textContent!.trim()) { n++; break; }
  }
  return n;
}

const NOT_LIST_CONTAINER =
  /^(table|thead|tbody|tfoot|tr|select|head|svg|picture|video|audio|datalist|optgroup|colgroup|ruby|math|script|style|template)$/;
const NOT_LIST_ITEM = /^(script|style|template|br|hr|input|option|link|meta|source|track)$/;

export function findLists(doc: Document, pageUrl: string): DataTable[] {
  const body = doc.body;
  if (!body) return [];
  type Cand = { container: Element; items: Element[]; cheap: number };
  const cands: Cand[] = [];
  for (const el of body.querySelectorAll("*")) {
    if (el.children.length < 3 || NOT_LIST_CONTAINER.test(el.localName)) continue;
    if (el.closest("nav, header, footer, aside, [role=navigation], [role=menu], [role=menubar], [role=tablist]")) continue;
    const groups = new Map<string, Element[]>();
    for (const c of el.children) {
      if (NOT_LIST_ITEM.test(c.localName)) continue;
      const key = itemSig(c);
      const g = groups.get(key);
      if (g) g.push(c);
      else groups.set(key, [c]);
    }
    for (const items of groups.values()) {
      if (items.length < 3) continue;
      const filled = items.filter((i) => clean(i.textContent).length >= 2 || i.querySelector("img")).length;
      if (filled < 3) continue;
      const sample = items.slice(0, 5);
      const fields = sample.reduce((a, i) => a + cheapFields(i), 0) / sample.length;
      cands.push({ container: el, items, cheap: filled * (1 + Math.min(10, fields)) });
    }
  }

  const scored = cands
    .sort((a, b) => b.cheap - a.cheap)
    .slice(0, 30)
    .map((c) => {
      const data = extractItems(c.items, pageUrl);
      return { ...c, data, score: c.items.length * (1 + Math.min(10, data.regular)) };
    })
    .filter((c) => c.data.regular > 0 && c.data.columns.length > 0)
    .sort((a, b) => b.score - a.score);

  const chosen: typeof scored = [];
  for (const c of scored) {
    if (chosen.length >= MAX_LISTS) break;
    // One list per structure: skip lists inside a chosen list's items, and coarser lists around a chosen one.
    const overlaps = chosen.some(
      (k) => k.items.some((i) => i.contains(c.container)) || c.items.some((i) => i.contains(k.container)),
    );
    if (!overlaps) chosen.push(c);
  }
  return chosen.map((c, i) => ({
    kind: "list" as const,
    title: nearbyHeading(c.container) || clean(c.container.getAttribute("aria-label")) || `List ${i + 1}`,
    signature: `list:${itemSig(c.container)}>${itemSig(c.items[0])}`,
    columns: c.data.columns,
    rows: c.data.rows,
  }));
}

// ---------- files ----------

const FILE_EXT =
  /\.(pdf|docx?|xlsx?|xlsm|pptx?|csv|tsv|txt|rtf|odt|ods|odp|zip|7z|rar|gz|tgz|tar|json|epub|mp3|wav|m4a|mp4|mov|avi|webm|mkv|dmg|exe|msi|apk|iso)$/i;

/** The file extension when a URL points at a downloadable document or media file, not a web page. */
export function fileExt(url: string): string | undefined {
  try {
    return new URL(url).pathname.match(FILE_EXT)?.[1]?.toLowerCase();
  } catch {
    return undefined;
  }
}

export function findFiles(links: { url: string; text: string }[]): FileLink[] {
  return links.flatMap((l) => {
    const ext = fileExt(l.url);
    return ext ? [{ url: l.url, text: l.text, ext }] : [];
  });
}

// ---------- structured metadata ----------

const SKIP_META = /^(viewport|theme-color|robots|googlebot|google|msapplication|apple|format-detection|referrer|csrf|generator|color-scheme|mobile|handheld|verify|.*verification)/i;

/**
 * Field id → value for the page's meta tags ("meta:og:title"), schema.org JSON-LD
 * ("ld:Product.offers.price") and microdata ("itemprop:name"). Run before scripts are stripped.
 */
export function findMeta(doc: Document, pageUrl: string): Record<string, string> {
  const out: Record<string, string> = {};
  const set = (k: string, v: unknown) => {
    const s = clean(String(v ?? ""));
    if (s && !(k in out) && Object.keys(out).length < 120) out[k] = s.slice(0, 2000);
  };

  for (const m of doc.querySelectorAll("meta[content]")) {
    const k = m.getAttribute("property") || m.getAttribute("name") || m.getAttribute("itemprop");
    if (k && !SKIP_META.test(k)) set(`meta:${k}`, m.getAttribute("content"));
  }

  const flatten = (v: unknown, prefix: string, depth: number) => {
    if (v == null) return;
    if (typeof v !== "object") return set(`ld:${prefix}`, v);
    if (Array.isArray(v)) {
      if (v.every((x) => typeof x !== "object")) set(`ld:${prefix}`, v.join("; "));
      else flatten(v[0], prefix, depth);
      return;
    }
    if (depth > 3) return;
    for (const [k, val] of Object.entries(v)) {
      if (k.startsWith("@")) continue;
      flatten(val, `${prefix}.${k}`, depth + 1);
    }
  };
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
    let data: unknown;
    try {
      data = JSON.parse(s.textContent ?? "");
    } catch {
      continue;
    }
    const objs = (Array.isArray(data) ? data : [data]).flatMap((d) =>
      d && typeof d === "object" && Array.isArray((d as Record<string, unknown>)["@graph"])
        ? ((d as Record<string, unknown>)["@graph"] as unknown[])
        : [d],
    );
    for (const o of objs) {
      if (!o || typeof o !== "object") continue;
      const t = (o as Record<string, unknown>)["@type"];
      flatten(o, String(Array.isArray(t) ? t[0] : t || "Thing"), 0);
    }
  }

  for (const el of doc.querySelectorAll("[itemprop]")) {
    if (el.localName === "meta") continue;
    const k = el.getAttribute("itemprop")!.split(/\s+/)[0];
    const v =
      el.getAttribute("content") ||
      (el.localName === "a" || el.localName === "link" ? resolve(el.getAttribute("href"), pageUrl) : undefined) ||
      (el.localName === "img" ? imgSrc(el, pageUrl) : undefined) ||
      (el.localName === "time" ? el.getAttribute("datetime") : undefined) ||
      (el.children.length <= 3 ? el.textContent : "");
    set(`itemprop:${k}`, v);
  }
  return out;
}

/** A readable name for a field id: "ld:Product.offers.price" → "Product › offers › price". */
export function fieldLabel(id: string): string {
  const [kind, ...rest] = id.split(":");
  const name = rest.join(":");
  if (kind === "ld") return name.split(".").join(" › ");
  return name;
}

// ---------- pagination ----------

const NEXT_WORDS = /^(next|next page|next ›|next »|next >|next →|older posts|older entries|more results|weiter|suivant|siguiente|volgende|avanti)$/i;
const NEXT_SYMBOLS = /^(›|»|>|→|>>|⟩|›|▶|▸)$/;
const PAGINATION = '[class*="pagination" i], [class*="pager" i], [class*="paging" i], nav[aria-label*="pag" i], [role=navigation][aria-label*="pag" i]';

/** The address of the next page of a paginated list or article, if the page links to one on the same site. */
export function findNextPage(doc: Document, pageUrl: string): string | undefined {
  const here = noHash(pageUrl);
  const host = new URL(pageUrl).hostname;
  const ok = (href: string | null) => {
    const u = resolve(href, pageUrl);
    if (!u) return undefined;
    const s = noHash(u);
    return s !== here && new URL(s).hostname === host ? s : undefined;
  };
  for (const el of doc.querySelectorAll('link[rel~="next" i][href], a[rel~="next" i][href]')) {
    const u = ok(el.getAttribute("href"));
    if (u) return u;
  }
  for (const a of doc.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    if (a.getAttribute("aria-disabled") === "true" || /\bdisabled\b/i.test(a.className)) continue;
    const text = clean(a.textContent);
    const aria = clean(a.getAttribute("aria-label") || a.getAttribute("title"));
    const inPager = !!a.closest(PAGINATION);
    const isNext =
      NEXT_WORDS.test(text) ||
      /^(go to )?next( page)?$/i.test(aria) ||
      (inPager && (NEXT_SYMBOLS.test(text) || /\bnext\b/i.test(`${a.className} ${aria} ${a.parentElement?.className ?? ""}`)));
    if (!isNext) continue;
    const u = ok(a.getAttribute("href"));
    if (u) return u;
  }
  return undefined;
}

// ---------- sheets ----------

export interface SheetSource {
  table: DataTable;
  pageUrl: string;
}

/**
 * One sheet from one or more same-layout tables or lists, with the column choices applied.
 * Rows from more than one page get a "Page URL" column.
 */
export function toSheet(group: SheetSource[], prefs: Record<string, ColumnPref>, name?: string): Sheet {
  const keys: string[] = [];
  const names = new Map<string, string>();
  for (const { table } of group) {
    const pref = prefs[table.signature];
    for (const c of table.columns) {
      if (pref?.hidden.includes(c.key) || names.has(c.key)) continue;
      keys.push(c.key);
      names.set(c.key, pref?.names[c.key] || c.name);
    }
  }
  const multi = new Set(group.map((g) => g.pageUrl)).size > 1;
  const header = uniqueNames([...keys.map((k) => names.get(k)!), ...(multi ? ["Page URL"] : [])]);
  const rows = group.flatMap(({ table, pageUrl }) => {
    const idx = new Map(table.columns.map((c, i) => [c.key, i]));
    return table.rows.map((r) => [
      ...keys.map((k) => (idx.has(k) ? (r[idx.get(k)!] ?? "") : "")),
      ...(multi ? [pageUrl] : []),
    ]);
  });
  return { name: name || group[0]?.table.title || "Sheet", header, rows };
}

/** Group sources into sheets: same-layout ones merged into one sheet when `merge` is on. */
export function toSheets(sources: SheetSource[], prefs: Record<string, ColumnPref>, merge: boolean): Sheet[] {
  const groups = new Map<string, SheetSource[]>();
  sources.forEach((s, i) => {
    const key = merge ? s.table.signature : String(i);
    const g = groups.get(key);
    if (g) g.push(s);
    else groups.set(key, [s]);
  });
  return [...groups.values()].map((g) => toSheet(g, prefs));
}

/** CSV with a UTF-8 BOM (so Excel reads accents correctly). Cells that look like formulas are defused. */
export function toCsv(sheet: Sheet): string {
  const cell = (v: string) => {
    let s = v ?? "";
    if (/^[=+@\t\r]/.test(s) || (/^-/.test(s) && !/^-\d+([.,]\d+)?$/.test(s))) s = `'${s}`;
    return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [sheet.header, ...sheet.rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
