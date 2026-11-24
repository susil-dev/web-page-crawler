import type { PageRecord } from "./db";
import { extensionFor, imageBlob } from "./images";

/**
 * Render a saved page as a standalone Markdown file with YAML front matter.
 * `localImages` maps image URLs to relative file paths, for downloads that include the image files.
 */
export function toMarkdown(rec: PageRecord, localImages = new Map<string, string>()): string {
  const images = rec.images ?? [];
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
    parts.push(`## Images\n\n${rows.join("\n")}`);
  }
  parts.push(`## Content\n\n${content}`);
  return parts.join("\n\n") + "\n";
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
export async function downloadPage(rec: PageRecord, withImages: boolean, maxBytes: number): Promise<void> {
  const mdPath = fileName(rec);
  const local = new Map<string, string>();
  if (withImages) {
    const folder = `${slug(rec.title)}_files`;
    const dir = mdPath.replace(/[^/]+$/, folder);
    let n = 0;
    for (const img of rec.images ?? []) {
      const file = await imageBlob(img.src, maxBytes);
      if (!file) continue;
      const name = `${String(++n).padStart(2, "0")}.${extensionFor(file.type, img.src)}`;
      await downloadBlob(`${dir}/${name}`, file.blob, "overwrite");
      local.set(img.src, `${folder}/${name}`);
    }
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
