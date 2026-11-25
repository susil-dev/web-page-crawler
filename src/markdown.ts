import type { PageRecord } from "./db";
import { extensionFor, fileBlob, imageBlob } from "./images";
import type { DataTable } from "./resources";

/**
 * Render a saved page as a standalone Markdown file with YAML front matter.
 * `localImages` maps image URLs to relative file paths, for downloads that include the image files.
 */
export function toMarkdown(rec: PageRecord, localImages = new Map<string, string>()): string {
  const picked = rec.picked;
  // When images were picked, the page lists those; otherwise every image found.
  const images = picked?.images.length ? (rec.images ?? []).filter((i) => picked.images.includes(i.src)) : (rec.images ?? []);
  const pickedFiles = (rec.files ?? []).filter((f) => picked?.files.includes(f.url));
  const fm = [
    "---",
    `title: ${yaml(rec.title)}`,
    `url: ${yaml(rec.url)}`,
    `site: ${yaml(new URL(rec.url).hostname)}`,
    rec.aliases?.length ? `aliases:\n${rec.aliases.map((a) => `  - ${yaml(a)}`).join("\n")}` : null,
    rec.sourceUrl ? `source_url: ${yaml(rec.sourceUrl)}` : null,
    rec.sourceTitle ? `source_title: ${yaml(rec.sourceTitle)}` : null,
    rec.parentUrl ? `parent_url: ${yaml(rec.parentUrl)}` : null,
    rec.parentTitle ? `parent_title: ${yaml(rec.parentTitle)}` : null,
    rec.depth !== undefined ? `depth: ${rec.depth}` : null,
    `crawled: ${rec.crawledAt}`,
    `saved: ${rec.savedAt}`,
    rec.summarizedAt ? `summarized: ${rec.summarizedAt}` : null,
    rec.summaryModel ? `summary_model: ${rec.summaryModel}` : null,
    `words: ${rec.wordCount}`,
    images.length ? `images: ${images.length}` : null,
    picked?.images.length ? `picked_images: ${picked.images.length}` : null,
    pickedFiles.length ? `picked_files: ${pickedFiles.length}` : null,
    rec.tables?.length ? `tables: ${rec.tables.length}` : null,
    "---",
  ].filter(Boolean);

  const local = (src: string) => localImages.get(src) ?? src;
  let content = rec.markdown;
  for (const [src, path] of localImages) content = content.split(`](${src}`).join(`](${path}`);

  const parts = [fm.join("\n"), `# ${rec.title}`, `**URL:** <${rec.url}>`];
  if (rec.description) parts.push(`> ${rec.description}`);
  if (rec.summary) parts.push(`## Summary\n\n${rec.summary}`);
  if (rec.headings.length) parts.push(`## Topics\n\n${rec.headings.map((h) => `- ${h}`).join("\n")}`);
  if (images.length) {
    const rows = images.map((i) => {
      const details = [
        i.caption && `caption: ${i.caption}`,
        i.title && `title: ${i.title}`,
        i.width && i.height && `${i.width}×${i.height}`,
        localImages.has(i.src) && `original: <${i.src}>`,
      ].filter(Boolean);
      return `- ![${mdText(i.alt)}](${local(i.src)})${i.alt ? ` **${mdText(i.alt)}**` : ""}${details.length ? ` — ${details.join(" · ")}` : ""}`;
    });
    parts.push(`## ${picked?.images.length ? "Picked images" : "Images"}\n\n${rows.join("\n")}`);
  }
  if (pickedFiles.length) {
    const rows = pickedFiles.map((f) => {
      const name = f.text || decodeURI(f.url.split("/").pop() || f.url);
      const path = localImages.get(f.url);
      return `- [${mdText(name)}](${path ?? f.url}) (${f.ext.toUpperCase()})${path ? ` — original: <${f.url}>` : ""}`;
    });
    parts.push(`## Picked files\n\n${rows.join("\n")}`);
  }
  parts.push(`## Content\n\n${content}`);
  // Turndown flattens <table>s into plain text, so add the detected tables back as Markdown tables.
  if (rec.tables?.length) parts.push(`## Tables\n\n${rec.tables.map(mdTable).join("\n\n")}`);
  return parts.join("\n\n") + "\n";
}

function mdTable(t: DataTable): string {
  const cell = (v: string) => (v ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ");
  const rows = t.rows.slice(0, 500);
  return [
    `### ${t.title}`,
    "",
    `| ${t.columns.map((c) => cell(c.name)).join(" | ")} |`,
    `| ${t.columns.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${t.columns.map((_, i) => cell(r[i])).join(" | ")} |`),
    ...(t.rows.length > rows.length ? ["", `_First ${rows.length} of ${t.rows.length} rows._`] : []),
  ].join("\n");
}

function yaml(s: string): string {
  return JSON.stringify(s); // a JSON string is valid YAML and escapes quotes/colons safely
}

function mdText(s: string): string {
  return s.replace(/[[\]*_`]/g, "\\$&");
}

export function slug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "page"
  );
}

export function fileName(rec: { url: string; title: string }): string {
  const host = new URL(rec.url).hostname.replace(/^www\./, "");
  return `page-crawler/${host}/${slug(rec.title)}.md`;
}

/**
 * Download a page as .md. With images on, its image files go in a "<name>_files" folder beside it
 * (from the DB, or fetched now if not stored) and the Markdown points at those local copies.
 */
export async function downloadPage(
  rec: PageRecord,
  withImages: boolean,
  maxBytes: number,
  /** Called before each image; throw from it to stop. */
  onImage?: (done: number, total: number) => void,
): Promise<void> {
  const mdPath = fileName(rec);
  const local = new Map<string, string>();
  const folder = `${slug(rec.title)}_files`;
  const dir = mdPath.replace(/[^/]+$/, folder);
  // Picked images are always written; the rest only with "Keep image files" on.
  const pickedImgs = rec.picked?.images ?? [];
  const images = (rec.images ?? []).filter((i) => pickedImgs.includes(i.src) || (withImages && !pickedImgs.length));
  const files = (rec.files ?? []).filter((f) => rec.picked?.files.includes(f.url));
  const total = images.length + files.length;
  let n = 0;
  for (const img of images) {
    onImage?.(n, total);
    const file = await imageBlob(img.src, maxBytes);
    if (!file) continue;
    const name = `${String(++n).padStart(2, "0")}.${extensionFor(file.type, img.src)}`;
    await downloadBlob(`${dir}/${name}`, file.blob, "overwrite");
    local.set(img.src, `${folder}/${name}`);
  }
  for (const f of files) {
    onImage?.(n, total);
    const file = await fileBlob(f.url);
    if (!file) continue;
    n++;
    const raw = new URL(f.url).pathname.split("/").pop() || "";
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      /* keep it encoded */
    }
    const base = (decoded || `file.${f.ext}`).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
    await downloadBlob(`${dir}/${base}`, file.blob, "overwrite");
    local.set(f.url, `${folder}/${base}`);
  }
  await downloadText(mdPath, toMarkdown(rec, local));
}

export async function downloadText(filename: string, text: string, mime = "text/markdown"): Promise<void> {
  await downloadBlob(filename, new Blob([text], { type: `${mime};charset=utf-8` }));
}

export async function downloadBlob(
  filename: string,
  blob: Blob,
  conflictAction: chrome.downloads.FilenameConflictAction = "uniquify",
): Promise<void> {
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({ url, filename, conflictAction });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
