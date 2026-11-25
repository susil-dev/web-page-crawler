// Send pages and tables to Notion through its public API, with the user's own integration token.
// Crawled pages become sub-pages of the chosen Notion page; tables and lists become databases there.
// The token is stored in this extension's local storage and sent only to api.notion.com.

import type { Sheet } from "./resources";
import { uniqueNames } from "./resources";

const API = "https://api.notion.com/v1";
const VERSION = "2022-06-28";

type Json = Record<string, unknown>;
type RichText = Json;
type Block = Json;

export interface NotionTarget {
  token: string;
  /** The page everything is created under (an ID or a link to it). */
  parent: string;
}

/** The page ID inside a Notion link ("…/My-Page-1a2b…") or a pasted ID, dashed or not. */
export function parentId(input: string): string {
  const hex = input.replace(/-/g, "").match(/[0-9a-f]{32}(?![0-9a-f])/gi);
  const id = hex?.[hex.length - 1];
  if (!id) throw new Error("Set the Notion parent page in Settings (paste a link to the page).");
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`.toLowerCase();
}

export function checkTarget(t: NotionTarget): void {
  if (!t.token.trim()) throw new Error("Add your Notion integration token in Settings first.");
  parentId(t.parent);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastCall = 0;

/** One API call. Spaced to stay under Notion's ~3 requests/second, retried on rate limits and outages. */
async function call<T = Json>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const wait = lastCall + 350 - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    const res = await fetch(API + path, {
      method,
      headers: { Authorization: `Bearer ${token.trim()}`, "Notion-Version": VERSION, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await sleep((Number(res.headers.get("retry-after")) || 2 ** attempt) * 1000);
      continue;
    }
    const data = (await res.json().catch(() => ({}))) as Json;
    if (res.ok) return data as T;
    if (res.status === 401) throw new Error("Notion rejected the integration token. Check it in Settings.");
    if (res.status === 404 || data.code === "object_not_found")
      throw new NotionError(
        404,
        "object_not_found",
        "it can't see the parent page. In Notion, open that page → ••• → Connections → add your integration. " +
          "The integration must be in the same workspace as the page. Settings → Notion → Test connection shows which workspace it's in.",
      );
    throw new NotionError(res.status, String(data.code ?? ""), String(data.message ?? res.statusText));
  }
}

export class NotionError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(`Notion: ${message}`);
  }
}

// ---------- rich text ----------

const LIMIT = 2000; // characters per rich-text item
const unescape = (s: string) => s.replace(/\\([\\`*_{}[\]()#+\-.!>|~])/g, "$1");
const isHttp = (u: string) => /^https?:\/\//i.test(u);

function textItems(content: string, annotations?: Json, link?: string): RichText[] {
  const out: RichText[] = [];
  for (let i = 0; i < content.length; i += LIMIT) {
    out.push({
      type: "text",
      text: { content: content.slice(i, i + LIMIT), ...(link ? { link: { url: link } } : {}) },
      ...(annotations ? { annotations } : {}),
    });
  }
  return out;
}

/** Plain text, split into Notion-sized pieces. */
export function plain(text: string): RichText[] {
  return textItems(text).slice(0, 100);
}

const INLINE =
  /!\[([^\]]*)\]\(([^)\s]+)[^)]*\)|\[([^\]]*)\]\(([^)\s]+)[^)]*\)|\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|\*([^*\s][^*]*)\*|(?<![\w])_([^_\s][^_]*)_(?![\w])/g;

/** Markdown inline formatting (bold, italic, code, links) as Notion rich text. */
function richText(md: string): RichText[] {
  const out: RichText[] = [];
  let last = 0;
  for (const m of md.matchAll(INLINE)) {
    if (m.index! > last) out.push(...textItems(unescape(md.slice(last, m.index))));
    const [, imgAlt, imgSrc, linkText, href, bold, bold2, code, italic, italic2] = m;
    if (imgSrc !== undefined) out.push(...textItems(unescape(imgAlt || "image"), undefined, isHttp(imgSrc) ? imgSrc : undefined));
    else if (href !== undefined) out.push(...textItems(unescape(linkText || href), undefined, isHttp(href) ? href : undefined));
    else if (bold ?? bold2) out.push(...textItems(unescape(bold ?? bold2), { bold: true }));
    else if (code !== undefined) out.push(...textItems(code, { code: true }));
    else out.push(...textItems(unescape(italic ?? italic2), { italic: true }));
    last = m.index! + m[0].length;
  }
  if (last < md.length) out.push(...textItems(unescape(md.slice(last))));
  return out.slice(0, 100);
}

// ---------- blocks ----------

const textBlock = (type: string, md: string): Block => ({ type, [type]: { rich_text: richText(md) } });

const LANGS: Record<string, string> = {
  js: "javascript", javascript: "javascript", ts: "typescript", typescript: "typescript", py: "python", python: "python",
  sh: "shell", bash: "bash", shell: "shell", zsh: "shell", json: "json", html: "html", xml: "xml", css: "css", sql: "sql",
  java: "java", c: "c", cpp: "c++", "c++": "c++", cs: "c#", csharp: "c#", go: "go", rust: "rust", rb: "ruby", ruby: "ruby",
  php: "php", yaml: "yaml", yml: "yaml", md: "markdown", markdown: "markdown", kotlin: "kotlin", swift: "swift",
  powershell: "powershell", ps1: "powershell", r: "r", scala: "scala", dockerfile: "docker",
};

/** Turndown's Markdown as Notion blocks: headings, paragraphs, lists, quotes, code, images, dividers. */
export function markdownToBlocks(md: string): Block[] {
  const lines = md.split(/\r?\n/);
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push(textBlock("paragraph", para.join(" ")));
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^\s*```\s*([\w+#-]*)/);
    if (fence) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) code.push(lines[i]);
      out.push({
        type: "code",
        code: { rich_text: plain(code.join("\n")), language: LANGS[fence[1].toLowerCase()] ?? "plain text" },
      });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/))) {
      flush();
      out.push(textBlock(`heading_${Math.min(3, m[1].length)}`, m[2]));
    } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush();
      out.push({ type: "divider", divider: {} });
    } else if ((m = line.match(/^\s*!\[([^\]]*)\]\((https?:[^)\s]+)[^)]*\)\s*$/))) {
      flush();
      out.push({
        type: "image",
        image: { type: "external", external: { url: m[2] }, ...(m[1] ? { caption: plain(m[1]) } : {}) },
      });
    } else if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) {
      flush();
      out.push(textBlock("bulleted_list_item", m[1]));
    } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      flush();
      out.push(textBlock("numbered_list_item", m[1]));
    } else if ((m = line.match(/^\s*>\s?(.*)$/))) {
      flush();
      out.push(textBlock("quote", m[1]));
    } else {
      para.push(line.trim());
    }
  }
  flush();
  return out;
}

/** A Notion table block (header row + up to 99 rows; Notion takes 100 rows per request). */
export function tableBlock(sheet: Sheet): Block {
  const width = Math.max(1, sheet.header.length);
  const row = (cells: string[]) => ({
    type: "table_row",
    table_row: { cells: Array.from({ length: width }, (_, i) => (cells[i] ? plain(cells[i]) : [])) },
  });
  return {
    type: "table",
    table: {
      table_width: width,
      has_column_header: true,
      has_row_header: false,
      children: [row(sheet.header), ...sheet.rows.slice(0, 99).map(row)],
    },
  };
}

/** Split blocks into requests: at most 100 blocks and ~900 blocks counting nested table rows. */
function chunks(blocks: Block[]): Block[][] {
  const out: Block[][] = [];
  let cur: Block[] = [];
  let weight = 0;
  for (const b of blocks) {
    const w = 1 + (((b.table as Json | undefined)?.children as unknown[] | undefined)?.length ?? 0);
    if (cur.length && (cur.length >= 100 || weight + w > 900)) {
      out.push(cur);
      cur = [];
      weight = 0;
    }
    cur.push(b);
    weight += w;
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Images Notion refuses (unusual URLs) become links instead. */
const imagesAsLinks = (blocks: Block[]): Block[] =>
  blocks.map((b) => {
    if (b.type !== "image") return b;
    const url = ((b.image as Json).external as Json).url as string;
    return { type: "paragraph", paragraph: { rich_text: textItems("🖼 Image", undefined, url) } };
  });

async function append(token: string, blockId: string, blocks: Block[]): Promise<void> {
  for (const chunk of chunks(blocks)) {
    try {
      await call(token, "PATCH", `/blocks/${blockId}/children`, { children: chunk });
    } catch (err) {
      if (!(err instanceof NotionError) || err.status !== 400 || !chunk.some((b) => b.type === "image")) throw err;
      await call(token, "PATCH", `/blocks/${blockId}/children`, { children: imagesAsLinks(chunk) });
    }
  }
}

// ---------- exports ----------

export interface NotionPageInput {
  title: string;
  url: string;
  summary?: string;
  markdown: string;
  tables: Sheet[];
}

/** Create a Notion page for a crawled page: link, summary, content, then its tables. Returns its URL. */
export async function exportPage(t: NotionTarget, p: NotionPageInput): Promise<string> {
  checkTarget(t);
  const blocks: Block[] = [
    { type: "bookmark", bookmark: { url: p.url } },
    ...(p.summary ? [textBlock("heading_2", "Summary"), ...markdownToBlocks(p.summary)] : []),
    ...markdownToBlocks(p.markdown),
  ];
  if (p.tables.length) {
    blocks.push(textBlock("heading_2", "Tables"));
    for (const s of p.tables) {
      blocks.push(textBlock("heading_3", s.name));
      blocks.push(tableBlock(s));
      if (s.rows.length > 99)
        blocks.push(textBlock("paragraph", `_First 99 of ${s.rows.length} rows. Export it as a database for all rows._`));
    }
  }
  const page = await call<{ id: string; url: string }>(t.token, "POST", "/pages", {
    parent: { page_id: parentId(t.parent) },
    properties: { title: { title: plain(p.title.slice(0, LIMIT)) } },
  });
  await append(t.token, page.id, blocks);
  return page.url;
}

/**
 * Create a Notion database from a sheet: the first column is the title, columns whose values are
 * all web addresses become URL properties, the rest text. One request per row. Returns its URL.
 */
export async function exportDatabase(
  t: NotionTarget,
  sheet: Sheet,
  onRow?: (done: number, total: number) => void,
): Promise<string> {
  checkTarget(t);
  const names = uniqueNames(sheet.header.map((h, i) => (i === 0 && !h ? "Name" : h).slice(0, 100)));
  if (!names.length) names.push("Name");
  const types = names.map((_, i) => {
    if (i === 0) return "title";
    const vals = sheet.rows.map((r) => r[i] ?? "").filter(Boolean);
    return vals.length && vals.every((v) => isHttp(v) && v.length <= 2000 && !/\s/.test(v)) ? "url" : "rich_text";
  });
  const db = await call<{ id: string; url: string }>(t.token, "POST", "/databases", {
    parent: { type: "page_id", page_id: parentId(t.parent) },
    title: plain(sheet.name.slice(0, LIMIT)),
    properties: Object.fromEntries(names.map((n, i) => [n, { [types[i]]: {} }])),
  });
  let done = 0;
  for (const row of sheet.rows) {
    const properties: Json = {};
    names.forEach((n, i) => {
      const v = (row[i] ?? "").slice(0, LIMIT);
      properties[n] =
        types[i] === "title" ? { title: plain(v) } : types[i] === "url" ? { url: v || null } : { rich_text: v ? plain(v) : [] };
    });
    await call(t.token, "POST", "/pages", { parent: { database_id: db.id }, properties });
    onRow?.(++done, sheet.rows.length);
  }
  return db.url;
}

/**
 * Check the token and parent page: which integration and workspace the token belongs to, and whether
 * it can open the page. Returns a sentence for Settings; throws with what to fix.
 */
export async function testConnection(t: NotionTarget): Promise<string> {
  checkTarget(t);
  const me = await call<{ name?: string; bot?: { workspace_name?: string } }>(t.token, "GET", "/users/me");
  const who = `Integration “${me.name ?? "unnamed"}”${me.bot?.workspace_name ? ` in workspace “${me.bot.workspace_name}”` : ""}`;
  const id = parentId(t.parent);
  try {
    const page = await call<{ properties?: Record<string, { type?: string; title?: { plain_text?: string }[] }> }>(t.token, "GET", `/pages/${id}`);
    const titleProp = Object.values(page.properties ?? {}).find((p) => p.type === "title");
    const title = titleProp?.title?.map((x) => x.plain_text ?? "").join("") || "Untitled";
    return `Connected. ${who} can see “${title}”: exports will be created there.`;
  } catch (err) {
    if (err instanceof NotionError && err.status === 404)
      throw new Error(
        `${who} can't see page ${id}. Open that page in Notion → ••• → Connections → add “${me.name ?? "your integration"}”. ` +
          `If it isn't listed, the page is in another workspace${me.bot?.workspace_name ? ` (the integration is in “${me.bot.workspace_name}”)` : ""}, ` +
          "or your workspace admin blocks integrations: create the integration in the page's workspace, or pick a page in the integration's workspace.",
      );
    throw err;
  }
}
