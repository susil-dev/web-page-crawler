// Local database: IndexedDB inside the extension. Survives browser restarts;
// cleared only if the extension is removed or its site data is cleared.
//
//   pages   one record per page URL (text, topics, summary, image details, where it was found)
//   images  one record per image URL (the file itself as a Blob), only when "Keep image files" is on

import type { ImageInfo } from "./extract";
import type { DataTable, FileLink } from "./resources";

export interface Picked {
  images: string[];
  files: string[];
  /** Indexes into `tables` and `lists`. */
  tables: number[];
  lists: number[];
}

export interface PageRecord {
  url: string;
  title: string;
  description: string;
  headings: string[];
  excerpt: string;
  markdown: string;
  wordCount: number;
  /** The page the crawl started from. */
  sourceUrl?: string;
  sourceTitle?: string;
  /** The page whose link led here (absent for the starting page). */
  parentUrl?: string;
  parentTitle?: string;
  /** Link hops from the starting page: 0 = the starting page. */
  depth?: number;
  /** Other addresses found during the crawl that turned out to be this same page. */
  aliases?: string[];
  images?: ImageInfo[];
  /** Detected data tables and repeating lists, as rows and columns. */
  tables?: DataTable[];
  lists?: DataTable[];
  /** Links to documents and media files found on the page. */
  files?: FileLink[];
  /** Structured fields: meta tags, schema.org JSON-LD, microdata. */
  meta?: Record<string, string>;
  /**
   * What was picked on the page when it was saved (the resource tags in the crawl tree, or single items
   * on the Data / Media tabs). Picked image and file contents are stored in the `images` store, and
   * downloads and exports of the page include them.
   */
  picked?: Picked;
  crawledAt: string;
  savedAt: string;
  summary?: string;
  summaryModel?: string;
  summarizedAt?: string;
}

export interface ImageRecord {
  url: string;
  type: string;
  size: number;
  blob: Blob;
  fetchedAt: string;
}

const DB_NAME = "page-crawler";
const PAGES = "pages";
const IMAGES = "images";

let dbPromise: Promise<IDBDatabase> | undefined;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PAGES)) {
        db.createObjectStore(PAGES, { keyPath: "url" }).createIndex("savedAt", "savedAt");
      }
      if (!db.objectStoreNames.contains(IMAGES)) db.createObjectStore(IMAGES, { keyPath: "url" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const req = fn(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
  });
}

export const putPage = (rec: PageRecord) => run(PAGES, "readwrite", (s) => s.put(rec)).then(() => undefined);
export const getPage = (url: string) => run<PageRecord | undefined>(PAGES, "readonly", (s) => s.get(url));

export async function listPages(): Promise<PageRecord[]> {
  const all = await run<PageRecord[]>(PAGES, "readonly", (s) => s.getAll());
  return all.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/** Delete a page, then any stored image files no remaining page refers to. */
export async function deletePage(url: string): Promise<void> {
  await run(PAGES, "readwrite", (s) => s.delete(url));
  const inUse = new Set((await listPages()).flatMap((p) => (p.images ?? []).map((i) => i.src)));
  const stored = (await run<IDBValidKey[]>(IMAGES, "readonly", (s) => s.getAllKeys())) as string[];
  for (const key of stored) if (!inUse.has(key)) await run(IMAGES, "readwrite", (s) => s.delete(key));
}

export const putImage = (rec: ImageRecord) => run(IMAGES, "readwrite", (s) => s.put(rec)).then(() => undefined);
export const getImage = (url: string) => run<ImageRecord | undefined>(IMAGES, "readonly", (s) => s.get(url));
export const hasImage = (url: string) =>
  run<number>(IMAGES, "readonly", (s) => s.count(url)).then((n) => n > 0);
