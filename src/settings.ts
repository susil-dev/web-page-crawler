/** Which part of a page names it in the tree, the library and downloaded file names. */
export type TitleSource = "document" | "heading" | "og";

/** How crawled pages are loaded. */
export type LoadMode = "auto" | "fetch" | "tab";

export interface Settings {
  apiKey: string;
  model: string;
  maxPages: number;
  concurrency: number;
  sameDomainOnly: boolean;
  /** Link hops from the starting page. 1 = only the links on the starting page. */
  maxDepth: number;
  titleSource: TitleSource;
  loadMode: LoadMode;
  /** Store image files (not just their details) when saving, and write them next to downloaded .md files. */
  saveImageFiles: boolean;
  /** Images larger than this are skipped when storing files. */
  maxImageKB: number;
  /** Follow "Next page" links, at the same depth, up to this many extra pages per list. */
  followPagination: boolean;
  maxNextPages: number;
  /** Infinite scroll for pages read in a browser tab: scroll to the bottom up to this many times. */
  scrollTimes: number;
  /** While scrolling, press "Load more" / "Show more" buttons. */
  clickLoadMore: boolean;
  /** Export same-layout tables and lists (e.g. one per page of results) as one sheet. */
  mergeSimilar: boolean;
  /** Notion integration token (secret_… or ntn_…) and the page exports are created under. */
  notionToken: string;
  notionParent: string;
}

export const MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5 (best quality)" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (balanced)" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 (cheapest, fastest)" },
];

export const TITLE_SOURCES: { id: TitleSource; label: string }[] = [
  { id: "document", label: "Document title (the browser tab's <title>)" },
  { id: "heading", label: "Page heading (the first <h1> on the page)" },
  { id: "og", label: "Share title (og:title, used by social previews)" },
];

export const LOAD_MODES: { id: LoadMode; label: string }[] = [
  { id: "auto", label: "Automatic: fetch, and use a browser tab when the result is empty or needs sign-in" },
  { id: "fetch", label: "Fetch only (fastest; no JavaScript)" },
  { id: "tab", label: "Always a browser tab (slowest; sees everything you see)" },
];

export const MAX_DEPTH = 5;

export const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  model: "claude-opus-5-5",
  maxPages: 50,
  concurrency: 4,
  sameDomainOnly: true,
  maxDepth: 1,
  titleSource: "document",
  loadMode: "auto",
  saveImageFiles: false,
  maxImageKB: 2048,
  followPagination: true,
  maxNextPages: 5,
  scrollTimes: 0,
  clickLoadMore: false,
  mergeSimilar: true,
  notionToken: "",
  notionParent: "",
};

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(stored.settings ?? {}) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ settings });
}

