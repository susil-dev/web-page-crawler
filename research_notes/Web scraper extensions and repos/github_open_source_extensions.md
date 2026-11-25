# Open-Source Web Scraper / Page Crawler Browser Extensions on GitHub

Method note: Repo metadata (stars, last push date, license, archived flag, language) was pulled from the GitHub REST API (`api.github.com/repos/...` and `/search/repositories`) on 2026-11-25. Manifest versions were read straight from each repo's `manifest.json` on raw.githubusercontent.com. Feature descriptions come from the repo READMEs. "Last push" is the API's `pushed_at` value, which is close to but not exactly the last commit date. The unauthenticated API rate limit cut off metadata for a few repos (nanobrowser, PageScribe, qz-browser-agent, AI-crawler-helper). For those, the figures come from the GitHub search results gathered earlier in the same session.

## Which open-source scraper/crawler extensions exist (repo, stars, activity, license, MV2/MV3, stack)?

### Takeaway
The best-known point-and-click scraper, webscraper.io, is no longer open source. Its old open code survives only as the abandoned MV2 repo `martinsbalodis/web-scraper-chrome-extension` (2018) and the active MV3 fork `ispras/web-scraper-chrome-extension`. Instant Data Scraper is proprietary, and I found no open-source GitHub clone of it. The active, high-star open-source projects in 2024–2026 are mostly capture/clipping tools (SingleFile, Obsidian Web Clipper, WebScrapBook, ArchiveWeb.page), automation tools (Automa), and AI-agent extensions (Nanobrowser). True multi-page "crawler" extensions are rare and small: Site-Viewer, moe-copy-ai, and the ispras Web Scraper fork.

### Cited Findings

**Classic point-and-click scrapers (sitemap/selector-tree model)**
- **martinsbalodis/web-scraper-chrome-extension**: the original open-source Web Scraper (webscraper.io) code. 1,363 stars, last push 2018-10-29, LGPL-3.0, JavaScript. `manifest_version: 2` with permissions `<all_urls>, tabs, notifications, storage, unlimitedStorage, downloads`. **Abandoned, and MV2 extensions no longer run in Chrome.** — [GitHub](https://github.com/martinsbalodis/web-scraper-chrome-extension); [manifest](https://raw.githubusercontent.com/martinsbalodis/web-scraper-chrome-extension/master/extension/manifest.json)
- The official webscraper.io repo (`webscraperio/web-scraper-chrome-extension`) returns 404 on the GitHub API. The official Firefox listing describes its source as "All Rights Reserved", so the current official extension is proprietary. — [GitHub API 404 / search summary](https://github.com/ispras/web-scraper-chrome-extension); [AMO Web Scraper versions](https://addons.mozilla.org/id/firefox/addon/web-scraper/versions)
- **ispras/web-scraper-chrome-extension**: a fork of the above. 288 stars, last push 2026-04-02, LGPL-3.0, JS with webpack, Babel and Jasmine. Ported to **MV3** (`src/manifest.json` with permissions `tabs, notifications, storage, unlimitedStorage, downloads, webRequest`). Features:
  - Selector types: Table (including vertical and dynamic-column tables), HTML, attribute, element-click, element-scroll-down, link-popup, image (including CSS background images), style, constants and documents.
  - Text post-processing: trim, replace, prefix, suffix, strip HTML, regex group.
  - Navigation: a pagination selector with a limit, click limits, multiple and ranged start URLs, and date/number URL patterns.
  - Throttling: a random delay between requests, a delay before each selector runs, and a delay between page visits.
  - Data: CSV and JSON Lines export, JSON import/export of sitemaps, a REST-API storage backend for sitemaps, data preview and search, and i18n.
  — [GitHub README](https://github.com/ispras/web-scraper-chrome-extension); [manifest](https://raw.githubusercontent.com/ispras/web-scraper-chrome-extension/master/src/manifest.json)
- **schasins/helena**: a Chrome extension for writing scraping and automation programs by demonstration (programming-by-demonstration research project). 267 stars, last push 2026-02-20, BSD-2-Clause, **MV3** (permissions `tabs, webRequest, storage, unlimitedStorage, system.display, system.memory, webNavigation`). — [GitHub](https://github.com/schasins/helena); [manifest](https://raw.githubusercontent.com/schasins/helena/master/src/manifest.json)
- **zizzfizzix/scrape-similar**:
  - Repo stats: 2 stars, but 439 commits and last push 2026-11-03. MIT, **MV3**.
  - Stack: WXT, Vite, React 19, TS, Tailwind, shadcn and PostHog.
  - Selectors: XPath only, through a visual hover picker that highlights matches and lets you adjust specificity.
  - Export: Google Sheets (OAuth2), XLSX, CSV, TSV and clipboard.
  - Other features: saved presets (link analysis, SEO, navigation), side panel and right-click quick scrape.
  - Browser support: tested on Chrome only so far.
  — [GitHub README](https://github.com/zizzfizzix/scrape-similar)
- **rows/X (RowsX)**: a simple business-user scraper. 104 stars, last push 2025-12-04, MIT, **MV3** (`tabs, activeTab, scripting`). — [GitHub](https://github.com/rows/X); [manifest](https://raw.githubusercontent.com/rows/X/main/manifest.json)
- Small or hobby scrapers:
  - **OnPage-Scraper**: 24 stars, MIT, last push 2025-09; visual selection plus export.
  - **peterrauscher/NextScraper**: 9 stars, MIT, last push 2025-01; extracts data from dynamically loaded pages without a headless browser.
  - **TirupMehta/webscraper-extention**: 5 stars, MIT, 2025-03.
  — [GitHub search API results](https://github.com/OnPage-Scraper/OnPage-Scraper); [NextScraper](https://github.com/peterrauscher/NextScraper)
- **cantino/selectorgadget**: the classic CSS-selector generator (click to include or exclude elements). Useful as a reference implementation of a point-and-click selector algorithm. 1,063 stars, last push 2026-11-07, MIT. — [GitHub](https://github.com/cantino/selectorgadget)
- **Instant Data Scraper** (the auto-detect-table approach) is proprietary freeware from Flavr Technology/webrobots, with about 1M Chrome users. Search found no open-source GitHub clone. Store alternatives include a Firefox add-on, "Instant Data Scraper reboot" (source status unverified), and "get-set-fetch" (described on its store listing as open source with CSV/ZIP export). — [Chrome Web Store](https://chromewebstore.google.com/detail/ofaokhiedipichpaobibbnahnkdoiiah); [AMO reboot](https://addons.mozilla.org/firefox/addon/instant-data-scraper-reboot); [get-set-fetch listing](https://chrome.google.com/webstore/detail/get-set-fetch-web-scraper/obanemoliijohdnhjjkdbekbhdjeolnk/reviews?hl=en)

**Multi-page crawlers / site explorers / link checkers**
- **Bimmr/Site-Viewer**: "Crawl, explore, and export everything from a website." 5 stars, last push 2026-11-09, no license file, **MV3** (`activeTab, tabs, scripting, storage, downloads`), JS with Vitest.
  - Crawling: gathers pages, files and media across the site.
  - Link checking: validates links and separates broken from valid ones.
  - Export: single-file HTML (page plus inlined scripts, styles and images) and asset downloads.
  - Privacy: all processing is local.
  - Not documented: crawl strategy, depth limits and throttling.
  — [GitHub](https://github.com/Bimmr/Site-Viewer); [manifest](https://raw.githubusercontent.com/Bimmr/Site-Viewer/master/manifest.json)
- **nobodxbodon/ChromeCrawlerWildSpider**: crawls by loading pages into parallel browser tabs. 6 stars, last push 2016, **MV2**. **Abandoned**, but a historical example of tab-based crawling. — [GitHub](https://github.com/nobodxbodon/ChromeCrawlerWildSpider)
- **leemark/checklinks (CheckLinks)**: a plain-JS **MV3** link checker for the current page. It sends HEAD requests with a GET fallback and annotates each link with its status. — [project page](https://leemark.github.io/checklinks/)
- **rossmoody/link-roamer**: an open-source link-collection extension. Its README notes MV2/MV3 API conflicts across separate builds. — [GitHub](https://www.github.com/rossmoody/link-roamer)
- Search found no open-source extension doing full-site SEO crawling with sitemap.xml ingestion or redirect-chain reports. The popular SEO link checkers (Check My Links and others) did not show source links. — [search summary sources](https://chrome.google.com/webstore/detail/check-my-links/ojkcdipcgfaekbeaelaapakgnjflfglf/)
- **zkqiang/crawler-chrome-extensions**: a curated list of Chrome extensions used by crawler engineers. 97 stars, **archived** (2022). — [GitHub](https://github.com/zkqiang/crawler-chrome-extensions)

**Page capture / archiving (full-page and single-file)**
- **gildas-lormeau/SingleFile**: 22,995 stars, last push 2026-11-22, AGPL-3.0 (third-party code MIT; commercial licensing available on request).
  - Manifest: the root `manifest.json` is MV2 (the Firefox build). The README links a separate MV3 repository for manual Chrome and Edge installs, and Chrome Web Store distribution exists.
  - Saving: selected, unpinned or all tabs at once, plus auto-save after page load.
  - Destinations: the downloads folder, Google Drive or GitHub.
  - Related: a companion **single-file-cli** for command-line use.
  — [GitHub](https://github.com/gildas-lormeau/SingleFile); [manifest](https://raw.githubusercontent.com/gildas-lormeau/SingleFile/main/manifest.json)
- **webrecorder/archiveweb.page**: 1,633 stars, last push 2026-11-09, AGPL-3.0, TS, **MV3** (`debugger, contextMenus, tabs, activeTab, storage, unlimitedStorage, webRequest`).
  - Capture: records network traffic through the Chrome debugging protocol (`chrome.debugger`).
  - Storage: archives live in **IndexedDB** and replay in the browser through the wabac.js service worker.
  - Builds: one source produces both the extension and an Electron app. WARC/WACZ are its formats (repo topics).
  — [GitHub](https://github.com/webrecorder/archiveweb.page); [manifest](https://raw.githubusercontent.com/webrecorder/archiveweb.page/main/src/ext/manifest.json)
- **danny0838/webscrapbook**: captures pages to the local device or a backend server (PyWebScrapBook). 1,259 stars, last push 2026-09-28, MPL-2.0. Manifest version not verified (the manifest path wasn't found). — [GitHub](https://github.com/danny0838/webscrapbook)
- **webdown-a/webdown**: saves websites as offline packages. 109 stars, last push 2026-09-30, no license. — [GitHub search](https://github.com/webdown-a/webdown)

**Markdown / clipping extensions**
- **obsidianmd/obsidian-clipper**: 5,647 stars, last push 2026-11-23, MIT, TypeScript, **MV3** (`activeTab, clipboardWrite, commands, contextMenus, sidePanel, storage, scripting, declarativeNetRequest`). Uses the same author's (kepano) **defuddle** library for main-content extraction. — [GitHub](https://github.com/obsidianmd/obsidian-clipper); [manifest](https://raw.githubusercontent.com/obsidianmd/obsidian-clipper/main/src/manifest.chrome.json)
- **kepano/defuddle**: "Get the main content of any page as Markdown." 10,169 stars, last push 2026-11-21, MIT. — [GitHub](https://github.com/kepano/defuddle)
- **deathau/markdownload**: 4,063 stars, last push 2025-06-11, Apache-2.0, still **MV2** in `src/manifest.json`. Effectively stalled on Chrome. A discussion thread (#342) records the author's intent to rewrite it for MV3. — [GitHub](https://github.com/deathau/markdownload); [manifest](https://raw.githubusercontent.com/deathau/markdownload/main/src/manifest.json); [discussion #342](https://backiee.wasmer.app/http_github_com/deathau/markdownload/discussions/342)
- MV3 forks of MarkDownload:
  - **boyvinall/marksnip**: described as an MV3 fork with Reader View.
  - **DhruvParikh1/markdownload-extension-updated**: the source of the AMO "MarkSnip" listing, which says it was updated to MV3 and is MIT-licensed.
  — [marksnip](https://github.com/boyvinall/marksnip); [AMO MarkSnip](https://addons.mozilla.org/sr/firefox/addon/marksnip-markdown-web-clipper/)
- Core libraries these extensions build on:
  - **mozilla/readability**: 11,562 stars, Apache-2.0, last push 2026-08-04.
  - **mixmark-io/turndown** (HTML to Markdown): 11,516 stars, MIT, last push 2026-11-04.
  — [readability](https://github.com/mozilla/readability); [turndown](https://github.com/mixmark-io/turndown)
- **amafjarkasi/PageScribe**: an MV3 web-to-Markdown clipper with Obsidian export and PDF parsing. 5 stars, last push 2026-11-20. — [GitHub](https://github.com/amafjarkasi/PageScribe)

**Automation / AI / LLM extractors**
- **AutomaApp/automa**: block-based browser automation ("auto-fill forms, do a repetitive task, take a screenshot, or scrape website data") with scheduling. 21,723 stars, last push 2026-03-02, dual-licensed AGPL or Automa Commercial License. Vue, **MV3** (`tabs, proxy, alarms, storage, debugger, activeTab, offscreen, webNavigation, unlimitedStorage, scripting`). Repo shows 351 open issues. — [GitHub](https://github.com/AutomaApp/automa); [manifest](https://raw.githubusercontent.com/AutomaApp/automa/main/src/manifest.chrome.json)
- **nanobrowser/nanobrowser**: an open-source multi-agent AI web-automation extension that runs in the user's logged-in browser. 14,380 stars, last push 2026-11-23, Apache-2.0, TS. — [GitHub](https://github.com/nanobrowser/nanobrowser)
- **yusixian/moe-copy-ai**: an AI web-data-extraction extension. 145 stars, last push 2026-04-03, AGPL-3.0, Plasmo, React, TS and Tailwind.
  - Extraction modes: CSS selector, Mozilla Readability, or a hybrid that picks the better result.
  - Batch crawling: collects links from a page region and filters them by domain or regex. It can follow "next page" buttons and fetch the documents using a **Fetch API, background tab, or current tab** strategy.
  - Output: HTML, Markdown or plain text, with token counts.
  - AI: OpenAI-compatible summaries through the xsAI SDK.
  - Export: JSON, with ZIP export for batch results.
  - Browsers: Chrome and Firefox.
  — [GitHub](https://github.com/yusixian/moe-copy-ai)
- **alibaba/qz-browser-agent**: a local-first AI agent for Chrome covering browser automation, web research and data extraction. 229 stars, last push 2026-11-14, Apache-2.0. — [GitHub search](https://github.com/alibaba/qz-browser-agent)
- **singhand-labs/AegisCrawler**: "Record once, replay forever" browser data-collection platform. Written in Go, with an extension component. 16 stars, last push 2026-10-30, GPL-3.0. — [GitHub](https://github.com/singhand-labs/AegisCrawler)
- **AiYeyeye/ai-crawler-helper-plugin**: a local-first MV3 extension for "deterministic web fact recording" and CDP network capture. 7 stars, last push 2026-09-03. — [GitHub search](https://github.com/AiYeyeye/ai-crawler-helper-plugin)
- Domain-specific MV3 scrapers active in 2026 (useful mainly as small MV3 code samples):
  - **ozhehkovski/geoleadscraper**: Google Maps, 82 stars, MIT.
  - **uppifyagency/ghostmap**: Google Maps, 27 stars, MIT.
  - **iScale-Builders/iscale-etsy**: batch scrape jobs, 22 stars, MIT.
  — [GitHub topic search](https://github.com/ozhehkovski/geoleadscraper)

### Inferences
- There is a gap in the ecosystem: no actively maintained, popular, permissively licensed (MIT/Apache) extension combines a point-and-click selector, a same-domain multi-page crawl queue, and Markdown/structured export.
  - The closest feature matches are ispras Web Scraper (LGPL, sitemap model) and moe-copy-ai (AGPL, AI and Markdown focus).
  - SingleFile, ArchiveWeb.page, Automa and moe-copy-ai are copyleft (AGPL). Copying their code would bind a new project to AGPL terms. Treat them as design references rather than code sources, unless AGPL is acceptable.
  - MIT/Apache-licensed building blocks to reuse: defuddle, Readability, Turndown, selectorgadget and Obsidian Web Clipper.
- Stars are a poor proxy for maintenance here. scrape-similar (2 stars) is very active, while martinsbalodis (1.3k stars) is dead.

### Gaps
- Exact last-commit dates (as opposed to `pushed_at`) and star counts for nanobrowser, PageScribe, qz-browser-agent and AI-crawler-helper could not be re-verified individually because of the GitHub API rate limit. Their values come from search results in the same session.
- The WebScrapBook and selectorgadget manifest versions were not verified.
- The SingleFile Chrome MV3 repo name was not confirmed. The README only links "a separate MV3 repository."
- I found no open-source source for Instant Data Scraper, Data Miner, Simplescraper, Easy Scraper or Check My Links. They appear to be proprietary.
- I did not separately verify Firefox-only scrapers or the Reddit/HN discussions.

## Features: selectors, crawling, pagination, export, storage, dynamic pages, throttling, capture, Markdown

### Takeaway
Three selector paradigms dominate:
1. A sitemap/selector tree with typed selectors (Web Scraper/ispras).
2. A visual hover picker that generalizes to "similar" elements, using XPath (scrape-similar) or CSS (selectorgadget).
3. Readability/defuddle-style automatic main-content detection for Markdown (Obsidian Clipper, MarkDownload, moe-copy-ai).

Multi-page crawling in open-source extensions is shallow. Pagination selectors, URL ranges/patterns and link-region collection with domain/regex filters are common. Depth limits and robots.txt handling were not documented in any repo reviewed.

### Cited Findings
- **Typed selectors and dynamic pages (ispras Web Scraper).** It handles dynamic pages with element-click and element-scroll-down selectors plus configurable delays: random delay between requests, delay before a selector runs, and delay between page visits. Pagination uses a pagination selector with a limit. Export is CSV or JSON Lines, and sitemaps can be stored through a REST API. — [ispras README](https://github.com/ispras/web-scraper-chrome-extension)
- **Original Web Scraper (MV2).** It used `unlimitedStorage` and `downloads` permissions. — [manifest](https://raw.githubusercontent.com/martinsbalodis/web-scraper-chrome-extension/master/extension/manifest.json)
- **Visual XPath picker (scrape-similar).** Hover shows real-time match highlighting with adjustable specificity. Configs persist through WebExtension storage via WXT storage. Export goes to Google Sheets, XLSX, CSV or TSV. — [scrape-similar README](https://github.com/zizzfizzix/scrape-similar)
- **Multi-page link collection (moe-copy-ai).** It collects links from a selected region with domain and regex filters and follows "next page" buttons. It offers three fetch strategies (Fetch API, background tab, current tab) and exports a ZIP for batch results. — [moe-copy-ai README](https://github.com/yusixian/moe-copy-ai)
- **Site-wide crawl (Site-Viewer).** Its crawl reports broken versus valid links and exports single-file HTML. Crawl limits and throttling are not documented. — [Site-Viewer README](https://github.com/Bimmr/Site-Viewer)
- **Full-page capture.** SingleFile inlines resources into one HTML file and can batch-save tabs or auto-save on load. ArchiveWeb.page captures network traffic through CDP into IndexedDB (WARC/WACZ). Automa has a screenshot capability. — [SingleFile](https://github.com/gildas-lormeau/SingleFile); [ArchiveWeb.page](https://github.com/webrecorder/archiveweb.page); [Automa](https://github.com/AutomaApp/automa)
- **Markdown conversion.** The common stack is Readability or defuddle for main-content extraction followed by Turndown for HTML-to-Markdown. Obsidian Clipper uses defuddle; moe-copy-ai uses Readability. — [defuddle](https://github.com/kepano/defuddle); [turndown](https://github.com/mixmark-io/turndown); [moe-copy-ai](https://github.com/yusixian/moe-copy-ai)
- **Link checking.** CheckLinks sends HEAD requests with a GET fallback from an MV3 extension. — [CheckLinks](https://leemark.github.io/checklinks/)
- **Storage choices observed.**
  - `chrome.storage` together with the `unlimitedStorage` permission: ispras, Automa, ArchiveWeb.page and Helena.
  - IndexedDB for large archives: ArchiveWeb.page.
  - Remote backends: ispras REST API; SingleFile uploads to Google Drive or GitHub; WebScrapBook writes to a backend server.
  — manifests linked above; [ArchiveWeb.page](https://github.com/webrecorder/archiveweb.page); [WebScrapBook](https://github.com/danny0838/webscrapbook)

### Inferences
- robots.txt compliance, crawl-depth limits and same-origin enforcement look like differentiators a new extension could offer, since none of the reviewed READMEs document them.
- The "Fetch vs background tab vs current tab" choice in moe-copy-ai is a good template. Fetch is fast but sees only server-rendered HTML; tabs render JavaScript but cost far more resources.

### Gaps
- I did not read the source code to confirm how each repo implements its queue or throttling internally. Findings are README-level only.
- The pagination and export block details in Automa were not on the README page.

## MV3 architectural patterns and pitfalls

### Takeaway
The MV3 service worker is ephemeral: it is killed after 30 seconds idle, after 5 minutes on a single event, or when a fetch response takes more than 30 seconds. Crawl state must therefore persist in `chrome.storage` or IndexedDB, and long crawls must be resumable. Service workers have no DOM. HTML fetched there must be parsed in an offscreen document (`DOM_PARSER` / `DOM_SCRAPING`) or a tab or content script.

### Cited Findings
- **Termination rules.** Chrome terminates an extension service worker after 30 seconds of inactivity. Events and extension API calls reset the timer (Chrome 110+). A single request running more than 5 minutes, or a `fetch()` response taking more than 30 seconds, also triggers termination. — [Chrome docs: SW lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- **What keeps the worker alive, by Chrome version.**
  - 105: active native messaging.
  - 109: messages from an offscreen document reset the timers.
  - 114: messaging over long-lived ports keeps it alive, but merely opening a port no longer does.
  - 116: active WebSockets extend the lifetime.
  - 118: active `chrome.debugger` sessions keep it alive.
  - 120: `chrome.alarms` minimum period dropped to 30 seconds.
  — [Chrome docs: SW lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- **State guidance.** Chrome says to design for unexpected termination and keep state in extension storage, not globals. — [Chrome docs: SW lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- **Offscreen API.**
  - Reasons include `DOM_PARSER` (use DOMParser), `DOM_SCRAPING` (embed an iframe and scrape its DOM), `IFRAME_SCRIPTING`, `BLOBS`, `CLIPBOARD`, `WORKERS` and `LOCAL_STORAGE`.
  - Limits: one offscreen document per extension at a time, and its URL must be a bundled static HTML file.
  - API access: `chrome.runtime` messaging only.
  - Availability: listed from Chrome 109; `runtime.getContexts()` needs Chrome 116.
  - The docs say service workers can write to the clipboard directly from Chrome 157 with `clipboardWrite`.
  — [Chrome docs: offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
- **CDP-based capture.** ArchiveWeb.page (MV3) relies on the `debugger` permission and CDP to capture network traffic. Combined with the Chrome 118 rule, an active debugger session also keeps the service worker alive. — [ArchiveWeb.page manifest](https://raw.githubusercontent.com/webrecorder/archiveweb.page/main/src/ext/manifest.json); [SW lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- **Automa's permissions.** Automa's MV3 manifest combines `offscreen`, `alarms`, `debugger`, `scripting`, `webNavigation` and `unlimitedStorage`, a representative permission set for a long-running workflow or scraper engine. — [Automa manifest](https://raw.githubusercontent.com/AutomaApp/automa/main/src/manifest.chrome.json)
- **Narrower permission sets.** Obsidian Clipper uses `activeTab`, `scripting`, `sidePanel` and `declarativeNetRequest`; Site-Viewer and RowsX use `scripting` and `tabs`. — [Obsidian manifest](https://raw.githubusercontent.com/obsidianmd/obsidian-clipper/main/src/manifest.chrome.json); [Site-Viewer manifest](https://raw.githubusercontent.com/Bimmr/Site-Viewer/master/manifest.json)
- **MV2-to-MV3 porting debt.** MarkDownload remains MV2, and its MV3 continuation happened in forks (MarkSnip). Link Roamer's README cites MV2/MV3 API conflicts across builds. — [markdownload manifest](https://raw.githubusercontent.com/deathau/markdownload/main/src/manifest.json); [marksnip](https://github.com/boyvinall/marksnip); [link-roamer](https://www.github.com/rossmoody/link-roamer)
- **Framework choice.** The modern repos use extension frameworks: WXT (scrape-similar) and Plasmo (moe-copy-ai). Older ones use plain webpack (ispras, Automa, ArchiveWeb.page). — [scrape-similar](https://github.com/zizzfizzix/scrape-similar); [moe-copy-ai](https://github.com/yusixian/moe-copy-ai); [ispras](https://github.com/ispras/web-scraper-chrome-extension)

### Inferences
- A robust MV3 crawler design:
  - Persist the URL queue and visited set in `chrome.storage.local` or IndexedDB.
  - Drive work with `chrome.alarms` (30-second minimum) or event-chained fetches.
  - Parse fetched HTML in a single offscreen document (`DOM_PARSER`).
  - Fall back to `chrome.tabs.create` plus `chrome.scripting.executeScript` only for JavaScript-rendered pages.
- Per-fetch timeouts should stay well under 30 seconds (for example, use `AbortController`) to avoid service-worker termination mid-request.
- The single-offscreen-document limit means the offscreen page should act as a shared parsing worker that handles messages concurrently, not one document per URL.
- Using `chrome.debugger` (CDP) brings extra power (network capture, full-page screenshots) and a keep-alive side effect. It also shows a visible "is debugging this browser" banner and adds Web Store review scrutiny. That last point is general knowledge and was not verified in this session.

### Gaps
- I did not inspect the source of the reviewed repos to document their specific keep-alive or queue-resumption code.
- I found no README in this set that documents robots.txt or crawl-delay handling.
- I did not research Firefox MV3 differences (event pages instead of service workers).
