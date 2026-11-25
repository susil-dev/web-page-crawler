import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import type { TitleSource } from "./settings";
import { findFiles, findLists, findMeta, findNextPage, findTables, type DataTable, type FileLink } from "./resources";

export interface LinkInfo {
  url: string;
  text: string;
}

/** Details about one image in a page's main content. The file itself is stored separately (see images.ts). */
export interface ImageInfo {
  src: string;
  alt: string;
  title?: string;
  /** Text of the enclosing <figure>'s <figcaption>, if any. */
  caption?: string;
  width?: number;
  height?: number;
}

export interface ParsedPage {
  url: string;
  /** How the HTML was obtained: a plain fetch, or a browser tab after JavaScript ran. Set by the caller. */
  loadedVia?: "fetch" | "tab" | "live";
  /** The page's <link rel="canonical"> address, if it declares one. */
  canonical: string;
  /** The name used everywhere, picked from the candidates below by the titleSource setting. */
  title: string;
  docTitle: string;
  heading: string;
  ogTitle: string;
  description: string;
  /** h1–h3 outside nav/header/footer: the "topics" preview. */
  headings: string[];
  excerpt: string;
  markdown: string;
  wordCount: number;
  links: LinkInfo[];
  images: ImageInfo[];
  /** Data tables (<table>) with a header and rows. */
  tables: DataTable[];
  /** Repeating items (cards, results, entries) turned into rows and columns. */
  lists: DataTable[];
  /** Links to documents and media files (PDF, Office, CSV, ZIP, …). */
  files: FileLink[];
  /** Structured fields: meta tags, schema.org JSON-LD, microdata. See resources.ts findMeta. */
  meta: Record<string, string>;
  /** The next page of a paginated list or article, when the page links to one. */
  nextUrl?: string;
  /** The page's HTML without scripts and styles, kept in memory (not saved) for custom fields. */
  html: string;
}

const MAX_IMAGES = 60;

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});
turndown.remove(["script", "style", "noscript", "iframe"]);

/** Parse raw HTML (from fetch or from a live tab) into structured page data. */
export function parseHtml(html: string, url: string, titleSource: TitleSource = "document"): ParsedPage {
  const doc = new DOMParser().parseFromString(html, "text/html");

  // Make relative links and images resolve against the page, not the extension.
  doc.querySelectorAll("base").forEach((b) => b.remove());
  const base = doc.createElement("base");
  base.href = url;
  doc.head.prepend(base);

  const links = collectLinks(doc, url);
  const headings = collectHeadings(doc);
  const docTitle = clean(doc.title);
  const heading = clean(doc.querySelector("h1")?.textContent);
  const ogTitle = meta(doc, 'meta[property="og:title"]');
  const description = meta(doc, 'meta[name="description"]') || meta(doc, 'meta[property="og:description"]');
  const structured = findMeta(doc, url); // before scripts are removed: JSON-LD lives in <script> tags
  const nextUrl = findNextPage(doc, url);

  // Readability mutates the document, so give it a copy.
  const parsed = new Readability(doc.cloneNode(true) as Document).parse();
  // Readability looks for one "article". On app-style pages (dashboards, record views, forms) it can
  // pick a small fragment or nothing, so fall back to the whole body when it kept too little of the text.
  const body = cleanBody(doc);
  const bodyText = (body?.textContent ?? "").trim();
  const articleWords = wordCount(parsed?.textContent ?? "");
  const article = parsed && (articleWords >= 150 || articleWords >= wordCount(bodyText) * 0.4) ? parsed : null;
  const contentHtml = article?.content || body?.innerHTML || "";
  const markdown = turndown.turndown(contentHtml).trim();
  const text = (article?.textContent || bodyText).trim();

  // Images from the main content (Readability drops logos, icons and nav chrome),
  // falling back to the whole body when Readability found no article.
  const contentDoc = article?.content ? new DOMParser().parseFromString(article.content, "text/html") : doc;
  const images = collectImages(contentDoc, url);
  const ogImage = meta(doc, 'meta[property="og:image"]');
  if (ogImage && images.length < MAX_IMAGES) {
    const src = resolve(ogImage, url);
    if (src && !images.some((i) => i.src === src)) images.unshift({ src, alt: "Share image (og:image)" });
  }

  const canonicalHref = doc.querySelector('link[rel~="canonical"]')?.getAttribute("href");
  const canonical = canonicalHref ? resolve(canonicalHref, url) : undefined;

  const tables = findTables(doc);
  const lists = findLists(doc, url);
  doc.querySelectorAll("script, style, noscript, template, svg, link[rel=stylesheet]").forEach((e) => e.remove());
  const cleanedHtml = doc.documentElement.outerHTML;

  return {
    url,
    canonical: canonical ? stripHash(canonical) : "",
    title: pickTitle(titleSource, { docTitle, heading, ogTitle }) || url,
    docTitle,
    heading,
    ogTitle,
    description,
    headings,
    excerpt: (article?.excerpt || description || text.slice(0, 280)).trim(),
    markdown,
    wordCount: wordCount(text),
    links,
    images,
    tables,
    lists,
    files: findFiles(links),
    meta: structured,
    nextUrl,
    html: cleanedHtml,
  };
}

/** The chosen title, falling back to the other candidates when the page doesn't have it. */
export function pickTitle(source: TitleSource, t: { docTitle: string; heading: string; ogTitle: string }): string {
  const order = {
    document: [t.docTitle, t.heading, t.ogTitle],
    heading: [t.heading, t.docTitle, t.ogTitle],
    og: [t.ogTitle, t.docTitle, t.heading],
  }[source];
  return order.find(Boolean) ?? "";
}

function wordCount(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** A copy of <body> without scripts, styles and site chrome, for when Readability's pick is too thin. */
function cleanBody(doc: Document): HTMLElement | undefined {
  const body = doc.body?.cloneNode(true) as HTMLElement | undefined;
  body?.querySelectorAll("script, style, noscript, template, nav, header, footer, [aria-hidden=true]").forEach((e) => e.remove());
  return body;
}

function clean(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

function meta(doc: Document, selector: string): string {
  return clean(doc.querySelector(selector)?.getAttribute("content"));
}

function resolve(href: string, pageUrl: string): string | undefined {
  try {
    const u = new URL(href, pageUrl);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : undefined;
  } catch {
    return undefined;
  }
}

function collectHeadings(doc: Document): string[] {
  const root = doc.querySelector("main, article, [role=main]") ?? doc.body;
  if (!root) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const el of root.querySelectorAll("h1, h2, h3")) {
    if (el.closest("nav, header, footer, aside")) continue;
    const text = clean(el.textContent);
    if (!text || text.length > 140 || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push(text);
    if (out.length >= 15) break;
  }
  return out;
}

function collectImages(doc: Document, pageUrl: string): ImageInfo[] {
  const out: ImageInfo[] = [];
  const seen = new Set<string>();
  for (const img of doc.querySelectorAll<HTMLImageElement>("img")) {
    if (img.closest("nav, header, footer")) continue;
    // Lazy-loaded images keep the real URL in data-* attributes or srcset.
    const raw =
      img.getAttribute("data-src") ||
      img.getAttribute("data-lazy-src") ||
      largestFromSrcset(img.getAttribute("srcset") || img.getAttribute("data-srcset")) ||
      img.getAttribute("src");
    const src = raw ? resolve(raw, pageUrl) : undefined; // skips data: URIs
    if (!src || seen.has(src)) continue;
    const width = Number(img.getAttribute("width")) || undefined;
    const height = Number(img.getAttribute("height")) || undefined;
    if ((width && width < 48) || (height && height < 48)) continue; // icons, spacers, tracking pixels
    seen.add(src);
    const caption = clean(img.closest("figure")?.querySelector("figcaption")?.textContent);
    out.push({
      src,
      alt: clean(img.getAttribute("alt")),
      ...(img.title ? { title: clean(img.title) } : {}),
      ...(caption ? { caption } : {}),
      ...(width ? { width } : {}),
      ...(height ? { height } : {}),
    });
    if (out.length >= MAX_IMAGES) break;
  }
  return out;
}

function largestFromSrcset(srcset: string | null): string | undefined {
  if (!srcset) return undefined;
  let best: { url: string; size: number } | undefined;
  for (const part of srcset.split(",")) {
    const [url, descriptor = "1x"] = part.trim().split(/\s+/);
    const size = parseFloat(descriptor) || 1;
    if (url && (!best || size > best.size)) best = { url, size };
  }
  return best?.url;
}

function collectLinks(doc: Document, pageUrl: string): LinkInfo[] {
  const self = stripHash(pageUrl);
  const byUrl = new Map<string, LinkInfo>();
  for (const a of doc.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const resolved = resolve(a.getAttribute("href")!, pageUrl);
    if (!resolved) continue;
    const url = stripHash(resolved);
    if (url === self) continue;
    const text = clean(a.textContent || a.title || a.getAttribute("aria-label"));
    const existing = byUrl.get(url);
    // Keep the most descriptive anchor text when a URL is linked several times.
    if (!existing || text.length > existing.text.length) byUrl.set(url, { url, text });
  }
  return [...byUrl.values()];
}

export function stripHash(url: string): string {
  const u = new URL(url);
  u.hash = "";
  return u.href;
}
