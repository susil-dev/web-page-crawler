# Page Crawler & Summarizer (Chrome extension)

Parse the page you're on, crawl the links it contains, preview each link's topics,
then save pages to a local database, download them as Markdown, or summarize them with Claude.

## Install (no build needed)

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick the `dist` folder.
3. Pin the extension, open its **Settings** (right-click the icon → Options) and paste an
   Anthropic API key from console.anthropic.com if you want AI summaries.

## Use

- On any page, click the extension icon. A dashboard tab opens with a tree: the page you were on
  at the top, the links on it underneath (read from the live tab, so JavaScript-added links are included).
- Set **Crawl depth**: 1 = only the links on the starting page, 2 = also the links on those pages, up to 5.
  Every crawled page's links become its sub-pages in the tree, so each page's links stay grouped under it.
  A link found on several pages appears once, under the first page that linked to it.
- Duplicates are soft-linked: when a crawled address turns out to be a page already in the tree
  (it redirects there, has identical content, or declares the same canonical address and title), it shows
  as a greyed **↪ same page** row with **Go to original**. It isn't crawled further, selected or saved;
  the original's record lists it under `aliases`. Saved pages are keyed by their final address after redirects.
- Selecting: each checkbox selects just that page. On a page with sub-pages, **all** / **none** select or
  clear everything below it (not the page itself). So you can take a page without its sub-pages, a page
  with all of them, or pick a few. **Crawl selected** fetches the selected pages that aren't crawled yet.
- Pages at the depth limit show **+N links**: click it to list those links as sub-pages and pick some by hand.
- **Details** on a crawled page: excerpt, topics (h1–h3), images, AI summary, and per-page
  **Save**, **Download .md**, **Summarize & save**. The bar above the tree does the same for all selected pages.
- The **Library** tab lists everything saved, grouped by the page the crawl started from and nested
  the same way as the tree: search, view, re-summarize, delete a page or a whole group, export all as one `.md` or as JSON.

## Where data lives

- **Save** writes to IndexedDB inside the extension (database `page-crawler`): store `pages`, one
  record per URL, with the text, topics, summary, image details and where it was found (`sourceUrl`,
  `parentUrl`, `depth`). Chrome keeps it in your profile folder; it survives restarts and is deleted only
  when the extension is removed. To look at it: open the dashboard, press F12 → Application → IndexedDB.
- **Images**: details (address, alt text, caption, width/height) are always saved with the page.
  With **Keep image files** on in Settings, Save also stores each file as a Blob in the `images` store,
  Download .md writes them to a `<name>_files/` folder next to the `.md` (the Markdown links to those copies),
  and **Export JSON + image files** includes each file as a base64 `data:` URL.
- **Download .md** and the exports land in `Downloads/page-crawler/<site>/`.
- **Sign-ins and JavaScript.** Page fetches send this browser's cookies for the site. Many company apps
  instead build the page with JavaScript and sign in with tokens the page keeps itself, so a fetch comes back
  empty. **Load pages by** (Settings) handles this: *Automatic* (default) fetches first and, if the result is
  nearly empty (under 40 words) or refused (401/403), opens the page in a background tab with your full session,
  waits for it to finish rendering, reads it (shadow DOM and same-origin frames included) and closes the tab.
  Those pages are marked **rendered**. At most 2 such tabs are open at once. The start page is always read
  from the tab you clicked the icon on.
- Because crawling uses your session, links that look like sign-out/delete/approve actions are listed but
  never ticked automatically.
- Settings and API key: `chrome.storage.local`. The key is only sent to api.anthropic.com.
- **Name pages by** (Settings): the document title (`<title>`, the default), the page's first `<h1>`, or `og:title`.

## Develop

```
npm install
npm run build      # bundles src/ + static/ into dist/
npm run typecheck
```

Then press the reload icon on the extension in `chrome://extensions`.

| File | Role |
|---|---|
| `src/background.ts` | Icon click → opens the dashboard for the current tab |
| `src/dashboard.ts` | Crawl tree, crawler (parallel fetch, depth limit), library |
| `src/extract.ts` | HTML → title, description, headings, links, Markdown (Readability + Turndown) |
| `src/db.ts` | IndexedDB wrapper (`pages` and `images` stores) |
| `src/images.ts` | Fetch, store and serialize image files |
| `src/ai.ts` | Claude summary call |
| `src/markdown.ts` | Markdown export with front matter, downloads |

## Limits

- Crawls up to 5 levels deep and at most *Max pages* per run (Settings). Press Crawl selected again to continue.
- Content inside cross-origin iframes isn't captured.
- Doesn't read robots.txt. Keep crawls small and the parallel setting low on sites you don't own.
